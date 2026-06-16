import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

export interface AgentTemplateBody {
  name: string;
  /** Alias for systemPrompt — dashboard uses "prompt" for simplicity */
  prompt?: string;
  systemPrompt?: string;
  model?: string;
  maxConcurrent?: number;
  /** @deprecated use maxConcurrent — kept for dashboard compat */
  maxTurns?: number;
  allowedTools?: string[];
  skills?: string[];
  mcpServerIds?: string[];
  requireReviewBeforeCommit?: boolean;
}

/** Dashboard-facing shape (prompt / maxTurns aliases). */
export interface AgentTemplateResponse {
  id: string;
  name: string;
  model: string;
  prompt: string;
  maxTurns: number;
  mcpServerIds: string[];
  requireReviewBeforeCommit: boolean;
}

function toResponse(row: {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  maxConcurrent: number;
  mcpServerIds: unknown;
  requireReviewBeforeCommit: boolean;
}): AgentTemplateResponse {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    prompt: row.systemPrompt,
    maxTurns: row.maxConcurrent,
    mcpServerIds: Array.isArray(row.mcpServerIds) ? (row.mcpServerIds as string[]) : [],
    requireReviewBeforeCommit: row.requireReviewBeforeCommit ?? false,
  };
}

@Injectable()
export class AgentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AgentTemplateResponse[]> {
    const rows = await this.prisma.client.agentTemplate.findMany();
    return rows.map(toResponse);
  }

  async create(body: AgentTemplateBody): Promise<AgentTemplateResponse> {
    const row = await this.prisma.client.agentTemplate.create({
      data: {
        name: body.name,
        model: body.model ?? "claude-sonnet-4-6",
        systemPrompt: body.systemPrompt ?? body.prompt ?? "",
        maxConcurrent: body.maxConcurrent ?? body.maxTurns ?? 1,
        allowedTools: body.allowedTools ?? [],
        skills: body.skills ?? [],
        mcpServerIds: body.mcpServerIds ?? [],
        requireReviewBeforeCommit: body.requireReviewBeforeCommit ?? false,
      },
    });
    return toResponse(row);
  }

  async update(id: string, body: AgentTemplateBody): Promise<AgentTemplateResponse> {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    const row = await this.prisma.client.agentTemplate.update({
      where: { id },
      data: {
        name: body.name,
        model: body.model ?? "claude-sonnet-4-6",
        systemPrompt: body.systemPrompt ?? body.prompt ?? "",
        maxConcurrent: body.maxConcurrent ?? body.maxTurns ?? existing.maxConcurrent,
        allowedTools: body.allowedTools ?? (existing.allowedTools as string[]) ?? [],
        skills: body.skills ?? (existing.skills as string[]) ?? [],
        mcpServerIds: body.mcpServerIds ?? (existing.mcpServerIds as string[]) ?? [],
        requireReviewBeforeCommit:
          body.requireReviewBeforeCommit ?? existing.requireReviewBeforeCommit,
      },
    });
    return toResponse(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    await this.prisma.client.agentTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
