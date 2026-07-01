# Session MCP `log-work` Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `log-work` session MCP tool that logs a Jira worklog entry for the session's already-associated ticket, deriving the logged duration from token cost (67.5 USD = 8h) instead of wall-clock time.

**Architecture:** `SessionMcpService` gains a `logWork` method that reads the resolved `AgentSession`'s `costUsd`, converts it to hours via a fixed USD-per-workday constant, computes `baseTokens` via the existing `PricingService` for comment text, and delegates the actual Jira POST to the existing shared `createJiraWorklog` helper (whose return type changes from `void` to a result object so callers can see success/failure). A new `log-work` tool is registered on the session MCP server alongside `activate-jira`, following the exact same error-handling shape.

**Tech Stack:** NestJS, Prisma, Vitest, `@modelcontextprotocol/sdk`, Zod.

---

### Task 1: `createJiraWorklog` returns a result object

**Goal:** Change `createJiraWorklog`'s return type from `Promise<void>` to `Promise<{ success: boolean; reason?: string }>` so callers can detect real success/failure, without changing its fire-and-forget error-swallowing behavior.

**Files:**
- Modify: `packages/shared/src/jira-worklog.ts`
- Test: `packages/shared/src/jira-worklog.test.ts`

**Acceptance Criteria:**
- [ ] Returns `{ success: true }` on a 2xx Jira response.
- [ ] Returns `{ success: false, reason: "No Jira credentials found" }` when no credential row exists.
- [ ] Returns `{ success: false, reason: "Incomplete Jira credentials" }` when the credential is missing `accessToken`/`baseUrl`.
- [ ] Returns `{ success: false, reason: "Jira API error: <status> <detail>" }` on a non-retryable (4xx) HTTP error.
- [ ] Returns `{ success: false, reason: "<error message>" }` when retries are exhausted (5xx) or an unexpected exception is thrown — still never throws.
- [ ] Existing caller `packages/hook-claude-code/src/index.ts` still compiles (it already ignores the return value).

**Verify:** `pnpm --filter @jagit/shared test` → all `jira-worklog.test.ts` cases pass; `pnpm --filter @jagit/hook-claude-code build` (or `pnpm -r build`) → compiles clean.

**Steps:**

- [ ] **Step 1: Update the failing tests first**

Replace `packages/shared/src/jira-worklog.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraWorklog } from "./jira-worklog.js";

// Mock PrismaService
vi.mock("./prisma.js", () => ({
  prisma: {
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

  it("should create worklog with formatted comment and return success:true", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 201 }));

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000, // 2.5 hours
      baseTokens: 2000000,
    });

    expect(result).toEqual({ success: true });
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

  it("should return success:false with a reason when credentials are missing", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(null);

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result).toEqual({ success: false, reason: "No Jira credentials found" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should return success:false with a reason when credentials are incomplete", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue({
      ...mockCredential,
      secrets: {},
    } as any);

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result).toEqual({ success: false, reason: "Incomplete Jira credentials" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should return success:false with a reason on a non-retryable API error", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain("401");
  });

  it("should return success:false with a reason when retries are exhausted", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("Server Error", { status: 500 }));

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
  }, 10000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jagit/shared test -- jira-worklog`
Expected: FAIL — current `createJiraWorklog` resolves to `undefined`, so `toEqual({ success: true })` etc. fail.

- [ ] **Step 3: Implement the return-object change**

Replace `packages/shared/src/jira-worklog.ts` with:

