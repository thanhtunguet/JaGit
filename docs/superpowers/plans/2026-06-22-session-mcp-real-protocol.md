# Session MCP Real Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/api/session-mcp` as a genuine MCP-over-Streamable-HTTP server so it works when configured in Claude Code's `.claude.json`.

**Architecture:** Replace the ad-hoc REST body parsing with `@modelcontextprotocol/sdk`'s `McpServer` + `StreamableHTTPServerTransport`. Each POST creates a fresh stateless server/transport, handles one JSON-RPC request, then closes. Tool registry pattern (`{name, description, inputSchema, handler}`) makes adding future tools a one-line addition. Auth and username extraction happen before MCP dispatch (Nest guards/controllers); tool handler catches business errors and wraps them as MCP `CallToolResult` with `isError: true`.

**Tech Stack:** `@modelcontextprotocol/sdk` v1.29.0 (already in lockfile), NestJS + Fastify, Zod for input schemas.

---

## File Structure

**Create:**
- `packages/api/src/session-mcp/session-mcp.server.ts` — MCP server factory with tool registry

**Modify:**
- `packages/api/package.json` — add `@modelcontextprotocol/sdk` dependency
- `packages/api/src/session-mcp/session-mcp.controller.ts` — rewrite to use MCP transport
- `packages/api/src/session-mcp/session-mcp.controller.test.ts` — rewrite to test real MCP protocol

**Unchanged:**
- `packages/api/src/session-mcp/session-mcp.service.ts` — business logic unchanged
- `packages/api/src/session-mcp/session-mcp.module.ts` — wiring unchanged

---

### Task 1: Add MCP SDK Dependency

**Goal:** Add `@modelcontextprotocol/sdk` as an explicit dependency of `packages/api`.

**Files:**
- Modify: `packages/api/package.json`

**Acceptance Criteria:**
- [ ] `@modelcontextprotocol/sdk` appears in `packages/api/package.json` dependencies
- [ ] `pnpm install` succeeds
- [ ] `pnpm -r build` succeeds

**Verify:** `pnpm --filter @jigit/api build` exits 0

**Steps:**

- [ ] **Step 1: Add dependency**

