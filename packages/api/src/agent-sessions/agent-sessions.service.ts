import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { PricingService } from "../pricing/pricing.service.js";
import type { AgentSessionPayload } from "@jagit/agent-reporter";

const TOOL_WIRE_TO_ENUM: Record<AgentSessionPayload["tool"], "claude_code" | "codex" | "copilot"> = {
  "claude-code": "claude_code",
  codex: "codex",
  copilot: "copilot",
};

export interface ListFilters {
  tool?: AgentSessionPayload["tool"];
  username?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

@Injectable()
export class AgentSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async upsert(payload: AgentSessionPayload) {
    const tool = TOOL_WIRE_TO_ENUM[payload.tool];
    const user = await this.prisma.client.user.upsert({
      where: { username: payload.gitUsername },
      create: { username: payload.gitUsername },
      update: {},
    });

    const raw = (payload.rawPayload ?? {}) as object;
    const cacheCreationInputTokens = payload.cacheCreationInputTokens ?? 0;
    let costUsd = payload.costUsd;
    if (costUsd === undefined || costUsd === null) {
      costUsd = await this.pricing.calculateCost(
        payload.model,
        payload.inputTokens,
        payload.outputTokens,
        payload.cachedInputTokens,
        cacheCreationInputTokens,
      ) ?? null;
    }

    const common = {
      model: payload.model,
      inputTokens: payload.inputTokens,
      cachedInputTokens: payload.cachedInputTokens,
      cacheCreationInputTokens,
      outputTokens: payload.outputTokens,
      costUsd: costUsd,
      toolCallCount: payload.toolCallCount,
      rawPayload: raw as never,
    };

    return this.prisma.client.agentSession.upsert({
      where: { tool_sessionId: { tool, sessionId: payload.sessionId } },
      create: {
        tool,
        sessionId: payload.sessionId,
        userId: user.id,
        startedAt: new Date(payload.startedAt),
        ...common,
      },
      update: { ...common },
      select: { id: true, tool: true, sessionId: true, lastUpdatedAt: true },
    });
  }