```ts
import { prisma } from "./prisma.js";
import { withRetry } from "./retry.js";

export interface CreateWorklogOpts {
  ticketId: string;
  durationMs: number;
  baseTokens: number;
  comment?: string;
}

export interface CreateWorklogResult {
  success: boolean;
  reason?: string;
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

export async function createJiraWorklog(opts: CreateWorklogOpts): Promise<CreateWorklogResult> {
  try {
    const credential = await prisma.credential.findUnique({
      where: { kind_name: { kind: "jira", name: "default" } },
    });

    if (!credential) {
      console.error("[jira-worklog] No Jira credentials found, skipping worklog");
      return { success: false, reason: "No Jira credentials found" };
    }

    const secrets = credential.secrets as { accessToken?: string };
    const meta = credential.meta as { baseUrl?: string };

    if (!secrets.accessToken || !meta.baseUrl) {
      console.error("[jira-worklog] Incomplete Jira credentials, skipping worklog");
      return { success: false, reason: "Incomplete Jira credentials" };
    }

    const timeSpentSeconds = Math.floor(opts.durationMs / 1000);
    const durationStr = formatDuration(opts.durationMs);
    const btStr = formatBT(opts.baseTokens);

    const defaultComment = `AI Logwork for ${opts.ticketId}\nTime Spent: ${durationStr}\nToken Spent: ${btStr} BT`;

    const url = `${meta.baseUrl.replace(/\/+$/, "")}/rest/api/2/issue/${opts.ticketId}/worklog`;

    return await withRetry(async () => {
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
        const reason = `Jira API error: ${res.status} ${detail}`;
        console.error(`[jira-worklog] Non-retryable error ${res.status}: ${detail}`);
        return { success: false, reason };
      }

      console.log(`[jira-worklog] Created worklog for ${opts.ticketId}`);
      return { success: true };
    }, { maxRetries: 3, baseDelayMs: 1000 });

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[jira-worklog] Failed to create worklog:", reason);
    return { success: false, reason };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @jagit/shared test -- jira-worklog`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Build to confirm the existing caller still compiles**

