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
}

/** Dashboard-facing shape (prompt / maxTurns aliases). */
export interface AgentTemplateResponse {
  id: string;
  name: string;
  model: string;
  prompt: string;
  maxTurns: number;
}

function toResponse(row: {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  maxConcurrent: number;
}): AgentTemplateResponse {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    prompt: row.systemPrompt,
    maxTurns: row.maxConcurrent,
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
        allowedTools: body.allowedTools ?? [],
        skills: body.skills ?? [],
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
