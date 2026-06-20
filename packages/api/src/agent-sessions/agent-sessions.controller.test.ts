import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AgentSessionController } from "./agent-sessions.controller.js";
import { AgentSessionService } from "./agent-sessions.service.js";
import { PrismaService } from "../common/prisma.module.js";

const mockSvc = {
  upsert: vi.fn().mockResolvedValue({ id: "as1", tool: "claude_code", sessionId: "s1", lastUpdatedAt: new Date("2026-06-20T10:00:00.000Z") }),
  list: vi.fn().mockResolvedValue({ rows: [{ id: "as1" }], total: 1 }),
  get: vi.fn().mockResolvedValue({ id: "as1", rawPayload: {} }),
};

const validBody = {
  tool: "claude-code", sessionId: "s1", gitUsername: "alice", model: "m",
  inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, costUsd: null, toolCallCount: 2,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("AgentSessionController", () => {
  let app: NestFastifyApplication;
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [AgentSessionController],
      providers: [
        { provide: AgentSessionService, useValue: mockSvc },
        { provide: PrismaService, useValue: { client: {} } },
      ],
    }).compile();
    app = mod.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app?.close(); });

  const auth = { authorization: "Bearer test-dashboard-token" };

  it("POST without auth → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent-sessions", payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it("POST with auth + valid body → 201 with wire tool", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent-sessions", headers: auth, payload: validBody });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ id: "as1", tool: "claude-code", sessionId: "s1" });
    expect(mockSvc.upsert).toHaveBeenCalledWith(expect.objectContaining({ tool: "claude-code" }));
  });

  it("POST with invalid body → 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent-sessions", headers: auth, payload: { ...validBody, tool: "cursor" } });
    expect(res.statusCode).toBe(400);
  });

  it("GET list with auth → rows + total", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agent-sessions?tool=claude-code&limit=10", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ rows: [{ id: "as1" }], total: 1 });
    expect(mockSvc.list).toHaveBeenCalledWith(expect.objectContaining({ tool: "claude-code", limit: 10, offset: 0 }));
  });

  it("GET by id with auth → row", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agent-sessions/as1", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ id: "as1" });
  });
});
