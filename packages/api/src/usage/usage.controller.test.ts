import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import { UsageController } from "./usage.controller.js";
import { UsageService } from "./usage.service.js";
import { PrismaService } from "../common/prisma.module.js";

const mockUsageService = {
  listUsers: vi.fn().mockResolvedValue([{ id: "u1", username: "alice", createdAt: new Date(), _count: { uploads: 2 } }]),
  getUserUploads: vi.fn().mockResolvedValue([{ id: "up1", userId: "u1", period: "30days", uploadedAt: new Date(), data: {} }]),
  getLatestUpload: vi.fn().mockResolvedValue({ id: "up1", userId: "u1", period: "30days", uploadedAt: new Date(), data: { summary: [] } }),
  deleteUser: vi.fn().mockResolvedValue({ deleted: true }),
  uploadUsageData: vi.fn().mockResolvedValue({ userId: "u1", uploadId: "up1", uploadedAt: new Date(), filesProcessed: ["summary.csv"] }),
};

const mockPrisma = { client: {} };

describe("UsageController", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [UsageController],
      providers: [
        { provide: UsageService, useValue: mockUsageService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    app = module.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await app.register(multipart);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => { await app?.close(); });

  it("GET /api/usage/users → 200 with users list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usage/users" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].username).toBe("alice");
  });

  it("GET /api/usage/users/alice/latest → 200 with latest upload", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usage/users/alice/latest" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty("id", "up1");
  });

  it("DELETE /api/usage/users/alice without auth → 401", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/usage/users/alice" });
    expect(res.statusCode).toBe(401);
  });

  it("DELETE /api/usage/users/alice with auth → 200", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/usage/users/alice",
      headers: { authorization: "Bearer test-dashboard-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ deleted: true });
  });

  it("POST /api/usage/upload with auth → captures username from form field", async () => {
    const boundary = "----jagit-test-boundary";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="username"',
      "",
      "alice",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="usage.zip"',
      "Content-Type: application/zip",
      "",
      "fake-zip-bytes",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const res = await app.inject({
      method: "POST",
      url: "/api/usage/upload",
      headers: {
        authorization: "Bearer test-dashboard-token",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    expect(mockUsageService.uploadUsageData).toHaveBeenCalledWith("alice", expect.any(Buffer));
  });

  it("POST /api/usage/upload without auth → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/usage/upload" });
    expect(res.statusCode).toBe(401);
  });
});