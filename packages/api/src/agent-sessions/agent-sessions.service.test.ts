import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AgentSessionService } from "./agent-sessions.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { PricingService } from "../pricing/pricing.service.js";

function makePrisma() {
  return {
    client: {
      user: { upsert: vi.fn().mockResolvedValue({ id: "u1", username: "alice" }) },
      agentSession: {
        upsert: vi.fn().mockResolvedValue({ id: "as1", tool: "claude_code", sessionId: "s1", lastUpdatedAt: new Date() }),
        findMany: vi.fn().mockResolvedValue([{ id: "as1", costUsd: 0.0008, user: { username: "alice" } }]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue({ id: "as1", rawPayload: { a: 1 } }),
      },
    },
  } as unknown as PrismaService;
}

const payload = {
  tool: "claude-code" as const, sessionId: "s1", gitUsername: "alice", model: "m",
  inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, costUsd: null, toolCallCount: 2,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("AgentSessionService", () => {
  let prisma: PrismaService;
  let pricing: PricingService;
  let svc: AgentSessionService;
  beforeEach(() => { 
    prisma = makePrisma(); 
    pricing = {
      calculateCost: vi.fn().mockResolvedValue(0.123),
      getBaseTokenRate: vi.fn().mockResolvedValue(0.0000008),
      toBaseTokens: vi.fn((cost: number | null, rate: number | null) =>
        cost == null || rate == null || rate <= 0 ? null : cost / rate),
    } as unknown as PricingService;
    svc = new AgentSessionService(prisma, pricing); 
  });

  it("upsert maps wire tool to enum and find-or-creates user", async () => {
    await svc.upsert(payload);
    expect((prisma as any).client.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: "alice" }, create: { username: "alice" } }),
    );
    const call = (prisma as any).client.agentSession.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ tool_sessionId: { tool: "claude_code", sessionId: "s1" } });
    expect(call.create.startedAt).toBeInstanceOf(Date);
    expect(call.update.startedAt).toBeUndefined();
    expect(call.create.rawPayload).toEqual({});
    expect(pricing.calculateCost).toHaveBeenCalledWith("m", 1, 1, 0, 0);
    expect(call.create.costUsd).toBe(0.123);
  });

  it("list filters by tool, returns rows + total", async () => {
    const res = await svc.list({ tool: "claude-code", limit: 50, offset: 0 });
    const args = (prisma as any).client.agentSession.findMany.mock.calls[0][0];
    expect(args.where.tool).toBe("claude_code");
    expect(args.orderBy).toEqual({ lastUpdatedAt: "desc" });
    expect(res.total).toBe(1);
    expect(res.rows[0]).toMatchObject({ id: "as1", costUsd: 0.0008, user: { username: "alice" } });
    expect(res.rows[0].baseTokens).toBeCloseTo(1000, 6);
  });

  it("list sets baseTokens to null when base rate unavailable", async () => {
    (pricing.getBaseTokenRate as any).mockResolvedValue(null);
    const res = await svc.list({ limit: 50, offset: 0 });
    expect(res.rows[0].baseTokens).toBeNull();
  });

  it("get returns row with rawPayload", async () => {
    expect(await svc.get("as1")).toMatchObject({ id: "as1", rawPayload: { a: 1 } });
  });

  it("get throws NotFound when missing", async () => {
    (prisma as any).client.agentSession.findUnique.mockResolvedValueOnce(null);
    await expect(svc.get("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
