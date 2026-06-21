import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { SessionMcpService } from "./session-mcp.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { NotFoundException, ConflictException } from "@nestjs/common";

const mockPrisma = {
  client: {
    agentSession: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
};

describe("SessionMcpService", () => {
  let service: SessionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SessionMcpService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(SessionMcpService);
  });

  describe("activateJira", () => {
    it("should successfully associate a Jira ticket", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: null });
      mockPrisma.client.agentSession.update.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-123" });

      const result = await service.activateJira("s1", "testuser", "PROJ-123");

      expect(result.success).toBe(true);
      expect(result.jiraTicketId).toBe("PROJ-123");
      expect(mockPrisma.client.agentSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { jiraTicketId: "PROJ-123" },
        select: { id: true, sessionId: true, jiraTicketId: true },
      });
    });

    it("should throw NotFoundException if session not found", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue(null);

      await expect(service.activateJira("s1", "testuser", "PROJ-123")).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException if already associated with a DIFFERENT ticket", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-456" });

      await expect(service.activateJira("s1", "testuser", "PROJ-123")).rejects.toThrow(ConflictException);
    });

    it("should be idempotent if already associated with the SAME ticket", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-123" });
      mockPrisma.client.agentSession.update.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-123" });

      const result = await service.activateJira("s1", "testuser", "PROJ-123");

      expect(result.success).toBe(true);
    });
  });
});