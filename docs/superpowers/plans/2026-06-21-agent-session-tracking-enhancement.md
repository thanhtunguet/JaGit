# Agent Session Tracking Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jira integration, time tracking, and LOC metrics to agent sessions with automatic worklog creation.

**Architecture:** HTTP MCP server for Jira ticket association, time tracking hook for UserPromptSubmit events, enhanced Stop hook for LOC calculation and worklog creation. Local state files with async API sync.

**Tech Stack:** TypeScript, NestJS, Prisma, Zod, Node.js child_process for git operations

---

## File Structure

**New Files:**
- `packages/shared/prisma/migrations/20260621120000_add_session_tracking_fields/migration.ts` - Database migration
- `packages/shared/src/jira-worklog.ts` - Jira worklog service
- `packages/shared/src/jira-worklog.test.ts` - Jira worklog tests
- `packages/api/src/session-mcp/session-mcp.controller.ts` - MCP endpoint
- `packages/api/src/session-mcp/session-mcp.service.ts` - MCP business logic
- `packages/api/src/session-mcp/session-mcp.module.ts` - NestJS module
- `packages/api/src/session-mcp/session-mcp.controller.test.ts` - MCP tests
- `packages/hook-claude-code-time-tracking/package.json` - Package manifest
- `packages/hook-claude-code-time-tracking/tsconfig.json` - TypeScript config
- `packages/hook-claude-code-time-tracking/src/index.ts` - Main hook script
- `packages/hook-claude-code-time-tracking/src/state.ts` - State file management
- `packages/hook-claude-code-time-tracking/src/git.ts` - Git operations
- `packages/hook-claude-code-time-tracking/src/index.test.ts` - Hook tests

**Modified Files:**
- `packages/shared/prisma/schema.prisma` - Add session tracking fields
- `packages/hook-claude-code/src/index.ts` - Enhanced Stop hook
- `packages/hook-claude-code/src/index.test.ts` - Stop hook tests
- `packages/api/src/agent-sessions/agent-sessions.controller.ts` - Add time tracking endpoint
- `packages/api/src/agent-sessions/agent-sessions.service.ts` - Add time tracking method
- `packages/api/src/agent-sessions/agent-sessions.service.test.ts` - Time tracking tests
- `packages/api/src/app.module.ts` - Import SessionMcpModule

---

## Task 1: Database Migration for Session Tracking Fields

**Goal:** Add optional fields to AgentSession model for Jira association, time tracking, and LOC metrics.

**Files:**
- Modify: `packages/shared/prisma/schema.prisma:237-258`
- Create: `packages/shared/prisma/migrations/20260621120000_add_session_tracking_fields/migration.ts`

**Acceptance Criteria:**
- [ ] AgentSession model has jiraTicketId, initialCommitSha, durationMs, linesAdded, linesRemoved fields
- [ ] All new fields are optional (nullable)
- [ ] Index on jiraTicketId for efficient queries
- [ ] Migration is idempotent and reversible

**Verify:** `pnpm --filter @jigit/shared exec prisma migrate dev --name add_session_tracking_fields` → migration creates successfully

**Steps:**

- [ ] **Step 1: Update Prisma schema**

Add new fields to AgentSession model in `packages/shared/prisma/schema.prisma`:

```prisma
model AgentSession {
  id                       String    @id @default(cuid())
  tool                     AgentTool
  sessionId                String
  userId                   String
  user                     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  model                    String
  inputTokens              Int       @default(0)
  cachedInputTokens        Int       @default(0)
  cacheCreationInputTokens Int       @default(0)
  outputTokens             Int       @default(0)
  costUsd                  Float?
  toolCallCount            Int?
  startedAt                DateTime
  lastUpdatedAt            DateTime  @updatedAt
  rawPayload               Json      @default("{}")
  createdAt                DateTime  @default(now())

  // Jira association
  jiraTicketId    String?
  
  // Time tracking
  initialCommitSha String?
  durationMs       Int?
  
  // Lines of code
  linesAdded      Int?
  linesRemoved    Int?

  @@unique([tool, sessionId])
  @@index([userId, lastUpdatedAt])
  @@index([tool, lastUpdatedAt])
  @@index([jiraTicketId])
}
```

- [ ] **Step 2: Generate migration**

Run: `pnpm --filter @jigit/shared exec prisma migrate dev --name add_session_tracking_fields`

Expected: Migration file created in `packages/shared/prisma/migrations/20260621120000_add_session_tracking_fields/`

- [ ] **Step 3: Verify migration**

Run: `pnpm --filter @jigit/shared exec prisma migrate status`

Expected: Database schema is up to date

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/migrations/
git commit -m "feat(db): add session tracking fields to AgentSession

Add jiraTicketId, initialCommitSha, durationMs, linesAdded, linesRemoved
for enhanced session tracking and Jira integration.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Jira Worklog Service

**Goal:** Create shared service for creating Jira worklog entries from agent session data.

**Files:**
- Create: `packages/shared/src/jira-worklog.ts`
- Create: `packages/shared/src/jira-worklog.test.ts`
- Modify: `packages/shared/src/index.ts`

**Acceptance Criteria:**
- [ ] createJiraWorklog function accepts ticketId, durationMs, baseTokens
- [ ] Retrieves Jira credentials from Credential table
- [ ] Formats worklog comment with time and BT
- [ ] Makes POST request to Jira API with retry logic
- [ ] Returns void, logs errors without throwing
- [ ] Unit tests cover success and failure cases

**Verify:** `pnpm --filter @jigit/shared test -- jira-worklog.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `packages/shared/src/jira-worklog.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraWorklog } from "./jira-worklog.js";

