import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { SessionMcpService } from "./session-mcp.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { PricingService } from "../pricing/pricing.service.js";
import { NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import * as jiraWorklog from "@jagit/shared";

vi.mock("@jagit/shared", async () => {
  const actual = await vi.importActual<typeof import("@jagit/shared")>("@jagit/shared");
  return {
    ...actual,
    createJiraWorklog: vi.fn(),
  };
});

const mockPrisma = {
  client: {
    agentSession: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
};

const mockPricing = {
  getBaseTokenRate: vi.fn(),
  toBaseTokens: vi.fn(),
};

describe("SessionMcpService", () => {
  let service: SessionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SessionMcpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PricingService, useValue: mockPricing },
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

    it("should resolve the user's most recently active session when sessionId is omitted", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s9", jiraTicketId: null });
      mockPrisma.client.agentSession.update.mockResolvedValue({ id: "session-1", sessionId: "s9", jiraTicketId: "PROJ-123" });

      const result = await service.activateJira(undefined, "testuser", "PROJ-123");

      expect(mockPrisma.client.agentSession.findFirst).toHaveBeenCalledWith({
        where: { user: { username: "testuser" } },
        orderBy: { lastUpdatedAt: "desc" },
      });
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe("s9");
    });

    it("should throw NotFoundException when sessionId is omitted and the user has no session", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue(null);

      await expect(service.activateJira(undefined, "testuser", "PROJ-123")).rejects.toThrow(NotFoundException);
    });
  });

  describe("logWork", () => {
    it("computes hoursLogged from costUsd and delegates to createJiraWorklog", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: 33.75, // half of 67.5 -> 4 hours
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(0.000001);
      mockPricing.toBaseTokens.mockReturnValue(33750000);
      vi.mocked(jiraWorklog.createJiraWorklog).mockResolvedValue({ success: true });

      const result = await service.logWork("s1", "testuser");

      expect(result).toEqual({
        success: true,
        ticketId: "PROJ-123",
        hoursLogged: 4,
        baseTokens: 33750000,
      });
      expect(jiraWorklog.createJiraWorklog).toHaveBeenCalledWith({
        ticketId: "PROJ-123",
        durationMs: 4 * 3600 * 1000,
        baseTokens: 33750000,
      });
    });

    it("resolves the user's most recently active session when sessionId is omitted", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s9",
        jiraTicketId: "PROJ-123",
        costUsd: 67.5,
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(0.000001);
      mockPricing.toBaseTokens.mockReturnValue(67500000);
      vi.mocked(jiraWorklog.createJiraWorklog).mockResolvedValue({ success: true });

      const result = await service.logWork(undefined, "testuser");

      expect(mockPrisma.client.agentSession.findFirst).toHaveBeenCalledWith({
        where: { user: { username: "testuser" } },
        orderBy: { lastUpdatedAt: "desc" },
      });
      expect(result.hoursLogged).toBe(8);
    });

    it("throws NotFoundException when no session is found", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue(null);

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when the session has no jiraTicketId", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: null,
        costUsd: 10,
      });

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(BadRequestException);
      await expect(service.logWork("s1", "testuser")).rejects.toThrow(/activate-jira/);
    });

    it("throws BadRequestException when the session has no costUsd", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: null,
      });

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the base token rate is unavailable", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: 10,
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(null);

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when toBaseTokens returns null", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: 67.5,
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(0.000001);
      mockPricing.toBaseTokens.mockReturnValue(null);

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(BadRequestException);
    });

    it("surfaces success:false from createJiraWorklog without throwing", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: 67.5,
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(0.000001);
      mockPricing.toBaseTokens.mockReturnValue(67500000);
      vi.mocked(jiraWorklog.createJiraWorklog).mockResolvedValue({ success: false, reason: "Jira API error: 401" });

      const result = await service.logWork("s1", "testuser");

      expect(result).toEqual({
        success: false,
        ticketId: "PROJ-123",
        hoursLogged: 8,
        baseTokens: 67500000,
        reason: "Jira API error: 401",
      });
    });
  });
});
