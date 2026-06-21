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

    const [rows, total] = await Promise.all([
      this.prisma.client.agentSession.findMany({
        where: where as any,
        orderBy: { lastUpdatedAt: "desc" },
        take: filters.limit,
        skip: filters.offset,
        include: { user: { select: { username: true } } },
      }),
      this.prisma.client.agentSession.count({ where: where as any }),
    ]);
    return { rows, total };
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
