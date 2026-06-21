import { Controller, Post, Headers, Req, Res, UseGuards, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import type { FastifyRequest, FastifyReply } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "@jagit/shared";
import { AuthGuard } from "../auth/auth.guard.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { createSessionMcpServer } from "./session-mcp.server.js";

@ApiTags("SessionMcp")
@Controller("session-mcp")
@UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
export class SessionMcpController {
  constructor(private readonly svc: SessionMcpService) {}

  @Post()
  @ApiOperation({ summary: "MCP JSON-RPC endpoint (tools/list, tools/call activate-jira)" })
  @ApiResponse({ status: 200, description: "MCP JSON-RPC response" })
  @ApiResponse({ status: 400, description: "Missing x-git-username header" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async handleMcp(
    @Headers("x-git-username") username: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply
  ): Promise<void> {
    if (!username) {
      throw new BadRequestException("x-git-username header required");
    }

    const server = createSessionMcpServer({ username, service: this.svc });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);

    await transport.handleRequest(request.raw, reply.raw, request.body as object);
    await transport.close();
    await server.close();
  }
}