  async list(filters: ListFilters) {
    const where: Record<string, unknown> = {};
    if (filters.tool) where.tool = TOOL_WIRE_TO_ENUM[filters.tool];
    if (filters.username) where.user = { username: filters.username };
    if (filters.from || filters.to) {
      where.lastUpdatedAt = {
        ...(filters.from ? { gte: new Date(filters.from.includes('T') ? filters.from : `${filters.from}T00:00:00.000Z`) } : {}),
        ...(filters.to ? { lte: new Date(filters.to.includes('T') ? filters.to : `${filters.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [baseRate, rows, total] = await Promise.all([
      this.pricing.getBaseTokenRate(),
      this.prisma.client.agentSession.findMany({
        where: where as any,
        orderBy: { lastUpdatedAt: "desc" },
        take: filters.limit,
        skip: filters.offset,
        include: { user: { select: { username: true } } },
      }),
      this.prisma.client.agentSession.count({ where: where as any }),
    ]);
    const rowsWithBt = rows.map((r) => ({
      ...r,
      baseTokens: this.pricing.toBaseTokens(r.costUsd, baseRate),
    }));
    return { rows: rowsWithBt, total };
  }

  async aggregate(filters: Omit<ListFilters, "limit" | "offset">) {
    const where: Record<string, unknown> = {};
    if (filters.tool) where.tool = TOOL_WIRE_TO_ENUM[filters.tool];
    if (filters.username) where.user = { username: filters.username };
    if (filters.from || filters.to) {
      where.lastUpdatedAt = {
        ...(filters.from ? { gte: new Date(filters.from.includes('T') ? filters.from : `${filters.from}T00:00:00.000Z`) } : {}),
        ...(filters.to ? { lte: new Date(filters.to.includes('T') ? filters.to : `${filters.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [byUserRaw, byModelRaw, byToolRaw, tokensAgg, missingCostCount] = await Promise.all([
      this.prisma.client.agentSession.groupBy({
        by: ["userId"],
        _sum: { costUsd: true },
        where: where as any,
      }),
      this.prisma.client.agentSession.groupBy({
        by: ["model"],
        _sum: {
          costUsd: true,
          inputTokens: true,
          cachedInputTokens: true,
          cacheCreationInputTokens: true,
          outputTokens: true,
        },
        where: where as any,
      }),
      this.prisma.client.agentSession.groupBy({
        by: ["tool"],
        _sum: { costUsd: true },
        where: where as any,
      }),
      this.prisma.client.agentSession.aggregate({
        _sum: {
          inputTokens: true,
          cachedInputTokens: true,
          cacheCreationInputTokens: true,
          outputTokens: true,
          costUsd: true,
        },
        where: where as any,
      }),
      this.prisma.client.agentSession.count({
        where: { ...where, costUsd: null } as any,
      }),
    ]);

    const userIds = byUserRaw.map((u) => u.userId);
    const users = await this.prisma.client.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    const byUser = byUserRaw
      .map((u) => ({
        username: userMap.get(u.userId) ?? "unknown",
        costUsd: u._sum.costUsd ?? 0,
      }))
      .filter((u) => u.costUsd > 0)
      .sort((a, b) => b.costUsd - a.costUsd);

    const byModel = byModelRaw
      .map((m) => ({
        model: m.model,
        costUsd: m._sum.costUsd ?? 0,
      }))
      .filter((m) => m.costUsd > 0)
      .sort((a, b) => b.costUsd - a.costUsd);

    const byTool = byToolRaw
      .map((t) => ({
        tool: t.tool,
        costUsd: t._sum.costUsd ?? 0,
      }))
      .filter((t) => t.costUsd > 0)
      .sort((a, b) => b.costUsd - a.costUsd);

    const totalTokens = {
      newInput: (tokensAgg._sum.inputTokens ?? 0) + (tokensAgg._sum.cacheCreationInputTokens ?? 0),
      cachedInput: tokensAgg._sum.cachedInputTokens ?? 0,
      output: tokensAgg._sum.outputTokens ?? 0,
    };

    const totalCostUsd = tokensAgg._sum.costUsd ?? 0;

    const baseRate = await this.pricing.getBaseTokenRate();
    let baseTokens: { input: number; output: number; total: number } | null = null;
    if (baseRate != null) {
      let inputUsd = 0;
      let outputUsd = 0;
      for (const m of byModelRaw) {
        const rates = await this.pricing.getModelRates(m.model);
        if (!rates) continue;
        const inTok = m._sum.inputTokens ?? 0;
        const cachedTok = m._sum.cachedInputTokens ?? 0;
        const cacheCreateTok = m._sum.cacheCreationInputTokens ?? 0;
        const outTok = m._sum.outputTokens ?? 0;
        const cacheReadCost = rates.cacheReadInputTokenCost ?? rates.inputCostPerToken * 0.1;
        const cacheCreateCost = rates.cacheCreationInputTokenCost ?? rates.inputCostPerToken * 1.25;
        inputUsd += inTok * rates.inputCostPerToken + cachedTok * cacheReadCost + cacheCreateTok * cacheCreateCost;
        outputUsd += outTok * rates.outputCostPerToken;
      }
      const input = inputUsd / baseRate;
      const output = outputUsd / baseRate;
      baseTokens = { input, output, total: input + output };
    }

    return { byUser, byModel, byTool, totalTokens, totalCostUsd, missingCostCount, baseTokens };
  }

  async get(id: string) {
    const row = await this.prisma.client.agentSession.findUnique({
      where: { id },
      include: { user: { select: { username: true } } },
    });
    if (!row) throw new NotFoundException(`AgentSession ${id} not found`);
    return row;
  }
}
