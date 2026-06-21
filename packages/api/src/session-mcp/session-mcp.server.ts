import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionMcpService } from "./session-mcp.service.js";
import { NotFoundException, ConflictException, Logger } from "@nestjs/common";

const logger = new Logger("SessionMcpServer");

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
        sessionId: z
          .string()
          .optional()
          .describe(
            "Agent session ID to associate. Omit to use the caller's most recently active session."
          ),
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
        if (err instanceof NotFoundException || err instanceof ConflictException) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: err.message }],
          };
        }
        // Don't leak internal error details (DB connection strings, stack traces, etc.) to MCP clients.
        logger.error("activate-jira tool handler failed", err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Internal error" }],
        };
      }
    },
  );

  return server;
}
