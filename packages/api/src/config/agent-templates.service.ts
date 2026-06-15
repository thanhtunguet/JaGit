import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

export interface AgentTemplateBody {
  name: string;
  prompt: string;
  maxTurns?: number;
}

@Injectable()
export class AgentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.agentTemplate.findMany();
  }

  create(body: AgentTemplateBody) {
    return this.prisma.client.agentTemplate.create({ data: body });
  }

  async update(id: string, body: AgentTemplateBody) {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    return this.prisma.client.agentTemplate.update({ where: { id }, data: body });
  }

  async remove(id: string) {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    await this.prisma.client.agentTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