```bash
cd /Users/tungpt/Development/FPT/JaGit
pnpm --filter @jigit/api add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify install and build**

```bash
pnpm install
pnpm --filter @jigit/api build
```

Expected: both commands exit 0

- [ ] **Step 3: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(api): add @modelcontextprotocol/sdk dependency

Required for rebuilding session-mcp endpoint as a real MCP server.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Write Failing MCP Protocol Tests

**Goal:** Write the test file that will drive the MCP protocol implementation. Tests will fail until the controller is rewritten.

**Files:**
- Modify: `packages/api/src/session-mcp/session-mcp.controller.test.ts`

**Acceptance Criteria:**
- [ ] Test file imports MCP SDK types (`CallToolResult`, etc.)
- [ ] `tools/list` test sends real MCP JSON-RPC and asserts `activate-jira` appears
- [ ] `tools/call` success test sends real MCP envelope and asserts `CallToolResult` shape
- [ ] `tools/call` error tests assert `isError: true` (not HTTP 404/409)
- [ ] Existing auth/header guard tests preserved
- [ ] `pnpm --filter @jigit/api test -- session-mcp.controller.test.ts` shows expected failures

**Verify:** `pnpm --filter @jigit/api test -- session-mcp.controller.test.ts 2>&1 | grep -E "(FAIL|PASS|Error)" | head -20`

Expected: Multiple FAIL lines (tests written but implementation not yet done)

**Steps:**

- [ ] **Step 1: Write the failing test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { NotFoundException, ConflictException } from "@nestjs/common";

const mockSvc = {
  activateJira: vi.fn(),
};

// Helper to build a valid MCP JSON-RPC request body
function mcpRequest(method: string, params: Record<string, unknown> = {}, id: number | string = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

describe("SessionMcpController — MCP Protocol", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [SessionMcpController],
      providers: [
        { provide: SessionMcpService, useValue: mockSvc },
        { provide: PrismaService, useValue: { client: {} } },
      ],
    }).compile();

    app = module.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  const validHeaders = { "x-git-username": "testuser", authorization: "Bearer test-dashboard-token" };

  describe("MCP tools/list", () => {
    it("should list activate-jira tool with correct schema", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/list"),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.result).toBeDefined();
      expect(body.result.tools).toBeInstanceOf(Array);
      const tool = body.result.tools.find((t: { name: string }) => t.name === "activate-jira");
      expect(tool).toBeDefined();
      expect(tool.description).toContain("Jira");
      expect(tool.inputSchema.properties.ticketId).toBeDefined();
      expect(tool.inputSchema.properties.sessionId).toBeDefined();
    });
  });

  describe("MCP tools/call activate-jira", () => {
    it("should return CallToolResult on success", async () => {
      mockSvc.activateJira.mockResolvedValue({
        success: true,
        sessionId: "test-session-1",
        jiraTicketId: "PROJ-123",
        message: "Jira ticket associated with session",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "activate-jira",
          arguments: { ticketId: "PROJ-123", sessionId: "test-session-1" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.result).toBeDefined();
      expect(body.result.content).toBeInstanceOf(Array);
      expect(body.result.content[0].type).toBe("text");
      const text = body.result.content[0].text;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.jiraTicketId).toBe("PROJ-123");
    });

    it("should return isError:true for non-existent session (not HTTP 404)", async () => {
      mockSvc.activateJira.mockRejectedValue(new NotFoundException("Session not found"));

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "activate-jira",
          arguments: { ticketId: "PROJ-123", sessionId: "missing" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].type).toBe("text");
      expect(body.result.content[0].text).toContain("not found");
    });

    it("should return isError:true for ticket conflict (not HTTP 409)", async () => {
      mockSvc.activateJira.mockRejectedValue(new ConflictException("Already associated"));

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "activate-jira",
          arguments: { ticketId: "PROJ-123", sessionId: "test-session-1" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("Already");
    });

    it("should return MCP error for unknown tool", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "unknown-tool",
          arguments: {},
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32601); // Method not found
    });
  });

  describe("Transport-level guards (unchanged)", () => {
    it("should reject with HTTP 401 if no auth header", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: { "x-git-username": "testuser" }, // missing auth
        payload: mcpRequest("tools/list"),
      });

      expect(res.statusCode).toBe(401);
    });

    it("should reject with HTTP 400 if missing x-git-username", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: { authorization: "Bearer test-dashboard-token" }, // missing username
        payload: mcpRequest("tools/list"),
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @jigit/api test -- session-mcp.controller.test.ts
```