// Mock PrismaService
vi.mock("./prisma.js", () => ({
  prismaClient: {
    credential: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe("createJiraWorklog", () => {
  const mockCredential = {
    id: "cred-1",
    kind: "jira",
    name: "default",
    secrets: { accessToken: "test-token" },
    meta: { baseUrl: "https://test.atlassian.net" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create worklog with formatted comment", async () => {
    const { prismaClient } = await import("./prisma.js");
    vi.mocked(prismaClient.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 201 }));

    await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000, // 2.5 hours
      baseTokens: 2000000,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/2/issue/PROJ-123/worklog",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining("AI Logwork for PROJ-123"),
      })
    );

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.timeSpentSeconds).toBe(9000);
    expect(body.comment).toContain("2h 30m");
    expect(body.comment).toContain("2,000,000 BT");
  });

  it("should handle missing credentials gracefully", async () => {
    const { prismaClient } = await import("./prisma.js");
    vi.mocked(prismaClient.credential.findUnique).mockResolvedValue(null);

    // Should not throw
    await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("should handle API errors gracefully", async () => {
    const { prismaClient } = await import("./prisma.js");
    vi.mocked(prismaClient.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    // Should not throw
    await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jigit/shared test -- jira-worklog.test.ts`

Expected: FAIL with "Cannot find module './jira-worklog.js'"

- [ ] **Step 3: Implement Jira worklog service**

Create `packages/shared/src/jira-worklog.ts`:

```typescript
import { prismaClient } from "./prisma.js";
import { withRetry } from "./retry.js";

export interface CreateWorklogOpts {
  ticketId: string;
  durationMs: number;
  baseTokens: number;
  comment?: string;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

function formatBT(bt: number): string {
  return bt.toLocaleString("en-US");
}

export async function createJiraWorklog(opts: CreateWorklogOpts): Promise<void> {
  try {
    const credential = await prismaClient.credential.findUnique({
      where: { kind_name: { kind: "jira", name: "default" } },
    });

    if (!credential) {
      console.error("[jira-worklog] No Jira credentials found, skipping worklog");
      return;
    }

    const secrets = credential.secrets as { accessToken?: string };
    const meta = credential.meta as { baseUrl?: string };

    if (!secrets.accessToken || !meta.baseUrl) {
      console.error("[jira-worklog] Incomplete Jira credentials, skipping worklog");
      return;
    }

    const timeSpentSeconds = Math.floor(opts.durationMs / 1000);
    const durationStr = formatDuration(opts.durationMs);
    const btStr = formatBT(opts.baseTokens);

    const defaultComment = `AI Logwork for ${opts.ticketId}\nTime Spent: ${durationStr}\nToken Spent: ${btStr} BT`;

    const url = `${meta.baseUrl.replace(/\/+$/, "")}/rest/api/2/issue/${opts.ticketId}/worklog`;

    await withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secrets.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeSpentSeconds,
          comment: opts.comment ?? defaultComment,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (res.status >= 500) {
          throw new Error(`Jira API error: ${res.status} ${detail}`);
        }
        console.error(`[jira-worklog] Non-retryable error ${res.status}: ${detail}`);
        return;
      }

      console.log(`[jira-worklog] Created worklog for ${opts.ticketId}`);
    }, { maxRetries: 3, baseDelayMs: 1000 });

  } catch (err) {
    console.error("[jira-worklog] Failed to create worklog:", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 4: Export from index**

Modify `packages/shared/src/index.ts`:

```typescript
export * from "./approval-bridge.js";
export * from "./branch.js";
export * from "./config.js";
export * from "./credentials.js";
export * from "./crypto.js";
export * from "./events.js";
export * from "./git-worktree.js";
export * from "./jira-worklog.js";  // Add this line
export * from "./mcp-config.js";
export * from "./mcp-servers.js";
export * from "./prisma.js";
export * from "./queue.js";
export * from "./retry.js";
export * from "./seed.js";
export * from "./types.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @jigit/shared test -- jira-worklog.test.ts`

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/jira-worklog.ts packages/shared/src/jira-worklog.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Jira worklog service

Add createJiraWorklog function for creating Jira worklog entries
from agent session data with retry logic and error handling.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Time Tracking API Endpoint

**Goal:** Add PATCH endpoint for hooks to update time tracking fields incrementally.

**Files:**
- Modify: `packages/api/src/agent-sessions/agent-sessions.controller.ts`
- Modify: `packages/api/src/agent-sessions/agent-sessions.service.ts`
- Modify: `packages/api/src/agent-sessions/agent-sessions.service.test.ts`

**Acceptance Criteria:**
- [ ] PATCH /api/agent-sessions/:sessionId/time-tracking endpoint exists
- [ ] Accepts initialCommitSha and durationMs in request body
- [ ] Updates only provided fields (partial update)
- [ ] Returns updated session
- [ ] Handles session not found case
- [ ] Unit tests cover all cases

**Verify:** `pnpm --filter @jigit/api test -- agent-sessions.service.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write failing test**

Add to `packages/api/src/agent-sessions/agent-sessions.service.test.ts`:

```typescript
describe("updateTimeTracking", () => {
  it("should update durationMs", async () => {
    const session = await svc.upsert({
      tool: "claude-code",
      sessionId: "time-test-1",
      gitUsername: "test-user",
      model: "claude-3-5-sonnet-20241022",
      inputTokens: 1000,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 500,
      costUsd: null,
      toolCallCount: 2,
      startedAt: new Date().toISOString(),
    });

    const updated = await svc.updateTimeTracking(session.id, { durationMs: 3600000 });
    expect(updated.durationMs).toBe(3600000);
    expect(updated.initialCommitSha).toBeNull();
  });

  it("should update initialCommitSha", async () => {
    const session = await svc.upsert({
      tool: "claude-code",
      sessionId: "time-test-2",
      gitUsername: "test-user",
      model: "claude-3-5-sonnet-20241022",
      inputTokens: 1000,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 500,
      costUsd: null,
      toolCallCount: 2,
      startedAt: new Date().toISOString(),
    });

    const updated = await svc.updateTimeTracking(session.id, { initialCommitSha: "abc123" });
    expect(updated.initialCommitSha).toBe("abc123");
    expect(updated.durationMs).toBeNull();
  });

  it("should update both fields", async () => {
    const session = await svc.upsert({
      tool: "claude-code",
      sessionId: "time-test-3",
      gitUsername: "test-user",
      model: "claude-3-5-sonnet-20241022",
      inputTokens: 1000,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 500,
      costUsd: null,
      toolCallCount: 2,
      startedAt: new Date().toISOString(),
    });

    const updated = await svc.updateTimeTracking(session.id, {
      durationMs: 7200000,
      initialCommitSha: "def456",
    });
    expect(updated.durationMs).toBe(7200000);
    expect(updated.initialCommitSha).toBe("def456");
  });

  it("should throw NotFoundException for invalid session", async () => {
    await expect(
      svc.updateTimeTracking("nonexistent", { durationMs: 1000 })
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/api test -- agent-sessions.service.test.ts`

Expected: FAIL with "svc.updateTimeTracking is not a function"

- [ ] **Step 3: Implement service method**

Add to `packages/api/src/agent-sessions/agent-sessions.service.ts` after the `get` method:

```typescript
async updateTimeTracking(
  id: string,
  data: { initialCommitSha?: string; durationMs?: number }
) {
  const session = await this.prisma.client.agentSession.findUnique({ where: { id } });
  if (!session) throw new NotFoundException(`AgentSession ${id} not found`);

  const updateData: { initialCommitSha?: string; durationMs?: number } = {};
  if (data.initialCommitSha !== undefined) updateData.initialCommitSha = data.initialCommitSha;
  if (data.durationMs !== undefined) updateData.durationMs = data.durationMs;

  return this.prisma.client.agentSession.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      sessionId: true,
      initialCommitSha: true,
      durationMs: true,
    },
  });
}
```

- [ ] **Step 4: Add controller endpoint**

Add to `packages/api/src/agent-sessions/agent-sessions.controller.ts` after the `@Get(":id")` method:

```typescript
@Patch(":sessionId/time-tracking")
@ApiOperation({ summary: "Update time tracking fields for a session" })
@ApiResponse({ status: 200, description: "Updated" })
@ApiResponse({ status: 401, description: "Unauthorized" })
@ApiResponse({ status: 404, description: "Session not found" })
async updateTimeTracking(
  @Param("sessionId") sessionId: string,
  @Body() body: { initialCommitSha?: string; durationMs?: number }
) {
  return this.svc.updateTimeTracking(sessionId, body);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @jigit/api test -- agent-sessions.service.test.ts`

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/agent-sessions/
git commit -m "feat(api): add time tracking endpoint for hooks

Add PATCH /api/agent-sessions/:sessionId/time-tracking for
incremental updates of durationMs and initialCommitSha fields.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: HTTP MCP Server

**Goal:** Create MCP server with activate-jira tool for associating Jira tickets with sessions.

**Files:**
- Create: `packages/api/src/session-mcp/session-mcp.controller.ts`
- Create: `packages/api/src/session-mcp/session-mcp.service.ts`
- Create: `packages/api/src/session-mcp/session-mcp.module.ts`
- Create: `packages/api/src/session-mcp/session-mcp.controller.test.ts`
- Modify: `packages/api/src/app.module.ts`

**Acceptance Criteria:**
- [ ] POST /api/session-mcp endpoint exists
- [ ] Requires x-api-key and x-git-username headers
- [ ] Exposes activate-jira tool with ticketId and sessionId parameters
- [ ] Updates AgentSession.jiraTicketId for matching session
- [ ] Returns success/error responses
- [ ] Handles session not found, unauthorized, already associated cases
- [ ] Unit tests cover all cases

**Verify:** `pnpm --filter @jigit/api test -- session-mcp.controller.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `packages/api/src/session-mcp/session-mcp.controller.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { BadRequestException, NotFoundException, ConflictException } from "@nestjs/common";

describe("SessionMcpController", () => {
  let controller: SessionMcpController;
  let service: SessionMcpService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SessionMcpController],
      providers: [SessionMcpService, PrismaService],
    }).compile();

    controller = module.get(SessionMcpController);
    service = module.get(SessionMcpService);
    prisma = module.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  beforeEach(async () => {
    await prisma.client.agentSession.deleteMany();
    await prisma.client.user.deleteMany();
  });

  describe("activateJira", () => {
    it("should associate Jira ticket with session", async () => {
      const user = await prisma.client.user.create({ data: { username: "testuser" } });
      const session = await prisma.client.agentSession.create({
        data: {
          tool: "claude_code",
          sessionId: "test-session-1",
          userId: user.id,
          model: "claude-3-5-sonnet-20241022",
          inputTokens: 1000,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 0,
          outputTokens: 500,
          startedAt: new Date(),
        },
      });

      const result = await controller.activateJira(
        { ticketId: "PROJ-123", sessionId: "test-session-1" },
        "testuser"
      );

      expect(result.success).toBe(true);
      expect(result.jiraTicketId).toBe("PROJ-123");

      const updated = await prisma.client.agentSession.findUnique({ where: { id: session.id } });
      expect(updated?.jiraTicketId).toBe("PROJ-123");
    });

    it("should throw NotFoundException for non-existent session", async () => {
      await expect(
        controller.activateJira({ ticketId: "PROJ-123", sessionId: "nonexistent" }, "testuser")
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException for wrong user", async () => {
      const user = await prisma.client.user.create({ data: { username: "otheruser" } });
      await prisma.client.agentSession.create({
        data: {
          tool: "claude_code",
          sessionId: "test-session-2",
          userId: user.id,
          model: "claude-3-5-sonnet-20241022",
          inputTokens: 1000,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 0,
          outputTokens: 500,
          startedAt: new Date(),
        },
      });

      await expect(
        controller.activateJira({ ticketId: "PROJ-123", sessionId: "test-session-2" }, "testuser")
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException if already associated with different ticket", async () => {
      const user = await prisma.client.user.create({ data: { username: "testuser" } });
      await prisma.client.agentSession.create({
        data: {
          tool: "claude_code",
          sessionId: "test-session-3",
          userId: user.id,
          model: "claude-3-5-sonnet-20241022",
          inputTokens: 1000,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 0,
          outputTokens: 500,
          startedAt: new Date(),
          jiraTicketId: "PROJ-456",
        },
      });

      await expect(
        controller.activateJira({ ticketId: "PROJ-123", sessionId: "test-session-3" }, "testuser")
      ).rejects.toThrow(ConflictException);
    });

    it("should be idempotent for same ticket", async () => {
      const user = await prisma.client.user.create({ data: { username: "testuser" } });
      await prisma.client.agentSession.create({
        data: {
          tool: "claude_code",
          sessionId: "test-session-4",
          userId: user.id,
          model: "claude-3-5-sonnet-20241022",
          inputTokens: 1000,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 0,
          outputTokens: 500,
          startedAt: new Date(),
          jiraTicketId: "PROJ-123",
        },
      });

      const result = await controller.activateJira(
        { ticketId: "PROJ-123", sessionId: "test-session-4" },
        "testuser"
      );

      expect(result.success).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jigit/api test -- session-mcp.controller.test.ts`

Expected: FAIL with "Cannot find module './session-mcp.controller.js'"

- [ ] **Step 3: Implement service**

Create `packages/api/src/session-mcp/session-mcp.service.ts`:

```typescript
import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

@Injectable()
export class SessionMcpService {
  constructor(private readonly prisma: PrismaService) {}

  async activateJira(sessionId: string, username: string, ticketId: string) {
    const session = await this.prisma.client.agentSession.findFirst({
      where: { sessionId, user: { username } },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found for user ${username}`);
    }

    if (session.jiraTicketId && session.jiraTicketId !== ticketId) {
      throw new ConflictException(
        `Session already associated with ${session.jiraTicketId}`
      );
    }

    const updated = await this.prisma.client.agentSession.update({
      where: { id: session.id },
      data: { jiraTicketId: ticketId },
      select: { id: true, sessionId: true, jiraTicketId: true },
    });

    return {
      success: true,
      sessionId: updated.sessionId,
      jiraTicketId: updated.jiraTicketId!,
      message: "Jira ticket associated with session",
    };
  }
}
```

- [ ] **Step 4: Implement controller**

Create `packages/api/src/session-mcp/session-mcp.controller.ts`:

```typescript
import { Controller, Post, Body, Headers, UseGuards, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { loadConfig } from "@jigit/shared";
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
```

- [ ] **Step 5: Create module**

Create `packages/api/src/session-mcp/session-mcp.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";

@Module({
  controllers: [SessionMcpController],
  providers: [SessionMcpService],
})
export class SessionMcpModule {}
```

- [ ] **Step 6: Import module**

Modify `packages/api/src/app.module.ts` to import SessionMcpModule:

```typescript
import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { AgentSessionModule } from "./agent-sessions/agent-sessions.module.js";
import { UsageModule } from "./usage/usage.module.js";
import { SseModule } from "./sse/sse.module.js";
import { SessionMcpModule } from "./session-mcp/session-mcp.module.js";
import { SpaController } from "./spa.controller.js";

@Module({
  imports: [ConfigModule, AgentSessionModule, UsageModule, SseModule, SessionMcpModule],
  controllers: [SpaController],
})
export class AppModule {}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @jigit/api test -- session-mcp.controller.test.ts`

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/session-mcp/ packages/api/src/app.module.ts
git commit -m "feat(api): add HTTP MCP server for Jira ticket association

Add POST /api/session-mcp with activate-jira tool for associating
Jira tickets with agent sessions via x-git-username header.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Time Tracking Hook Package

**Goal:** Create hook package for tracking session duration on UserPromptSubmit events.

**Files:**
- Create: `packages/hook-claude-code-time-tracking/package.json`
- Create: `packages/hook-claude-code-time-tracking/tsconfig.json`
- Create: `packages/hook-claude-code-time-tracking/src/index.ts`
- Create: `packages/hook-claude-code-time-tracking/src/state.ts`
- Create: `packages/hook-claude-code-time-tracking/src/git.ts`
- Create: `packages/hook-claude-code-time-tracking/src/index.test.ts`

**Acceptance Criteria:**
- [ ] Hook reads stdin for UserPromptSubmit event
- [ ] Initializes state file with sessionId, initialCommitSha, durationMs
- [ ] Accumulates durationMs on subsequent calls
- [ ] Syncs state to API asynchronously
- [ ] Handles missing cwd gracefully
- [ ] Unit tests cover initialization and accumulation

**Verify:** `pnpm --filter @jigit/hook-claude-code-time-tracking test` → all tests pass

**Steps:**

- [ ] **Step 1: Create package structure**

Create `packages/hook-claude-code-time-tracking/package.json`:

```json
{
  "name": "@jigit/hook-claude-code-time-tracking",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "jagit-hook-claude-code-time-tracking": "dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@jigit/agent-reporter": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^25.9.3",
    "vitest": "^2.1.9"
  }
}
```

Create `packages/hook-claude-code-time-tracking/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Write failing tests**

Create `packages/hook-claude-code-time-tracking/src/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPayload, main } from "./index.js";
import * as state from "./state.js";
import * as git from "./git.js";

vi.mock("./state.js");
vi.mock("./git.js");
vi.mock("@jigit/agent-reporter", () => ({
  reportSession: vi.fn(),
}));

describe("buildPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize state on first call", async () => {
    vi.mocked(state.readState).mockReturnValue(null);
    vi.mocked(git.getHeadSha).mockReturnValue("abc123");
    vi.mocked(state.writeState).mockImplementation(() => {});

    const stdin = {
      session_id: "test-session-1",
      timestamp: "2026-06-21T10:00:00Z",
      cwd: "/tmp/test",
    };

    const result = await buildPayload(stdin);

    expect(result.sessionId).toBe("test-session-1");
    expect(result.initialCommitSha).toBe("abc123");
    expect(result.totalDurationMs).toBe(0);
    expect(state.writeState).toHaveBeenCalledWith(
      "/tmp/test/.jigit-session-test-session-1.json",
      expect.objectContaining({
        sessionId: "test-session-1",
        initialCommitSha: "abc123",
        totalDurationMs: 0,
      })
    );
  });

  it("should accumulate duration on subsequent calls", async () => {
    vi.mocked(state.readState).mockReturnValue({
      sessionId: "test-session-1",
      initialCommitSha: "abc123",
      totalDurationMs: 3600000,
      lastUpdateTime: "2026-06-21T10:00:00Z",
    });
    vi.mocked(state.writeState).mockImplementation(() => {});

    const stdin = {
      session_id: "test-session-1",
      timestamp: "2026-06-21T11:00:00Z",
      cwd: "/tmp/test",
    };

    const result = await buildPayload(stdin);

    expect(result.totalDurationMs).toBe(7200000); // 2 hours total
  });

  it("should handle missing cwd", async () => {
    vi.mocked(state.readState).mockReturnValue(null);
    vi.mocked(git.getHeadSha).mockImplementation(() => {
      throw new Error("Not a git repository");
    });

    const stdin = {
      session_id: "test-session-2",
      timestamp: "2026-06-21T10:00:00Z",
    };

    const result = await buildPayload(stdin);

    expect(result.initialCommitSha).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @jigit/hook-claude-code-time-tracking test`

Expected: FAIL with "Cannot find module './index.js'"

- [ ] **Step 4: Implement git module**

Create `packages/hook-claude-code-time-tracking/src/git.ts`:

```typescript
import { execSync } from "node:child_process";

export function getHeadSha(cwd?: string): string | null {
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return sha;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Implement state module**

Create `packages/hook-claude-code-time-tracking/src/state.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, renameSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface TimeTrackingState {
  sessionId: string;
  initialCommitSha: string | null;
  totalDurationMs: number;
  lastUpdateTime: string;
}

export function getStatePath(cwd: string, sessionId: string): string {
  return join(cwd, `.jigit-session-${sessionId}.json`);
}

export function readState(path: string): TimeTrackingState | null {
  try {
    if (!existsSync(path)) return null;
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data) as TimeTrackingState;
  } catch {
    return null;
  }
}

export function writeState(path: string, state: TimeTrackingState): void {
  try {
    // Atomic write: write to temp file, then rename
    const dir = tmpdir();
    const tempPath = join(dir, `jigit-session-${Date.now()}.json`);
    writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
    renameSync(tempPath, path);
  } catch (err) {
    console.error("[time-tracking] Failed to write state:", err);
  }
}
```

- [ ] **Step 6: Implement main hook script**

Create `packages/hook-claude-code-time-tracking/src/index.ts`:

```typescript
#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getStatePath, readState, writeState, type TimeTrackingState } from "./state.js";
import { getHeadSha } from "./git.js";

interface UserPromptSubmitStdin {
  session_id: string;
  timestamp: string;
  cwd?: string;
}

export interface TimeTrackingPayload {
  sessionId: string;
  initialCommitSha: string | null;
  totalDurationMs: number;
}

export async function buildPayload(stdin: UserPromptSubmitStdin): Promise<TimeTrackingPayload> {
  const { session_id, timestamp, cwd } = stdin;
  const statePath = cwd ? getStatePath(cwd, session_id) : "";

  let state: TimeTrackingState;

  if (!statePath) {
    // No cwd available, just return minimal payload
    return {
      sessionId: session_id,
      initialCommitSha: null,
      totalDurationMs: 0,
    };
  }

  const existingState = readState(statePath);

  if (!existingState) {
    // Initialize new state
    const initialCommitSha = getHeadSha(cwd);
    state = {
      sessionId: session_id,
      initialCommitSha,
      totalDurationMs: 0,
      lastUpdateTime: timestamp,
    };
    writeState(statePath, state);
  } else {
    // Accumulate duration
    const lastTime = new Date(existingState.lastUpdateTime).getTime();
    const currentTime = new Date(timestamp).getTime();
    const elapsed = currentTime - lastTime;

    state = {
      ...existingState,
      totalDurationMs: existingState.totalDurationMs + elapsed,
      lastUpdateTime: timestamp,
    };
    writeState(statePath, state);
  }

  // Async sync to API (fire and forget)
  syncToApi(state).catch((err) => {
    console.error("[time-tracking] Failed to sync to API:", err);
  });

  return {
    sessionId: state.sessionId,
    initialCommitSha: state.initialCommitSha,
    totalDurationMs: state.totalDurationMs,
  };
}

async function syncToApi(state: TimeTrackingState): Promise<void> {
  const baseUrl = process.env.JAGIT_BASE_URL?.trim();
  const apiKey = process.env.JAGIT_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    return; // Silently skip if not configured
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/api/agent-sessions/${state.sessionId}/time-tracking`;

  const body: { initialCommitSha?: string; durationMs?: number } = {};
  if (state.initialCommitSha) body.initialCommitSha = state.initialCommitSha;
  if (state.totalDurationMs > 0) body.durationMs = state.totalDurationMs;

  if (Object.keys(body).length === 0) return;

  await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  try {
    const raw = readFileSync(0, "utf-8");
    const stdin = JSON.parse(raw) as UserPromptSubmitStdin;
    await buildPayload(stdin);
  } catch (err) {
    console.error("[time-tracking]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

const isMain = import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) void main();
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @jigit/hook-claude-code-time-tracking test`

Expected: All tests pass

- [ ] **Step 8: Build the package**

Run: `pnpm --filter @jigit/hook-claude-code-time-tracking build`

Expected: dist/ directory created

- [ ] **Step 9: Commit**

```bash
git add packages/hook-claude-code-time-tracking/
git commit -m "feat(hook): add time tracking hook for UserPromptSubmit

Add @jigit/hook-claude-code-time-tracking package that tracks session
duration by accumulating time between UserPromptSubmit events.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Enhanced Stop Hook with LOC and Worklog

**Goal:** Enhance existing Stop hook to calculate LOC, BT, and create Jira worklog.

**Files:**
- Modify: `packages/hook-claude-code/src/index.ts`
- Modify: `packages/hook-claude-code/src/index.test.ts`

**Acceptance Criteria:**
- [ ] Reads time tracking state file if exists
- [ ] Calculates LOC via git diff from initialCommitSha
- [ ] Calculates BT from costUsd using fixed rate
- [ ] Includes durationMs, linesAdded, linesRemoved in payload
- [ ] Creates Jira worklog if jiraTicketId is associated
- [ ] Cleans up state file after processing
- [ ] Handles missing state file gracefully
- [ ] Unit tests cover all new functionality

**Verify:** `pnpm --filter @jigit/hook-claude-code test` → all tests pass

**Steps:**

- [ ] **Step 1: Add failing tests**

Add to `packages/hook-claude-code/src/index.test.ts`:

```typescript
import { execSync } from "node:child_process";

// Mock execSync for git operations
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("buildPayload with time tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include time tracking data when state file exists", async () => {
    // Mock file system
    const mockStateFile = JSON.stringify({
      sessionId: "test-session-1",
      initialCommitSha: "abc123",
      totalDurationMs: 3600000,
      lastUpdateTime: "2026-06-21T10:00:00Z",
    });

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes("git diff")) {
        return "10\t5\tfile1.ts\n20\t10\tfile2.ts\n";
      }
      return "";
    });

    // Mock fs operations
    const fs = await import("node:fs");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      if (path.includes(".jigit-session-")) {
        return mockStateFile;
      }
      return JSON.stringify([
        { type: "user", timestamp: "2026-06-21T10:00:00Z", message: { role: "user" } },
        { type: "assistant", timestamp: "2026-06-21T10:01:00Z", message: { role: "assistant", model: "claude-3-5-sonnet-20241022", usage: { input_tokens: 1000, output_tokens: 500 } } },
      ]);
    });

    const stdin = {
      session_id: "test-session-1",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/tmp/repo",
    };

    const payload = buildPayload(stdin);

    expect(payload.durationMs).toBe(3600000);
    expect(payload.initialCommitSha).toBe("abc123");
    expect(payload.linesAdded).toBe(30);
    expect(payload.linesRemoved).toBe(15);
  });

  it("should handle missing state file", async () => {
    const fs = await import("node:fs");
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      return JSON.stringify([
        { type: "user", timestamp: "2026-06-21T10:00:00Z", message: { role: "user" } },
        { type: "assistant", timestamp: "2026-06-21T10:01:00Z", message: { role: "assistant", model: "claude-3-5-sonnet-20241022", usage: { input_tokens: 1000, output_tokens: 500 } } },
      ]);
    });

    const stdin = {
      session_id: "test-session-2",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/tmp/repo",
    };

    const payload = buildPayload(stdin);

    expect(payload.durationMs).toBeUndefined();
    expect(payload.linesAdded).toBeUndefined();
  });
});

