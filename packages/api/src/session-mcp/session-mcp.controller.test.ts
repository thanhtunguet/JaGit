import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { BadRequestException, NotFoundException, ConflictException } from "@nestjs/common";

const mockSvc = {
  activateJira: vi.fn(),
};

describe("SessionMcpController", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [SessionMcpController],
      providers: [
        { provide: SessionMcpService, useValue: mockSvc },
        { provide: PrismaService, useValue: { client: {} } },
      ],
    }).compile();

    app = module.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("POST /api/session-mcp", () => {
    const validHeaders = { "x-git-username": "testuser", authorization: "Bearer test-dashboard-token" };
    const validBody = { name: "activate-jira", arguments: { ticketId: "PROJ-123", sessionId: "test-session-1" } };

    it("should successfully associate Jira ticket", async () => {
      mockSvc.activateJira.mockResolvedValue({
        success: true,
        sessionId: "test-session-1",
        jiraTicketId: "PROJ-123",
        message: "Jira ticket associated with session",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: validBody,
      });

      expect(res.statusCode).toBe(201); // NestJS defaults to 201 for POST
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.jiraTicketId).toBe("PROJ-123");
      expect(mockSvc.activateJira).toHaveBeenCalledWith("test-session-1", "testuser", "PROJ-123");
    });

    it("should reject if no x-git-username header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: { authorization: "Bearer test-dashboard-token" }, // missing x-git-username
        payload: validBody,
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject if unknown tool name", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: { ...validBody, name: "other-tool" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject if arguments are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: { name: "activate-jira", arguments: { ticketId: "PROJ-123" } }, // missing sessionId
      });

      expect(res.statusCode).toBe(400);
    });

    it("should return 404 for non-existent session or wrong user", async () => {
      mockSvc.activateJira.mockRejectedValue(new NotFoundException());

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: validBody,
      });

      expect(res.statusCode).toBe(404);
    });

    it("should return 409 if already associated with different ticket", async () => {
      mockSvc.activateJira.mockRejectedValue(new ConflictException());

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: validBody,
      });

      expect(res.statusCode).toBe(409);
    });
  });
});