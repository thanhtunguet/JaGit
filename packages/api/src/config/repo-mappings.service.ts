import { Injectable, NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

export interface RepoMappingBody {
  jiraProjectKey: string;
  gitlabProjectId: string;
  defaultBaseBranch: string;
  branchPrefixRules: Record<string, string>;
  agentTemplateId: string;
}

@Injectable()
export class RepoMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.repoMapping.findMany({
      include: { agentTemplate: { select: { id: true, name: true } } },
    });
  }

  private async assertTemplateExists(id: string) {
    const t = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!t) throw new BadRequestException(`Agent template ${id} not found`);
  }

  async create(body: RepoMappingBody) {
    await this.assertTemplateExists(body.agentTemplateId);
    const dup = await this.prisma.client.repoMapping.findUnique({
      where: { jiraProjectKey: body.jiraProjectKey },
    });
    if (dup) throw new ConflictException(`Mapping for ${body.jiraProjectKey} already exists`);
    return this.prisma.client.repoMapping.create({ data: body });
  }

  async update(id: string, body: RepoMappingBody) {
    const existing = await this.prisma.client.repoMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Repo mapping ${id} not found`);
    await this.assertTemplateExists(body.agentTemplateId);
    return this.prisma.client.repoMapping.update({ where: { id }, data: body });
  }

  async remove(id: string) {
    const existing = await this.prisma.client.repoMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Repo mapping ${id} not found`);
    await this.prisma.client.repoMapping.delete({ where: { id } });
    return { deleted: true };
  }
}
