import { Module } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { loadConfig } from "@jagit/shared";
import { CredentialsService } from "./credentials.service.js";
import { CredentialsController } from "./credentials.controller.js";
import { RepoMappingsService } from "./repo-mappings.service.js";
import { RepoMappingsController } from "./repo-mappings.controller.js";
import { AgentTemplatesService } from "./agent-templates.service.js";
import { AgentTemplatesController } from "./agent-templates.controller.js";
import { McpServersService } from "./mcp-servers.service.js";
import { McpServersController } from "./mcp-servers.controller.js";

const keyFactory = {
  provide: "ENCRYPTION_KEY",
  useFactory: () => loadConfig().encryptionKey,
};

@Module({
  providers: [
    keyFactory,
    {
      provide: CredentialsService,
      useFactory: (prisma: PrismaService, key: string) =>
        new CredentialsService(prisma, key),
      inject: [PrismaService, "ENCRYPTION_KEY"],
    },
    RepoMappingsService,
    AgentTemplatesService,
    McpServersService,
  ],
  controllers: [
    CredentialsController,
    RepoMappingsController,
    AgentTemplatesController,
    McpServersController,
  ],
})
export class ConfigModule {}