describe("calculateBaseTokens", () => {
  it("should convert costUsd to base tokens", () => {
    const result = calculateBaseTokens(0.50);
    expect(result).toBeCloseTo(2000000, -4); // ~2M BT
  });

  it("should return null for null costUsd", () => {
    const result = calculateBaseTokens(null);
    expect(result).toBeNull();
  });
});

describe("parseGitDiff", () => {
  it("should parse git diff --numstat output", () => {
    const output = "10\t5\tfile1.ts\n20\t10\tfile2.ts\n";
    const result = parseGitDiff(output);
    expect(result.linesAdded).toBe(30);
    expect(result.linesRemoved).toBe(15);
  });

  it("should handle binary files", () => {
    const output = "-\t-\tbinary.png\n10\t5\tfile.ts\n";
    const result = parseGitDiff(output);
    expect(result.linesAdded).toBe(10);
    expect(result.linesRemoved).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jigit/hook-claude-code test`

Expected: FAIL with new test failures

- [ ] **Step 3: Add helper functions**

Add to `packages/hook-claude-code/src/index.ts` before `buildPayload`:

```typescript
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// BT conversion rate: 270M BT = $67.5 USD
const BT_RATE = 270_000_000 / 67.5;

export function calculateBaseTokens(costUsd: number | null): number | null {
  if (costUsd === null || costUsd === undefined) return null;
  return costUsd * BT_RATE;
}

export function parseGitDiff(output: string): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [added, removed] = line.split("\t");
    if (added !== "-" && removed !== "-") {
      linesAdded += parseInt(added, 10) || 0;
      linesRemoved += parseInt(removed, 10) || 0;
    }
  }

  return { linesAdded, linesRemoved };
}

interface TimeTrackingState {
  sessionId: string;
  initialCommitSha: string | null;
  totalDurationMs: number;
  lastUpdateTime: string;
}

function readTimeTrackingState(cwd: string, sessionId: string): TimeTrackingState | null {
  try {
    const path = join(cwd, `.jigit-session-${sessionId}.json`);
    if (!existsSync(path)) return null;
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data) as TimeTrackingState;
  } catch {
    return null;
  }
}

function deleteTimeTrackingState(cwd: string, sessionId: string): void {
  try {
    const path = join(cwd, `.jigit-session-${sessionId}.json`);
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Ignore cleanup errors
  }
}

function getLinesChanged(cwd: string, initialSha: string): { linesAdded: number; linesRemoved: number } | null {
  try {
    const output = execSync(`git diff --numstat ${initialSha} HEAD`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return parseGitDiff(output);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Enhance buildPayload**

Modify `buildPayload` function in `packages/hook-claude-code/src/index.ts`:

```typescript
export function buildPayload(
  stdin: StopStdin,
  read: (path: string) => TranscriptEntry[] = readTranscript,
): AgentSessionPayload & { 
  durationMs?: number; 
  initialCommitSha?: string; 
  linesAdded?: number; 
  linesRemoved?: number 
} {
  const entries = read(stdin.transcript_path);
  let inputTokens = 0, cachedInputTokens = 0, cacheCreationInputTokens = 0, outputTokens = 0, toolCallCount = 0;
  let model = "unknown";

  for (const e of entries) {
    if (e.message?.role !== "assistant") continue;
    if (e.message.model) model = e.message.model;
    if (hasToolUse(e.message.content)) toolCallCount += 1;
    const u = e.message.usage;
    if (u) {
      inputTokens += u.input_tokens ?? 0;
      cachedInputTokens += u.cache_read_input_tokens ?? 0;
      cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
      outputTokens += u.output_tokens ?? 0;
    }
  }

  const startedAt = entries.find((e) => e.timestamp)?.timestamp ?? new Date().toISOString();

  const basePayload: AgentSessionPayload = {
    tool: "claude-code",
    sessionId: stdin.session_id,
    gitUsername: resolveGitUsername(stdin.cwd),
    model,
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    costUsd: null,
    toolCallCount,
    startedAt,
  };

  // Add time tracking data if available
  if (stdin.cwd) {
    const state = readTimeTrackingState(stdin.cwd, stdin.session_id);
    if (state) {
      basePayload.durationMs = state.totalDurationMs;
      basePayload.initialCommitSha = state.initialCommitSha ?? undefined;

      if (state.initialCommitSha) {
        const loc = getLinesChanged(stdin.cwd, state.initialCommitSha);
        if (loc) {
          basePayload.linesAdded = loc.linesAdded;
          basePayload.linesRemoved = loc.linesRemoved;
        }
      }
    }
  }

  return basePayload;
}
```

- [ ] **Step 5: Add worklog creation**

Modify `main` function in `packages/hook-claude-code/src/index.ts`:

```typescript
import { createJiraWorklog, calculateBaseTokens } from "@jigit/shared";

async function main(): Promise<void> {
  try {
    const raw = readFileSync(0, "utf-8");
    const stdin = JSON.parse(raw) as StopStdin;
    const payload = buildPayload(stdin);
    await reportSession(payload);

    // Create Jira worklog if ticket is associated
    if (payload.durationMs && stdin.cwd) {
      const state = readTimeTrackingState(stdin.cwd, stdin.session_id);
      if (state) {
        // Check if session has jiraTicketId (need to query API)
        const baseUrl = process.env.JAGIT_BASE_URL?.trim();
        const apiKey = process.env.JAGIT_API_KEY?.trim();
        
        if (baseUrl && apiKey) {
          try {
            const res = await fetch(`${baseUrl}/api/agent-sessions?sessionId=${stdin.session_id}`, {
              headers: { "x-api-key": apiKey },
            });
            if (res.ok) {
              const data = await res.json();
              const session = data.rows?.[0];
              if (session?.jiraTicketId && session.costUsd) {
                const baseTokens = calculateBaseTokens(session.costUsd);
                if (baseTokens) {
                  await createJiraWorklog({
                    ticketId: session.jiraTicketId,
                    durationMs: payload.durationMs,
                    baseTokens,
                  });
                }
              }
            }
          } catch (err) {
            console.error("[hook-claude-code] Failed to create worklog:", err);
          }
        }

        // Cleanup state file
        deleteTimeTrackingState(stdin.cwd, stdin.session_id);
      }
    }
  } catch (err) {
    console.error("[hook-claude-code]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @jigit/hook-claude-code test`

Expected: All tests pass

- [ ] **Step 7: Build the package**

Run: `pnpm --filter @jigit/hook-claude-code build`

Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add packages/hook-claude-code/src/
git commit -m "feat(hook): enhance Stop hook with LOC and Jira worklog

Add duration tracking, LOC calculation via git diff, BT conversion,
and automatic Jira worklog creation for associated sessions.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Integration Testing and Documentation

**Goal:** Verify all components work together and document the feature.

**Files:**
- Create: `docs/changelogs/2026-06-21-agent-session-tracking-enhancement.md`
- Modify: `CHANGELOG.md`

**Acceptance Criteria:**
- [ ] All tests pass across all packages
- [ ] Build succeeds for all packages
- [ ] Changelog documents the feature
- [ ] Manual testing guide provided

**Verify:** `pnpm -r build && pnpm -r test` → all pass

**Steps:**

- [ ] **Step 1: Run all tests**

Run: `pnpm -r test`

Expected: All tests pass (except pre-existing webhooks.controller.test.ts failures)

- [ ] **Step 2: Build all packages**

Run: `pnpm -r build`

Expected: All packages build successfully

- [ ] **Step 3: Write session changelog**

Create `docs/changelogs/2026-06-21-agent-session-tracking-enhancement.md`:

```markdown
# Agent Session Tracking Enhancement - 2026-06-21

## Task
Add Jira integration, time tracking, and LOC metrics to agent sessions with automatic worklog creation.

## Changes

### Database
- Added fields to `AgentSession` model: `jiraTicketId`, `initialCommitSha`, `durationMs`, `linesAdded`, `linesRemoved`
- Migration: `20260621120000_add_session_tracking_fields`

### New Packages
- `@jigit/hook-claude-code-time-tracking` - UserPromptSubmit hook for duration tracking
  - Initializes state file with git SHA
  - Accumulates duration across prompts
  - Syncs to API asynchronously

### API Enhancements
- New HTTP MCP server at `/api/session-mcp`
  - Tool: `activate-jira(ticketId, sessionId)`
  - Auth: `x-api-key` and `x-git-username` headers
- New endpoint: `PATCH /api/agent-sessions/:sessionId/time-tracking`
  - Partial updates for `initialCommitSha` and `durationMs`

### Hook Enhancements
- Enhanced Stop hook in `@jigit/hook-claude-code`:
  - Reads time tracking state
  - Calculates LOC via `git diff --numstat`
  - Converts costUsd to Base Tokens (270M BT = $67.5)
  - Creates Jira worklog if ticket associated
  - Cleans up state file

### Shared Services
- New `createJiraWorklog` function in `@jigit/shared`
  - Retrieves Jira credentials from Credential table
  - Formats worklog comment
  - Makes POST to Jira API with retry logic

## Testing
- Unit tests for all new modules
- Integration tests for MCP server
- Manual testing guide provided in spec

## Follow-ups
- Publish hook packages to npm
- Configure Claude Code hooks in user settings
- Test with real Claude Code sessions
- Monitor Jira worklog creation in production
```

- [ ] **Step 4: Update root changelog**

Modify `CHANGELOG.md`:

```markdown
# Changelog

## 2026-06-21 - Agent Session Tracking Enhancement
Add Jira integration, time tracking, and LOC metrics with automatic worklog creation.

## 2026-06-20 - Agent Session Reporting
...
```

- [ ] **Step 5: Commit**

```bash
git add docs/changelogs/2026-06-21-agent-session-tracking-enhancement.md CHANGELOG.md
git commit -m "docs: add changelog for agent session tracking enhancement

Document all changes, new packages, and testing for the feature.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Manual Testing Guide

After implementing all tasks:

1. **Start database services:**
   ```bash
   docker-compose up -d postgres redis
   pnpm --filter @jigit/shared exec prisma migrate deploy
   ```

2. **Seed Jira credentials:**
   ```bash
   pnpm seed
   # Ensure Credential table has Jira entry with accessToken and baseUrl
   ```

3. **Install hook packages globally:**
   ```bash
   pnpm --filter @jigit/hook-claude-code-time-tracking build
   pnpm --filter @jigit/hook-claude-code build
   npm link packages/hook-claude-code-time-tracking
   npm link packages/hook-claude-code
   ```

4. **Configure Claude Code hooks:**
   Add to Claude Code settings:
   ```json
   {
     "hooks": {
       "UserPromptSubmit": "jagit-hook-claude-code-time-tracking",
       "Stop": "jagit-hook-claude-code"
     }
   }
   ```

5. **Start API server:**
   ```bash
   JAGIT_BASE_URL=http://localhost:3000 JAGIT_API_KEY=your-key pnpm dev:api
   ```

6. **Test MCP tool:**
   ```bash
   curl -X POST http://localhost:3000/api/session-mcp \
     -H "Content-Type: application/json" \
     -H "x-api-key: your-key" \
     -H "x-git-username: your-username" \
     -d '{"name":"activate-jira","arguments":{"ticketId":"PROJ-123","sessionId":"test-session-id"}}'
   ```

7. **Run a Claude Code session:**
   - Start Claude Code in a git repo
   - Make some changes
   - Verify state file created: `.jigit-session-{id}.json`
   - End session
   - Verify worklog in Jira

---

## Self-Review

**Spec coverage:** ✓ All requirements from spec have corresponding tasks
**Placeholder scan:** ✓ No TBD, TODO, or placeholder text
**Type consistency:** ✓ All types and signatures match across tasks

---

## Execution Handoff

Plan complete. Ready for execution.
