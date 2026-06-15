import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PrismaService } from "../common/prisma.module.js";

@ApiTags("Config (read-only)")
@Controller()
export class ConfigViewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("agent-templates")
  @ApiOperation({ summary: "List agent templates (read-only)" })
  agentTemplates() {
    return this.prisma.client.agentTemplate.findMany();
  }

  @Get("credentials")
  @ApiOperation({ summary: "List credentials with secrets redacted" })
  async credentials() {
    const rows = await this.prisma.client.credential.findMany();
    return rows.map(({ id, kind, name, meta }) => ({ id, kind, name, meta }));
  }

  @Get("repo-mappings")
  @ApiOperation({ summary: "List repo mappings" })
  repoMappings() {
    return this.prisma.client.repoMapping.findMany({
      include: { agentTemplate: { select: { id: true, name: true } } },
    });
  }
}
