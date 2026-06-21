import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { WebhooksController } from "./webhooks.controller.js";
import { WebhooksService } from "./webhooks.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { QUEUE_TOKEN } from "../common/queue.module.js";

const mockPrisma = {
  client: {
    job: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "job-1" }),
    },
  },
};
const mockQueue = { add: vi.fn().mockResolvedValue({ id: "q-1" }) };

const BOT_ID = "bot-account-1";
const SECRET = "test-secret";

// Inject config via env vars for test
process.env["API_WEBHOOK_SECRET"] = SECRET;
process.env["JIRA_BOT_ACCOUNT_ID"] = BOT_ID;
process.env["DATABASE_URL"] = "postgresql://test:test@localhost/test";
process.env["REDIS_URL"] = "redis://localhost:6379";
process.env["APP_ENCRYPTION_KEY"] = "01234567890123456789012345678901";
process.env["ANTHROPIC_API_KEY"] = "test-key";
process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
process.env["PUBLIC_BASE_URL"] = "http://localhost:3000";
process.env["MAX_CONCURRENT_AGENTS"] = "4";
process.env["MAX_RETRIES"] = "3";
process.env["APPROVAL_TIMEOUT_MS"] = "300000";
process.env["DASHBOARD_API_TOKEN"] = "test-dashboard-token";

describe("WebhooksController", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QUEUE_TOKEN, useValue: mockQueue },
      ],
    }).compile();

    app = module.createNestApplication(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => { await app?.close(); });

  const jiraPayload = {
    webhookEvent: "jira:issue_updated",
    timestamp: 999,
    issue: {
      key: "JAGIT-7",
      fields: {
        project: { key: "JAGIT" },
        issuetype: { name: "Bug" },
        summary: "Fix login",
        description: "",
        assignee: { accountId: BOT_ID },
      },
    },
  };

  it("POST /webhooks/jira → 202 and enqueues", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/jira",
      headers: { "x-jagit-secret": SECRET, "content-type": "application/json" },
      payload: jiraPayload,
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toMatchObject({ jobId: "job-1" });
    expect(mockQueue.add).toHaveBeenCalledOnce();
  });

  it("rejects wrong secret → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/jira",
      headers: { "x-jagit-secret": "wrong", "content-type": "application/json" },
      payload: jiraPayload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("ignores non-bot assignment → 200 ignored", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/jira",
      headers: { "x-jagit-secret": SECRET, "content-type": "application/json" },
      payload: { ...jiraPayload, issue: { ...jiraPayload.issue,
        fields: { ...jiraPayload.issue.fields, assignee: { accountId: "someone-else" } } } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ignored: true });
  });
});
