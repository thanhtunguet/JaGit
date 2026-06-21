import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { McpServerConfigBodySchema } from "@jagit/shared";

export type McpServerConfigBody = ReturnType<typeof McpServerConfigBodySchema.parse>;

export interface McpServerConfigResponse {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  env: Record<string, unknown>;
  url: string | null;
  headers: Record<string, unknown>;
  enabled: boolean;
}

function toResponse(row: {
  id: string;
  name: string;
  transport: string;
  command: string;
  args: unknown;
  env: unknown;
  url: string | null;
  headers: unknown;
  enabled: boolean;
}): McpServerConfigResponse {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport === "http" ? "http" : "stdio",
    command: row.command,
    args: Array.isArray(row.args) ? (row.args as string[]) : [],
    env:
      row.env && typeof row.env === "object" && !Array.isArray(row.env)
        ? (row.env as Record<string, unknown>)
        : {},
    url: row.url,
    headers:
      row.headers && typeof row.headers === "object" && !Array.isArray(row.headers)
        ? (row.headers as Record<string, unknown>)
        : {},
    enabled: row.enabled,
  };
}

function toCreateData(parsed: McpServerConfigBody) {
  return {
    name: parsed.name,
    transport: parsed.transport,
    enabled: parsed.enabled,
    command: parsed.transport === "stdio" ? (parsed.command ?? "") : "",
    args: parsed.transport === "stdio" ? parsed.args : [],
    env: parsed.transport === "stdio" ? parsed.env : {},
    url: parsed.transport === "http" ? (parsed.url ?? null) : null,
    headers: parsed.transport === "http" ? parsed.headers : {},
  };
}

@Injectable()
export class McpServersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<McpServerConfigResponse[]> {
    const rows = await this.prisma.client.mcpServerConfig.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map(toResponse);
  }

  async create(body: unknown): Promise<McpServerConfigResponse> {
    const parsed = McpServerConfigBodySchema.parse(body);
    const existing = await this.prisma.client.mcpServerConfig.findUnique({
      where: { name: parsed.name },
    });
    if (existing) throw new ConflictException(`MCP server name "${parsed.name}" already exists`);

    const row = await this.prisma.client.mcpServerConfig.create({
      data: toCreateData(parsed),
    });
    return toResponse(row);
  }

  async update(id: string, body: unknown): Promise<McpServerConfigResponse> {
    const existing = await this.prisma.client.mcpServerConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`MCP server ${id} not found`);

    const parsed = McpServerConfigBodySchema.parse(body);
    if (parsed.name !== existing.name) {
      const dup = await this.prisma.client.mcpServerConfig.findUnique({
        where: { name: parsed.name },
      });
      if (dup) throw new ConflictException(`MCP server name "${parsed.name}" already exists`);
    }

    const row = await this.prisma.client.mcpServerConfig.update({
      where: { id },
      data: toCreateData(parsed),
    });
    return toResponse(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.client.mcpServerConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`MCP server ${id} not found`);
    await this.prisma.client.mcpServerConfig.delete({ where: { id } });
    return { deleted: true };
  }
}
