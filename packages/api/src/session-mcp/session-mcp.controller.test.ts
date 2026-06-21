import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { NotFoundException, ConflictException } from "@nestjs/common";

const mockSvc = {
  activateJira: vi.fn(),
};

// Helper to build a valid MCP JSON-RPC request body
function mcpRequest(method: string, params: Record<string, unknown> = {}, id: number | string = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

describe("SessionMcpController — MCP Protocol", () => {
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

  const validHeaders = { "x-git-username": "testuser", authorization: "Bearer test-dashboard-token" };

  describe("MCP tools/list", () => {
    it("should list activate-jira tool with correct schema", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/list"),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.result).toBeDefined();
      expect(body.result.tools).toBeInstanceOf(Array);
      const tool = body.result.tools.find((t: { name: string }) => t.name === "activate-jira");
      expect(tool).toBeDefined();
      expect(tool.description).toContain("Jira");
      expect(tool.inputSchema.properties.ticketId).toBeDefined();
      expect(tool.inputSchema.properties.sessionId).toBeDefined();
    });
  });

  describe("MCP tools/call activate-jira", () => {
    it("should return CallToolResult on success", async () => {
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
        payload: mcpRequest("tools/call", {
          name: "activate-jira",
          arguments: { ticketId: "PROJ-123", sessionId: "test-session-1" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.result).toBeDefined();
      expect(body.result.content).toBeInstanceOf(Array);
      expect(body.result.content[0].type).toBe("text");
      const text = body.result.content[0].text;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.jiraTicketId).toBe("PROJ-123");
    });

    it("should return isError:true for non-existent session (not HTTP 404)", async () => {
      mockSvc.activateJira.mockRejectedValue(new NotFoundException("Session not found"));

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "activate-jira",
          arguments: { ticketId: "PROJ-123", sessionId: "missing" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].type).toBe("text");
      expect(body.result.content[0].text).toContain("not found");
    });

    it("should return isError:true for ticket conflict (not HTTP 409)", async () => {
      mockSvc.activateJira.mockRejectedValue(new ConflictException("Already associated"));

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "activate-jira",
          arguments: { ticketId: "PROJ-123", sessionId: "test-session-1" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("Already");
    });

    it("should return MCP error for unknown tool", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "unknown-tool",
          arguments: {},
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32601); // Method not found
    });
  });

  describe("Transport-level guards (unchanged)", () => {
    it("should reject with HTTP 401 if no auth header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: { "x-git-username": "testuser" }, // missing auth
        payload: mcpRequest("tools/list"),
      });

      expect(res.statusCode).toBe(401);
    });

    it("should reject with HTTP 400 if missing x-git-username", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: { authorization: "Bearer test-dashboard-token" }, // missing username
        payload: mcpRequest("tools/list"),
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
