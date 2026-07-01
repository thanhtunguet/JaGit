import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionMcpService } from "./session-mcp.service.js";
import { NotFoundException, ConflictException, BadRequestException, Logger } from "@nestjs/common";

const logger = new Logger("SessionMcpServer");

export interface SessionMcpContext {
  username: string;
  service: SessionMcpService;
}

function isBusinessError(err: unknown): err is NotFoundException | ConflictException | BadRequestException {
  return (
    err instanceof NotFoundException ||
    err instanceof ConflictException ||
    err instanceof BadRequestException
  );
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
        if (isBusinessError(err)) {
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

  server.registerTool(
    "log-work",
    {
      description:
        "Log work to the Jira ticket associated with this session, converting token cost to hours (67.5 USD = 8h)",
      inputSchema: {
        sessionId: z
          .string()
          .optional()
          .describe(
            "Agent session ID to log work for. Omit to use the caller's most recently active session."
          ),
      },
    },
    async (args) => {
      const { sessionId } = args;
      try {
        const result = await ctx.service.logWork(sessionId, ctx.username);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        if (isBusinessError(err)) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: err.message }],
          };
        }
        logger.error("log-work tool handler failed", err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Internal error" }],
        };
      }
    },
  );

  return server;
}
