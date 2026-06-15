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

@Injectable()
export class AgentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.agentTemplate.findMany();
  }

  create(body: AgentTemplateBody) {
    return this.prisma.client.agentTemplate.create({
      data: {
        name: body.name,
        model: body.model ?? "claude-sonnet-4-6",
        systemPrompt: body.systemPrompt ?? body.prompt ?? "",
        maxConcurrent: body.maxConcurrent ?? 1,
        allowedTools: body.allowedTools ?? [],
        skills: body.skills ?? [],
      },
    });
  }

  async update(id: string, body: AgentTemplateBody) {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    return this.prisma.client.agentTemplate.update({
      where: { id },
      data: {
        name: body.name,
        model: body.model ?? "claude-sonnet-4-6",
        systemPrompt: body.systemPrompt ?? body.prompt ?? "",
        maxConcurrent: body.maxConcurrent ?? 1,
        allowedTools: body.allowedTools ?? [],
        skills: body.skills ?? [],
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    await this.prisma.client.agentTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