Expected: Multiple failures (controller doesn't speak MCP yet)

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/api/src/session-mcp/session-mcp.controller.test.ts
git commit -m "$(cat <<'EOF'
test(api): add MCP protocol tests for session-mcp endpoint

These tests currently fail — controller doesn't speak MCP yet.
Will pass after implementation tasks complete.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create MCP Server Factory

**Goal:** Create `session-mcp.server.ts` with a tool registry and the `activate-jira` handler that catches business errors and wraps them as MCP error results.

**Files:**
- Create: `packages/api/src/session-mcp/session-mcp.server.ts`

**Acceptance Criteria:**
- [ ] Exports `createSessionMcpServer(ctx: { username: string; service: SessionMcpService }): McpServer`
- [ ] Registers `activate-jira` tool with Zod input schema (`ticketId: z.string()`, `sessionId: z.string()`)
- [ ] Handler catches `NotFoundException`/`ConflictException` and returns `{ isError: true, content: [{type:"text",text:message}] }`
- [ ] Success returns `{ content: [{type:"text", text: JSON.stringify(result)}] }`
- [ ] TypeScript compiles clean

**Verify:** `pnpm --filter @jigit/api build` exits 0

**Steps:**

- [ ] **Step 1: Create the MCP server factory**

```typescript
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
          content: [{ type: "text", text: JSON.stringify(result) }],
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
          content: [{ type: "text", text: message }],
        };
      }
    },
  );

  return server;
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @jigit/api build
```

Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/session-mcp/session-mcp.server.ts
git commit -m "$(cat <<'EOF'
feat(api): add MCP server factory with activate-jira tool

Tool registry pattern supports adding more tools later.
Handler catches business errors and wraps as MCP error results.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rewrite Controller to Use MCP Transport

**Goal:** Rewrite `session-mcp.controller.ts` to delegate to the MCP server + `StreamableHTTPServerTransport`, using Fastify's raw req/res.

**Files:**
- Modify: `packages/api/src/session-mcp/session-mcp.controller.ts`

**Acceptance Criteria:**
- [ ] Controller keeps `@UseGuards(AuthGuard)` and `x-git-username` header check
- [ ] POST handler builds fresh `McpServer` via factory + stateless `StreamableHTTPServerTransport`
- [ ] Calls `transport.handleRequest(request.raw, reply.raw, request.body)`
- [ ] Closes transport/server after response
- [ ] All MCP protocol tests from Task 2 pass

**Verify:** `pnpm --filter @jigit/api test -- session-mcp.controller.test.ts` shows all PASS

**Steps:**

- [ ] **Step 1: Rewrite the controller**

```typescript
import { Controller, Post, UseGuards, Headers, Req, Res } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { FastifyRequest, FastifyReply } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { createSessionMcpServer } from "./session-mcp.server.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { loadConfig } from "@jigit/shared";
import { BadRequestException } from "@nestjs/common";

@ApiTags("SessionMcp")
@Controller("session-mcp")
@UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
export class SessionMcpController {
  constructor(private readonly svc: SessionMcpService) {}

  @Post()
  @ApiOperation({ summary: "MCP tool: activate-jira" })
  @ApiResponse({ status: 200, description: "Tool executed" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async handleMcp(
    @Headers("x-git-username") username: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    if (!username) {
      throw new BadRequestException("x-git-username header required");
    }

    // Build fresh MCP server + stateless transport per request
    const server = createSessionMcpServer({ username, service: this.svc });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);

    // SDK handles all JSON-RPC parsing and dispatch
    await transport.handleRequest(request.raw, reply.raw, request.body as object);

    // Cleanup after response
    reply.raw.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  }
}
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @jigit/api test -- session-mcp.controller.test.ts
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/session-mcp/session-mcp.controller.ts
git commit -m "$(cat <<'EOF'
feat(api): rewrite session-mcp controller as real MCP server

Uses @modelcontextprotocol/sdk StreamableHTTPServerTransport.
Each request builds fresh stateless server, delegates JSON-RPC
handling to SDK. Preserves auth guard and x-git-username check.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Verify End-to-End with Claude Code MCP Client

**Goal:** Manually verify the endpoint works when configured as an MCP server in Claude Code.

**Files:**
- None (manual verification)

**Acceptance Criteria:**
- [ ] `pnpm dev:api` starts the API successfully
- [ ] Claude Code's MCP connection shows green status
- [ ] `tools/list` returns `activate-jira` in Claude Code's tool picker (if applicable)
- [ ] `tools/call activate-jira` succeeds from Claude Code

**Verify:** Manual — Claude Code shows "jagit-session: connected" or equivalent success indicator

**Steps:**

- [ ] **Step 1: Start the API server**

```bash
pnpm dev:api
```

Expected: Server listens on localhost:3000

- [ ] **Step 2: Verify MCP connection in Claude Code**

Using the `.claude.json` config from the original issue:

```json
"jagit-session": {
  "type": "http",
  "url": "http://localhost:3000/api/session-mcp",
  "headers": {
    "Authorization": "Bearer dsskvjnsdkjvnk",
    "X-Git-Username": "thanhtunguet",
    "X-Api-Key": "dsskvjnsdkjvnk"
  }
}
```

Check Claude Code's MCP server status — should show connected, not "failed".

- [ ] **Step 3: Test tool invocation**

If Claude Code exposes a way to call MCP tools directly (e.g., via a command or UI), invoke `activate-jira` with test arguments and verify the response.

---

## Self-Review

**Spec coverage:**

| Spec Section | Task |
|--------------|------|
| Dependency change | Task 1 |
| `session-mcp.server.ts` factory | Task 3 |
| `session-mcp.controller.ts` rewrite | Task 4 |
| Error semantics (HTTP vs MCP) | Task 3 (handler), Task 4 (guards preserved) |
| Testing | Task 2 (TDD), Task 5 (manual) |

All spec requirements have corresponding tasks.

**Placeholder scan:** No TBD/TODO placeholders. All steps have concrete code/commands.

**Type consistency:** `SessionMcpContext` interface defined in Task 3, used in controller in Task 4. `createSessionMcpServer` signature matches usage.
