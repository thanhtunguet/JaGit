import { Controller, Post, Body, Headers, UseGuards, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { loadConfig } from "@jagit/shared";
import { AuthGuard } from "../auth/auth.guard.js";
import { SessionMcpService } from "./session-mcp.service.js";

@ApiTags("SessionMcp")
@Controller("session-mcp")
@UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
export class SessionMcpController {
  constructor(private readonly svc: SessionMcpService) {}

  @Post()
  @ApiOperation({ summary: "MCP tool: activate-jira" })
  @ApiResponse({ status: 200, description: "Tool executed" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async executeTool(
    @Body() body: { name: string; arguments: { ticketId: string; sessionId: string } },
    @Headers("x-git-username") username: string
  ) {
    if (!username) {
      throw new BadRequestException("x-git-username header required");
    }

    if (body.name !== "activate-jira") {
      throw new BadRequestException(`Unknown tool: ${body.name}`);
    }

    const { ticketId, sessionId } = body.arguments;
    if (!ticketId || !sessionId) {
      throw new BadRequestException("ticketId and sessionId required");
    }

    return this.svc.activateJira(sessionId, username, ticketId);
  }
}