import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionMcpService } from "./session-mcp.service.js";
import { NotFoundException, ConflictException } from "@nestjs/common";

export interface SessionMcpContext {
  username: string;
  service: SessionMcpService;
}

export function createSessionMcpServer(ctx: SessionMcpContext): McpServer {
  const server = new McpServer(
    { name: "jagit-session", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // Tool registry — add more tools here as needed
  server.registerTool(
    "activate-jira",
    {
      description: "Associate a Jira ticket with an active agent session for worklog tracking",
      inputSchema: {
        ticketId: z.string().describe("Jira issue key (e.g., PROJ-123)"),
        sessionId: z.string().describe("Agent session ID to associate"),
      },
    },
    async (args) => {
      const { ticketId, sessionId } = args;
      try {
        const result = await ctx.service.activateJira(sessionId, ctx.username, ticketId);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        // Business errors → MCP error result, not HTTP exception
        const message =
          err instanceof NotFoundException || err instanceof ConflictException
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}