Run: `pnpm -r build`
Expected: clean build (the `hook-claude-code` caller does `await createJiraWorklog({...});` with no assignment, so the new return type doesn't break it)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/jira-worklog.ts packages/shared/src/jira-worklog.test.ts
git commit -m "$(cat <<'EOF'
feat(shared): make createJiraWorklog return a success/reason result

Callers that need to know whether the Jira POST actually succeeded
(the upcoming session-mcp log-work tool) can now inspect the result
instead of the previous fire-and-forget void return. The existing
hook-claude-code caller ignores the return value, so its behavior is
unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `PricingService` workday constants

**Goal:** Add `USD_PER_WORKDAY` and `HOURS_PER_WORKDAY` constants used by the hour-conversion formula.

**Files:**
- Modify: `packages/api/src/pricing/pricing.service.ts`
- Test: `packages/api/src/pricing/pricing.service.test.ts`

**Acceptance Criteria:**
- [ ] `USD_PER_WORKDAY === 67.5`
- [ ] `HOURS_PER_WORKDAY === 8`
- [ ] Both exported as named constants from `pricing.service.ts`, alongside `BASE_TOKEN_MODEL`.

**Verify:** `pnpm --filter @jagit/api test -- pricing.service` → new constant assertions pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

Add to `packages/api/src/pricing/pricing.service.test.ts` (new top-level `describe`, after the existing imports — keep all existing tests untouched):

```ts
import { USD_PER_WORKDAY, HOURS_PER_WORKDAY } from "./pricing.service.js";

describe("workday constants", () => {
  it("defines USD_PER_WORKDAY as 67.5", () => {
    expect(USD_PER_WORKDAY).toBe(67.5);
  });

  it("defines HOURS_PER_WORKDAY as 8", () => {
    expect(HOURS_PER_WORKDAY).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jagit/api test -- pricing.service`
Expected: FAIL with "USD_PER_WORKDAY is not exported" / `undefined`

- [ ] **Step 3: Add the constants**

In `packages/api/src/pricing/pricing.service.ts`, locate the existing line:

```ts
export const BASE_TOKEN_MODEL = "claude-haiku-4-5";
```

and add immediately after it:

```ts
export const BASE_TOKEN_MODEL = "claude-haiku-4-5";

// 67.5 USD of session cost converts to a full 8-hour logged workday.
export const USD_PER_WORKDAY = 67.5;
export const HOURS_PER_WORKDAY = 8;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jagit/api test -- pricing.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/pricing/pricing.service.ts packages/api/src/pricing/pricing.service.test.ts
git commit -m "$(cat <<'EOF'
feat(pricing): add USD_PER_WORKDAY/HOURS_PER_WORKDAY constants

Foundation constants for the session-mcp log-work tool's cost-to-hours
conversion (67.5 USD = 8h).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `SessionMcpService.logWork`

**Goal:** Implement the `logWork` method that resolves the session, validates preconditions, computes hours from cost, and delegates to `createJiraWorklog`.

**Files:**
- Modify: `packages/api/src/session-mcp/session-mcp.service.ts`
- Test: `packages/api/src/session-mcp/session-mcp.service.test.ts`

**Acceptance Criteria:**
- [ ] Resolves the session the same way `activateJira` does (explicit `sessionId`, or most-recently-active for `username` when omitted).
- [ ] Throws `NotFoundException` when no session is found.
- [ ] Throws `BadRequestException` when the resolved session has no `jiraTicketId`.
- [ ] Throws `BadRequestException` when the resolved session has no `costUsd`.
- [ ] Throws `BadRequestException` when `PricingService.getBaseTokenRate()` resolves to `null`.
- [ ] On success, calls `createJiraWorklog` with `ticketId` = session's `jiraTicketId`, `durationMs` = `Math.round((costUsd / 67.5) * 8 * 3600 * 1000)`, and `baseTokens` = `PricingService.toBaseTokens(costUsd, baseRate)`.
- [ ] Returns `{ success, ticketId, hoursLogged, baseTokens }` where `success`/`ticketId`/`baseTokens` come from the computed values and `createJiraWorklog`'s result, and `hoursLogged = costUsd / 67.5 * 8`.

**Verify:** `pnpm --filter @jagit/api test -- session-mcp.service` → all `logWork` cases pass.

**Steps:**

- [ ] **Step 1: Write the failing tests**

Replace `packages/api/src/session-mcp/session-mcp.service.test.ts` with (adds a `logWork` describe block; keeps all existing `activateJira` tests unchanged):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { SessionMcpService } from "./session-mcp.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { PricingService } from "../pricing/pricing.service.js";
import { NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import * as jiraWorklog from "@jagit/shared";

vi.mock("@jagit/shared", async () => {
  const actual = await vi.importActual<typeof import("@jagit/shared")>("@jagit/shared");
  return {
    ...actual,
    createJiraWorklog: vi.fn(),
  };
});

const mockPrisma = {
  client: {
    agentSession: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
};

const mockPricing = {
  getBaseTokenRate: vi.fn(),
  toBaseTokens: vi.fn(),
};

describe("SessionMcpService", () => {
  let service: SessionMcpService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SessionMcpService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PricingService, useValue: mockPricing },
      ],
    }).compile();

    service = module.get(SessionMcpService);
  });

  describe("activateJira", () => {
    it("should successfully associate a Jira ticket", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: null });
      mockPrisma.client.agentSession.update.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-123" });

      const result = await service.activateJira("s1", "testuser", "PROJ-123");

      expect(result.success).toBe(true);
      expect(result.jiraTicketId).toBe("PROJ-123");
      expect(mockPrisma.client.agentSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { jiraTicketId: "PROJ-123" },
        select: { id: true, sessionId: true, jiraTicketId: true },
      });
    });

    it("should throw NotFoundException if session not found", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue(null);

      await expect(service.activateJira("s1", "testuser", "PROJ-123")).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException if already associated with a DIFFERENT ticket", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-456" });

      await expect(service.activateJira("s1", "testuser", "PROJ-123")).rejects.toThrow(ConflictException);
    });

    it("should be idempotent if already associated with the SAME ticket", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-123" });
      mockPrisma.client.agentSession.update.mockResolvedValue({ id: "session-1", sessionId: "s1", jiraTicketId: "PROJ-123" });

      const result = await service.activateJira("s1", "testuser", "PROJ-123");

      expect(result.success).toBe(true);
    });

    it("should resolve the user's most recently active session when sessionId is omitted", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({ id: "session-1", sessionId: "s9", jiraTicketId: null });
      mockPrisma.client.agentSession.update.mockResolvedValue({ id: "session-1", sessionId: "s9", jiraTicketId: "PROJ-123" });

      const result = await service.activateJira(undefined, "testuser", "PROJ-123");

      expect(mockPrisma.client.agentSession.findFirst).toHaveBeenCalledWith({
        where: { user: { username: "testuser" } },
        orderBy: { lastUpdatedAt: "desc" },
      });
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe("s9");
    });

    it("should throw NotFoundException when sessionId is omitted and the user has no session", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue(null);

      await expect(service.activateJira(undefined, "testuser", "PROJ-123")).rejects.toThrow(NotFoundException);
    });
  });

  describe("logWork", () => {
    it("computes hoursLogged from costUsd and delegates to createJiraWorklog", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: 33.75, // half of 67.5 -> 4 hours
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(0.000001);
      mockPricing.toBaseTokens.mockReturnValue(33750000);
      vi.mocked(jiraWorklog.createJiraWorklog).mockResolvedValue({ success: true });

      const result = await service.logWork("s1", "testuser");

      expect(result).toEqual({
        success: true,
        ticketId: "PROJ-123",
        hoursLogged: 4,
        baseTokens: 33750000,
      });
      expect(jiraWorklog.createJiraWorklog).toHaveBeenCalledWith({
        ticketId: "PROJ-123",
        durationMs: 4 * 3600 * 1000,
        baseTokens: 33750000,
      });
    });

    it("resolves the user's most recently active session when sessionId is omitted", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s9",
        jiraTicketId: "PROJ-123",
        costUsd: 67.5,
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(0.000001);
      mockPricing.toBaseTokens.mockReturnValue(67500000);
      vi.mocked(jiraWorklog.createJiraWorklog).mockResolvedValue({ success: true });

      const result = await service.logWork(undefined, "testuser");

      expect(mockPrisma.client.agentSession.findFirst).toHaveBeenCalledWith({
        where: { user: { username: "testuser" } },
        orderBy: { lastUpdatedAt: "desc" },
      });
      expect(result.hoursLogged).toBe(8);
    });

    it("throws NotFoundException when no session is found", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue(null);

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when the session has no jiraTicketId", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: null,
        costUsd: 10,
      });

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(BadRequestException);
      await expect(service.logWork("s1", "testuser")).rejects.toThrow(/activate-jira/);
    });

    it("throws BadRequestException when the session has no costUsd", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: null,
      });

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the base token rate is unavailable", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: 10,
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(null);

      await expect(service.logWork("s1", "testuser")).rejects.toThrow(BadRequestException);
    });

    it("surfaces success:false from createJiraWorklog without throwing", async () => {
      mockPrisma.client.agentSession.findFirst.mockResolvedValue({
        id: "session-1",
        sessionId: "s1",
        jiraTicketId: "PROJ-123",
        costUsd: 67.5,
      });
      mockPricing.getBaseTokenRate.mockResolvedValue(0.000001);
      mockPricing.toBaseTokens.mockReturnValue(67500000);
      vi.mocked(jiraWorklog.createJiraWorklog).mockResolvedValue({ success: false, reason: "Jira API error: 401" });

      const result = await service.logWork("s1", "testuser");

      expect(result.success).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @jagit/api test -- session-mcp.service`
Expected: FAIL — `service.logWork` is not a function; `PricingService` provider unused error.

- [ ] **Step 3: Implement `logWork`**

Replace the full body of `packages/api/src/session-mcp/session-mcp.service.ts` with:

```ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { PricingService, USD_PER_WORKDAY, HOURS_PER_WORKDAY } from "../pricing/pricing.service.js";
import { createJiraWorklog, type CreateWorklogResult } from "@jagit/shared";

export interface LogWorkResult {
  success: boolean;
  ticketId: string;
  hoursLogged: number;
  baseTokens: number | null;
}

@Injectable()
export class SessionMcpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  private async resolveSession(sessionId: string | undefined, username: string) {
    const session = sessionId
      ? await this.prisma.client.agentSession.findFirst({
          where: { sessionId, user: { username } },
        })
      : await this.prisma.client.agentSession.findFirst({
          where: { user: { username } },
          orderBy: { lastUpdatedAt: "desc" },
        });

    if (!session) {
      throw new NotFoundException(
        sessionId
          ? `Session ${sessionId} not found for user ${username}`
          : `No active session found for user ${username}`
      );
    }

    return session;
  }

  async activateJira(sessionId: string | undefined, username: string, ticketId: string) {
    const session = await this.resolveSession(sessionId, username);

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

  async logWork(sessionId: string | undefined, username: string): Promise<LogWorkResult> {
    const session = await this.resolveSession(sessionId, username);

    if (!session.jiraTicketId) {
      throw new BadRequestException(
        "Session has no associated Jira ticket; call activate-jira first"
      );
    }

    if (session.costUsd == null) {
      throw new BadRequestException(
        "Session has no recorded cost; cannot compute work duration"
      );
    }

    const baseRate = await this.pricing.getBaseTokenRate();
    if (baseRate == null) {
      throw new BadRequestException(
        "Base token rate unavailable; cannot compute work duration"
      );
    }

    const hoursLogged = (session.costUsd / USD_PER_WORKDAY) * HOURS_PER_WORKDAY;
    const durationMs = Math.round(hoursLogged * 3600 * 1000);
    const baseTokens = this.pricing.toBaseTokens(session.costUsd, baseRate);

    const result: CreateWorklogResult = await createJiraWorklog({
      ticketId: session.jiraTicketId,
      durationMs,
      baseTokens: baseTokens ?? 0,
    });

    return {
      success: result.success,
      ticketId: session.jiraTicketId,
      hoursLogged,
      baseTokens,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @jagit/api test -- session-mcp.service`
Expected: PASS (all `activateJira` + `logWork` cases)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/session-mcp/session-mcp.service.ts packages/api/src/session-mcp/session-mcp.service.test.ts
git commit -m "$(cat <<'EOF'
feat(session-mcp): add SessionMcpService.logWork

Resolves the session's associated Jira ticket and cost, converts cost
to hours (67.5 USD = 8h), and delegates to createJiraWorklog. Refused
with BadRequestException when the session has no ticket, no cost, or
the base token rate is unavailable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire `PricingService` into `SessionMcpModule`

**Goal:** Make `PricingService` available for injection into `SessionMcpService` by importing `PricingModule`.

**Files:**
- Modify: `packages/api/src/session-mcp/session-mcp.module.ts`

**Acceptance Criteria:**
- [ ] `SessionMcpModule` imports `PricingModule`.
- [ ] `pnpm -r build` succeeds (Nest can resolve `PricingService` for `SessionMcpService`).

**Verify:** `pnpm --filter @jagit/api build` → clean; `pnpm --filter @jagit/api test` → no DI-resolution errors anywhere in the suite (e.g. no "Nest can't resolve dependencies of SessionMcpService" if any test boots the real module — current tests use `useValue` mocks so this is a build-time check, not test-time).

**Steps:**

- [ ] **Step 1: Update the module**

Replace `packages/api/src/session-mcp/session-mcp.module.ts` with:

```ts
import { Module } from "@nestjs/common";
import { SessionMcpController } from "./session-mcp.controller.js";
import { SessionMcpService } from "./session-mcp.service.js";
import { PricingModule } from "../pricing/pricing.module.js";

@Module({
  imports: [PricingModule],
  controllers: [SessionMcpController],
  providers: [SessionMcpService],
})
export class SessionMcpModule {}
```

- [ ] **Step 2: Build to verify DI resolves**

Run: `pnpm --filter @jagit/api build`
Expected: clean build, no errors

- [ ] **Step 3: Run the full API test suite to confirm no regressions**

Run: `pnpm --filter @jagit/api test`
Expected: all tests pass (same count as before plus the new `logWork`/`log-work` tests added in this plan)

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/session-mcp/session-mcp.module.ts
git commit -m "$(cat <<'EOF'
fix(session-mcp): import PricingModule so logWork can inject PricingService

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Register the `log-work` MCP tool

**Goal:** Expose `logWork` as a `log-work` tool on the session MCP server, following the exact same error-handling convention as `activate-jira`.

**Files:**
- Modify: `packages/api/src/session-mcp/session-mcp.server.ts`
- Modify: `packages/api/src/session-mcp/session-mcp.controller.test.ts`

**Acceptance Criteria:**
- [ ] `tools/list` includes a `log-work` tool with `description` containing "Jira" and an optional `sessionId` input property.
- [ ] `tools/call log-work` with a successful `logWork` resolution returns a `CallToolResult` whose text content JSON-parses to the service's return value.
- [ ] `tools/call log-work` omitting `sessionId` calls `service.logWork(undefined, username)`.
- [ ] `NotFoundException`/`BadRequestException` from `logWork` map to `isError: true` with the exception's message (not an HTTP error).
- [ ] An unexpected exception maps to `isError: true` with text `"Internal error"` (no internal details leaked) and is logged server-side.

**Verify:** `pnpm --filter @jagit/api test -- session-mcp.controller` → all new and existing cases pass.

**Steps:**

- [ ] **Step 1: Add the failing controller tests**

In `packages/api/src/session-mcp/session-mcp.controller.test.ts`, add `logWork: vi.fn()` to `mockSvc`:

```ts
const mockSvc = {
  activateJira: vi.fn(),
  logWork: vi.fn(),
};
```

Add `BadRequestException` to the existing import:

```ts
import { NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
```

Then add a new top-level `describe` block (place it after the closing brace of `"MCP tools/call activate-jira"` and before `"Transport-level guards (unchanged)"`):

```ts
  describe("MCP tools/list — log-work", () => {
    it("should list log-work tool with correct schema", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/list"),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const tool = body.result.tools.find((t: { name: string }) => t.name === "log-work");
      expect(tool).toBeDefined();
      expect(tool.description).toContain("Jira");
      expect(tool.inputSchema.properties.sessionId).toBeDefined();
    });
  });

  describe("MCP tools/call log-work", () => {
    it("should return CallToolResult on success", async () => {
      mockSvc.logWork.mockResolvedValue({
        success: true,
        ticketId: "PROJ-123",
        hoursLogged: 4,
        baseTokens: 33750000,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "log-work",
          arguments: { sessionId: "test-session-1" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { jsonrpc: string; id: number; result: CallToolResult };
      expect(body.result.content[0].type).toBe("text");
      const data = JSON.parse((body.result.content[0] as TextContent).text);
      expect(data.success).toBe(true);
      expect(data.hoursLogged).toBe(4);
    });

    it("should call the service with sessionId undefined when omitted from arguments", async () => {
      mockSvc.logWork.mockResolvedValue({
        success: true,
        ticketId: "PROJ-123",
        hoursLogged: 8,
        baseTokens: 67500000,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "log-work",
          arguments: {},
        }),
      });

      expect(res.statusCode).toBe(200);
      expect(mockSvc.logWork).toHaveBeenCalledWith(undefined, "testuser");
    });

    it("should return isError:true for non-existent session (not HTTP 404)", async () => {
      mockSvc.logWork.mockRejectedValue(new NotFoundException("Session not found"));

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "log-work",
          arguments: { sessionId: "missing" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { jsonrpc: string; id: number; result: CallToolResult };
      expect(body.result.isError).toBe(true);
      expect((body.result.content[0] as TextContent).text).toContain("not found");
    });

    it("should return isError:true for a session missing a Jira ticket (not HTTP 400)", async () => {
      mockSvc.logWork.mockRejectedValue(
        new BadRequestException("Session has no associated Jira ticket; call activate-jira first")
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "log-work",
          arguments: { sessionId: "test-session-1" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { jsonrpc: string; id: number; result: CallToolResult };
      expect(body.result.isError).toBe(true);
      expect((body.result.content[0] as TextContent).text).toContain("activate-jira");
    });

    it("should return isError:true with a generic message for unexpected errors (no internal details leaked)", async () => {
      mockSvc.logWork.mockRejectedValue(new Error("Can't reach database server at `localhost:5432`"));

      const res = await app.inject({
        method: "POST",
        url: "/api/session-mcp",
        headers: validHeaders,
        payload: mcpRequest("tools/call", {
          name: "log-work",
          arguments: { sessionId: "test-session-1" },
        }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { jsonrpc: string; id: number; result: CallToolResult };
      expect(body.result.isError).toBe(true);
      const text = (body.result.content[0] as TextContent).text;
      expect(text).not.toContain("localhost");
      expect(text).toBe("Internal error");
    });
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @jagit/api test -- session-mcp.controller`
Expected: FAIL — `log-work` tool not found in `tools/list`.

- [ ] **Step 3: Register the tool**

Replace the full body of `packages/api/src/session-mcp/session-mcp.server.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @jagit/api test -- session-mcp.controller`
Expected: PASS (all existing `activate-jira` + new `log-work` cases)

- [ ] **Step 5: Run the full repo build and test suite**

Run: `pnpm -r build && pnpm -r test`
Expected: clean build; all tests pass repo-wide (no regressions in `agent-sessions`, `hook-claude-code`, etc.)

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/session-mcp/session-mcp.server.ts packages/api/src/session-mcp/session-mcp.controller.test.ts
git commit -m "$(cat <<'EOF'
feat(session-mcp): register log-work MCP tool

Lets an agent log Jira work time derived from token cost (67.5 USD =
8h) for the session's already-associated ticket. Follows the same
isError-on-business-exception convention as activate-jira.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Session logging & changelog

**Goal:** Record this session per `CLAUDE.md`'s session-logging convention.

**Files:**
- Create: `docs/changelogs/2026-06-22-<HHMM>-session-mcp-log-work.md` (use the actual time of completion)
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (Current plan progress section)

**Acceptance Criteria:**
- [ ] Per-session changelog file describes the task, files touched, tests added/run, and follow-ups (the BT-rate inconsistency with the Stop hook, and the no-dedup limitation noted in the spec's Risks section).
- [ ] `CHANGELOG.md` has a new one/two-line entry at the top.
- [ ] `CLAUDE.md`'s "Current plan progress" reflects this work as the latest completed item.

**Verify:** Manual review — files exist and read coherently; `git status` shows only the intended files changed.

**Steps:**

- [ ] **Step 1: Write the per-session changelog**

Create `docs/changelogs/2026-06-22-<HHMM>-session-mcp-log-work.md` (fill in the real completion time) with sections: Task, What Changed (list the 5 files per task above), Tests Added/Run (`pnpm --filter @jagit/shared test`, `pnpm --filter @jagit/api test`, `pnpm -r build`), Follow-ups (BT-rate divergence between the Stop hook's hardcoded `4,000,000 BT/USD` and `PricingService`'s dynamic rate; no dedup guard against multiple `log-work` calls for the same session).

- [ ] **Step 2: Update root CHANGELOG.md**

Prepend a dated entry, e.g.:

```markdown
## 2026-06-22

- Added `log-work` session MCP tool: logs Jira worklog time derived from token
  cost (67.5 USD = 8h) for a session's already-associated ticket.
```

- [ ] **Step 3: Update CLAUDE.md plan progress**

Update the "Current plan progress" → "Last completed" line to mention this tool, and "Next up" to drop the now-done "Jira Worklog Service" item (replace with whatever the next real item is, or mark `_n/a_` if none is known yet).

- [ ] **Step 4: Commit**

```bash
git add docs/changelogs/2026-06-22-*-session-mcp-log-work.md CHANGELOG.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: log session-mcp log-work tool session and update plan progress

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Spec Coverage

- §3 (formula) → Task 3.
- §4.1 (constants) → Task 2.
- §4.2 (`logWork` method + error branches) → Task 3.
- §4.3 (`createJiraWorklog` return-type change) → Task 1.
- §4.4 (MCP tool registration) → Task 5.
- §4.5 (module wiring) → Task 4.
- §5 (testing) → covered within each task's own test steps.
- §6 (files touched) → Tasks 1–5 cover every file listed; `hook-claude-code` is build-verified only (Task 1 Step 5), per spec's explicit no-functional-change note.
- §7 (risks: BT-rate divergence, no dedup) → recorded as follow-ups in Task 6's changelog, not addressed in code (matches spec's explicit "not addressed here").
