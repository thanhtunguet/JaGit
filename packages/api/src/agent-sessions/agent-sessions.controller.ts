import { Controller, Get, Post, Param, Query, Body, UseGuards, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AgentSessionPayloadSchema, AGENT_TOOLS, type AgentSessionPayload } from "@jagit/agent-reporter";
import { loadConfig } from "@jagit/shared";
import { AuthGuard } from "../auth/auth.guard.js";
import { AgentSessionService } from "./agent-sessions.service.js";

const ENUM_TO_WIRE: Record<string, string> = { claude_code: "claude-code", codex: "codex", copilot: "copilot" };

@ApiTags("AgentSessions")
@Controller("agent-sessions")
@UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
export class AgentSessionController {
  constructor(private readonly svc: AgentSessionService) {}

  @Post()
  @ApiOperation({ summary: "Upsert a live agent session snapshot" })
  @ApiResponse({ status: 201, description: "Upserted" })
  @ApiResponse({ status: 400, description: "Validation failure" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async create(@Body() body: unknown) {
    const parsed = AgentSessionPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const row = await this.svc.upsert(parsed.data as AgentSessionPayload);
    return { id: row.id, tool: ENUM_TO_WIRE[row.tool] ?? row.tool, sessionId: row.sessionId, lastUpdatedAt: row.lastUpdatedAt };
  }

  @Get()
  @ApiOperation({ summary: "List agent sessions (filtered, paginated)" })
  async list(
    @Query("tool") tool?: string,
    @Query("username") username?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const toolFilter = tool && (AGENT_TOOLS as readonly string[]).includes(tool)
      ? (tool as AgentSessionPayload["tool"])
      : undefined;
    return this.svc.list({
      tool: toolFilter,
      username: username || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
    });
  }
  @Get("aggregate")
  @ApiOperation({ summary: "Get aggregate cost data by user, model, and tool" })
  async aggregate(
    @Query("tool") tool?: string,
    @Query("username") username?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const toolFilter = tool && (AGENT_TOOLS as readonly string[]).includes(tool)
      ? (tool as AgentSessionPayload["tool"])
      : undefined;
    return this.svc.aggregate({
      tool: toolFilter,
      username: username || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }
  @Get(":id")
  @ApiOperation({ summary: "Get a single agent session with raw payload" })
  async get(@Param("id") id: string) {
    return this.svc.get(id);
  }
}
