# Agent Session Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect per-session token/cost/model/tool-call metadata from AI coding agents (Claude Code first; Codex & Copilot CLI after spikes) and surface it live on the JiGit `/usage` dashboard via an idempotent `POST /api/agent-sessions` upsert.

**Architecture:** A new shared package `@jigit/agent-reporter` owns the Zod payload schema + `reportSession()` + `resolveGitUsername()` (single source of truth, imported by both hooks and API). Thin per-tool hook bin packages parse their native session logs and call `reportSession()`. A new NestJS `AgentSessionModule` (sibling to `UsageModule`) upserts rows keyed by `(tool, sessionId)` into a new `AgentSession` Prisma model attached to the existing `User`. The dashboard `/usage` page gains a "Live Sessions" tab that reads the new endpoints.

**Tech Stack:** TypeScript, pnpm workspaces, NestJS + Fastify, Prisma + Postgres, Zod, Vitest, React + Vite + shadcn/ui, `@jigit/shared` (`withRetry`, `loadConfig`).

---

## Naming & layout decisions (deviations from spec — read first)

The spec was written loosely; these are the **authoritative** choices for this plan, reconciled with the actual codebase:

1. **Scope is `@jigit/`, not `@jagit/`.** Every existing package is `@jigit/*` (`@jigit/shared`, `@jigit/api`). The spec's `@jagit/agent-reporter` / `@jagit/hook-*` are typos. Use `@jigit/agent-reporter`, `@jigit/hook-claude-code`, etc.
2. **Workspace glob is flat `packages/*`** (see `pnpm-workspace.yaml`). The spec's nested `packages/hooks/claude-code/` would NOT be picked up by pnpm. Use flat dirs: `packages/agent-reporter/`, `packages/hook-claude-code/`, `packages/hook-codex/`, `packages/hook-copilot/`.
3. **Env vars** keep the spec's names: `JAGIT_BASE_URL`, `JAGIT_API_KEY`, `JAGIT_GIT_USERNAME` (these are external hook-side env vars chosen for brand consistency with the product name; they are NOT the same as the API's `loadConfig()` keys). The API auth still reuses `loadConfig().dashboardApiToken` via `AuthGuard`.
4. **The stack is NestJS on a Fastify adapter**, not "Fastify" directly as the spec text says. Follow `UsageModule` patterns exactly (controller + service + module + `.test.ts` files, `app.inject` integration tests).
5. **Prisma enum** uses underscore members (`claude_code`, `codex`, `copilot`); the controller maps the hyphenated wire value `claude-code ↔ claude_code` at the boundary. `codex`/`copilot` need no mapping.

---

## File structure

**New shared package — `packages/agent-reporter/`:**
- `package.json` — `@jigit/agent-reporter`, ESM, depends on `zod` + `@jigit/shared`.
- `tsconfig.json` — mirrors `packages/shared/tsconfig.json`.
- `src/schema.ts` — `AgentSessionPayloadSchema` + inferred `AgentSessionPayload` type + `AGENT_TOOLS` const.
- `src/git-username.ts` — `resolveGitUsername(cwd?)`.
- `src/report.ts` — `reportSession(payload, opts?)`.
- `src/index.ts` — re-exports.
- `src/schema.test.ts`, `src/git-username.test.ts`, `src/report.test.ts`.

**New API module — `packages/api/src/agent-sessions/`:**
- `agent-sessions.controller.ts` — POST + 2 GET routes.
- `agent-sessions.service.ts` — upsert + list + get (Prisma).
- `agent-sessions.module.ts` — wires controller + service.
- `agent-sessions.controller.test.ts`, `agent-sessions.service.test.ts`.

**Prisma — `packages/shared/prisma/schema.prisma`:** add `AgentTool` enum + `AgentSession` model + `agentSessions` relation on `User`. New migration dir under `packages/shared/prisma/migrations/`.

**Hook packages (flat):** `packages/hook-claude-code/`, `packages/hook-codex/`, `packages/hook-copilot/` — each with `package.json` (`bin` entry), `tsconfig.json`, `src/index.ts` (the adapter), `src/index.test.ts`, `README.md`.

**Dashboard — `packages/dashboard/src/`:**
- `api/client.ts` — add `AgentSession` type + `listAgentSessions` / `getAgentSession`.
- `api/client.test.ts` — add tests for the two methods.
- `components/sessions/LiveSessionsTab.tsx`, `SessionsFilters.tsx`, `SessionSummaryCards.tsx`, `LiveSessionsTable.tsx`, `SessionDetailDrawer.tsx`.
- `pages/Usage.tsx` — add tab strip (Historical | Live Sessions).

**Docs:** spikes write findings into this plan's task notes and into `docs/changelogs/`.

---

## Task 0: Codex & Copilot reporting spikes (research, no production code)

**Goal:** Resolve the two open mechanism questions from spec §4.2/§4.3 so Tasks 7–8 are fully specified. Output is written findings, not shippable code.

**Files:**
- Create: `docs/superpowers/specs/2026-06-20-codex-copilot-spike-findings.md`

**Acceptance Criteria:**
- [ ] Codex: documented `~/.codex/sessions/*.jsonl` schema (exact field names for model, input/cached/output tokens, cost, tool/function calls, timestamps) OR a clear statement that a field is unavailable.
- [ ] Codex: chosen mechanism — **(A) filesystem watcher daemon** vs **(B) `$PATH` shim** — with one-paragraph rationale and the install/uninstall story.
- [ ] Codex: cumulative-vs-delta semantics confirmed (sum per-turn deltas, or take the last cumulative record).
- [ ] Copilot: documented whether/where `gh copilot` writes any usage/session data; the synthetic `sessionId` strategy (timestamp + PID); confirmation that `costUsd: null` is permanent (seat-based billing).
- [ ] Copilot: chosen install form (wrapper binary `gh-copilot-jagit` vs shell function).

**Verify:** Findings file exists and each AC above maps to a section in it. No test command (research task).

**Steps:**

- [ ] **Step 1: Probe Codex session logs**

```bash
# Inspect a real Codex session log if present; otherwise document the absence.
ls -la ~/.codex/sessions/ 2>/dev/null || echo "no codex sessions dir"
# Pretty-print the first few JSONL records of the most recent file:
f=$(ls -t ~/.codex/sessions/*.jsonl 2>/dev/null | head -1) && [ -n "$f" ] && head -5 "$f" | while read -r line; do echo "$line" | python3 -m json.tool; done
```

Record every key that appears, mapping each to a `AgentSessionPayload` field (or "unavailable").

- [ ] **Step 2: Decide Codex mechanism (A) vs (B)**

Default recommendation: **(B) `$PATH` shim** for Phase 1 — simpler install, no daemon lifecycle, fires on graceful exit. Note the tradeoff (won't fire on `kill -9`). Document the install: drop a `codex` shim earlier in `$PATH` that `exec`s the real `codex` then, on exit, runs `npx -y @jigit/hook-codex`.

- [ ] **Step 3: Probe Copilot CLI**

```bash
gh copilot --help 2>/dev/null || echo "gh copilot not installed"
# Look for any state/usage files:
ls -la ~/.config/gh-copilot/ ~/.cache/gh-copilot/ 2>/dev/null || echo "no copilot state dirs"
```

Document findings. If no telemetry exists, the Copilot adapter reports `model` (from CLI output or a constant), `costUsd: null`, `toolCallCount: null`, `inputTokens/outputTokens: 0` unless the CLI surfaces them.

- [ ] **Step 4: Write the findings doc**

Create `docs/superpowers/specs/2026-06-20-codex-copilot-spike-findings.md` with one section per AC. This doc is the input spec for Tasks 7 and 8.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-20-codex-copilot-spike-findings.md
git commit -m "$(cat <<'EOF'
docs(spike): record Codex & Copilot session-reporting findings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: `@jigit/agent-reporter` — payload schema

**Goal:** Create the shared package skeleton and the single-source-of-truth Zod schema both the hooks and the API import.

**Files:**
- Create: `packages/agent-reporter/package.json`
- Create: `packages/agent-reporter/tsconfig.json`
- Create: `packages/agent-reporter/src/schema.ts`
- Test: `packages/agent-reporter/src/schema.test.ts`

**Acceptance Criteria:**
- [ ] `pnpm install` links `@jigit/agent-reporter` into the workspace.
- [ ] `AgentSessionPayloadSchema` validates a complete payload and rejects bad inputs (negative tokens, empty `sessionId`, bad `tool`, non-datetime `startedAt`).
- [ ] `AGENT_TOOLS` exports `["claude-code", "codex", "copilot"]`.
- [ ] `AgentSessionPayload` type is exported.

**Verify:** `pnpm --filter @jigit/agent-reporter test` → all pass.

**Steps:**

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@jigit/agent-reporter",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@jigit/shared": "workspace:*",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

(Match the exact `vitest` version used elsewhere — copy from `packages/shared/package.json` devDeps if it pins a different one.)

- [ ] **Step 2: Create tsconfig.json**

Copy `packages/shared/tsconfig.json` verbatim into `packages/agent-reporter/tsconfig.json` (same compiler options: ESM, `outDir: dist`, `rootDir: src`).

- [ ] **Step 3: Write the failing test**

```ts
// packages/agent-reporter/src/schema.test.ts
import { describe, it, expect } from "vitest";
import { AgentSessionPayloadSchema, AGENT_TOOLS } from "./schema.js";

const valid = {
  tool: "claude-code",
  sessionId: "sess-123",
  gitUsername: "alice@example.com",
  model: "claude-opus-4-7",
  inputTokens: 100,
  cachedInputTokens: 20,
  outputTokens: 50,
  costUsd: 1.23,
  toolCallCount: 4,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("AgentSessionPayloadSchema", () => {
  it("accepts a complete valid payload", () => {
    expect(AgentSessionPayloadSchema.parse(valid)).toMatchObject({ tool: "claude-code" });
  });

  it("allows null costUsd and toolCallCount", () => {
    expect(AgentSessionPayloadSchema.parse({ ...valid, costUsd: null, toolCallCount: null })).toBeTruthy();
  });

  it("rejects negative tokens", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, inputTokens: -1 })).toThrow();
  });

  it("rejects empty sessionId", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, sessionId: "" })).toThrow();
  });

  it("rejects unknown tool", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, tool: "cursor" })).toThrow();
  });

  it("rejects non-datetime startedAt", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, startedAt: "yesterday" })).toThrow();
  });

  it("exposes AGENT_TOOLS", () => {
    expect(AGENT_TOOLS).toEqual(["claude-code", "codex", "copilot"]);
  });
});
```

- [ ] **Step 4: Run test — expect FAIL**

Run: `pnpm --filter @jigit/agent-reporter test`
Expected: FAIL — `./schema.js` does not exist.

- [ ] **Step 5: Implement schema.ts**

```ts
// packages/agent-reporter/src/schema.ts
import { z } from "zod";

export const AGENT_TOOLS = ["claude-code", "codex", "copilot"] as const;
export type AgentToolWire = (typeof AGENT_TOOLS)[number];

export const AgentSessionPayloadSchema = z.object({
  tool: z.enum(AGENT_TOOLS),
  sessionId: z.string().min(1).max(200),
  gitUsername: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  toolCallCount: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

export type AgentSessionPayload = z.infer<typeof AgentSessionPayloadSchema>;
```

- [ ] **Step 6: Run test — expect PASS**

Run: `pnpm --filter @jigit/agent-reporter test`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
pnpm install
git add packages/agent-reporter/package.json packages/agent-reporter/tsconfig.json packages/agent-reporter/src/schema.ts packages/agent-reporter/src/schema.test.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(agent-reporter): add shared AgentSessionPayload schema

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `@jigit/agent-reporter` — `resolveGitUsername`

**Goal:** Resolve the reporting identity from env → git config → fallback, each subprocess guarded so a hook never crashes the agent.

**Files:**
- Create: `packages/agent-reporter/src/git-username.ts`
- Test: `packages/agent-reporter/src/git-username.test.ts`

**Acceptance Criteria:**
- [ ] `JAGIT_GIT_USERNAME` env wins when set and non-empty.
- [ ] Falls back to `git -C <cwd> config user.email`, then `git -C <cwd> config user.name`, then `"unknown"`.
- [ ] Never throws even if `git` is absent / cwd invalid.

**Verify:** `pnpm --filter @jigit/agent-reporter test` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-reporter/src/git-username.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({ execSync: (...a: unknown[]) => execSyncMock(...a) }));

import { resolveGitUsername } from "./git-username.js";

describe("resolveGitUsername", () => {
  beforeEach(() => { execSyncMock.mockReset(); delete process.env.JAGIT_GIT_USERNAME; });
  afterEach(() => { delete process.env.JAGIT_GIT_USERNAME; });

  it("prefers JAGIT_GIT_USERNAME env", () => {
    process.env.JAGIT_GIT_USERNAME = "env-user";
    expect(resolveGitUsername("/tmp")).toBe("env-user");
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("falls back to git user.email", () => {
    execSyncMock.mockReturnValueOnce("alice@example.com\n");
    expect(resolveGitUsername("/tmp")).toBe("alice@example.com");
  });

  it("falls back to git user.name when email missing", () => {
    execSyncMock.mockImplementationOnce(() => { throw new Error("no email"); });
    execSyncMock.mockReturnValueOnce("Alice\n");
    expect(resolveGitUsername("/tmp")).toBe("Alice");
  });

  it("returns 'unknown' when git fails entirely", () => {
    execSyncMock.mockImplementation(() => { throw new Error("no git"); });
    expect(resolveGitUsername("/tmp")).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @jigit/agent-reporter test git-username`
Expected: FAIL — `./git-username.js` not found.

- [ ] **Step 3: Implement git-username.ts**

```ts
// packages/agent-reporter/src/git-username.ts
import { execSync } from "node:child_process";

function tryGit(args: string, cwd: string): string | undefined {
  try {
    const out = execSync(`git -C "${cwd}" ${args}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export function resolveGitUsername(cwd: string = process.cwd()): string {
  const fromEnv = process.env.JAGIT_GIT_USERNAME?.trim();
  if (fromEnv) return fromEnv;
  return tryGit("config user.email", cwd) ?? tryGit("config user.name", cwd) ?? "unknown";
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @jigit/agent-reporter test git-username`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent-reporter/src/git-username.ts packages/agent-reporter/src/git-username.test.ts
git commit -m "$(cat <<'EOF'
feat(agent-reporter): resolve git username from env/git config

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `@jigit/agent-reporter` — `reportSession` + index

**Goal:** POST a validated payload to `${JAGIT_BASE_URL}/api/agent-sessions` with `x-api-key`, retry on 5xx/network via `withRetry`, fail fast on 4xx, and NEVER throw to the caller.

**Files:**
- Create: `packages/agent-reporter/src/report.ts`
- Create: `packages/agent-reporter/src/index.ts`
- Test: `packages/agent-reporter/src/report.test.ts`

**Acceptance Criteria:**
- [ ] Validates payload with `AgentSessionPayloadSchema` before sending.
- [ ] Sends `POST` with headers `content-type: application/json` and `x-api-key: ${JAGIT_API_KEY}`.
- [ ] Retries on 5xx / thrown fetch error up to `maxRetries` (default from `withRetry`); does NOT retry on 4xx.
- [ ] Missing `JAGIT_BASE_URL` or `JAGIT_API_KEY` → logs to stderr, returns without throwing, no fetch.
- [ ] Any thrown error inside is swallowed (logged to stderr); `reportSession` resolves `void`.
- [ ] `index.ts` re-exports schema, type, `resolveGitUsername`, `reportSession`.

**Verify:** `pnpm --filter @jigit/agent-reporter test` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

```ts
// packages/agent-reporter/src/report.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportSession } from "./report.js";

const valid = {
  tool: "claude-code" as const,
  sessionId: "sess-1",
  gitUsername: "alice",
  model: "claude-opus-4-7",
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 5,
  costUsd: null,
  toolCallCount: 1,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("reportSession", () => {
  beforeEach(() => {
    process.env.JAGIT_BASE_URL = "http://api.test";
    process.env.JAGIT_API_KEY = "secret";
    vi.restoreAllMocks();
  });
  afterEach(() => { delete process.env.JAGIT_BASE_URL; delete process.env.JAGIT_API_KEY; });

  it("POSTs to /api/agent-sessions with x-api-key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await reportSession(valid);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/agent-sessions");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("secret");
    expect(JSON.parse(init.body).sessionId).toBe("sess-1");
  });

  it("does not throw on 4xx and does not retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(reportSession(valid)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx then gives up without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(reportSession(valid, { maxRetries: 2, baseDelayMs: 0 })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("skips and warns when env is missing", async () => {
    delete process.env.JAGIT_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportSession(valid);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });

  it("swallows invalid payloads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(reportSession({ ...valid, inputTokens: -1 } as never)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @jigit/agent-reporter test report`
Expected: FAIL — `./report.js` not found.

- [ ] **Step 3: Implement report.ts**

```ts
// packages/agent-reporter/src/report.ts
import { withRetry } from "@jigit/shared";
import { AgentSessionPayloadSchema, type AgentSessionPayload } from "./schema.js";

export interface ReportOpts {
  maxRetries?: number;
  baseDelayMs?: number;
}

class RetryableError extends Error {}

export async function reportSession(payload: AgentSessionPayload, opts: ReportOpts = {}): Promise<void> {
  try {
    const parsed = AgentSessionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[agent-reporter] invalid payload, skipping:", parsed.error.message);
      return;
    }

    const baseUrl = process.env.JAGIT_BASE_URL?.trim();
    const apiKey = process.env.JAGIT_API_KEY?.trim();
    if (!baseUrl || !apiKey) {
      console.error("[agent-reporter] JAGIT_BASE_URL and JAGIT_API_KEY required; skipping report");
      return;
    }

    const url = `${baseUrl.replace(/\/+$/, "")}/api/agent-sessions`;
    const maxRetries = opts.maxRetries ?? 3;
    const baseDelayMs = opts.baseDelayMs ?? 500;

    await withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) return;
      const detail = await res.text().catch(() => "");
      if (res.status >= 500) throw new RetryableError(`${res.status} ${detail}`);
      // 4xx: fail fast — log and stop (do not throw, withRetry would retry).
      console.error(`[agent-reporter] non-retryable ${res.status}: ${detail}`);
    }, { maxRetries, baseDelayMs });
  } catch (err) {
    console.error("[agent-reporter] report failed:", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 4: Implement index.ts**

```ts
// packages/agent-reporter/src/index.ts
export * from "./schema.js";
export * from "./git-username.js";
export * from "./report.js";
```

- [ ] **Step 5: Run test — expect PASS**

Run: `pnpm --filter @jigit/agent-reporter test`
Expected: PASS (all schema + git-username + report tests).

- [ ] **Step 6: Build to confirm it compiles standalone**

Run: `pnpm --filter @jigit/shared build && pnpm --filter @jigit/agent-reporter build`
Expected: clean build, `dist/` emitted.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-reporter/src/report.ts packages/agent-reporter/src/index.ts packages/agent-reporter/src/report.test.ts
git commit -m "$(cat <<'EOF'
feat(agent-reporter): add reportSession with bounded retries

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Prisma `AgentSession` model + migration

**Goal:** Add the `AgentTool` enum and `AgentSession` model keyed by `(tool, sessionId)`, related to `User`, and generate a migration.

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (User model ~line 206; append enum + model after line 225)
- Create: `packages/shared/prisma/migrations/<timestamp>_add_agent_session/migration.sql` (generated)

**Acceptance Criteria:**
- [ ] `User` gains `agentSessions AgentSession[]`.
- [ ] `AgentSession` matches spec §2 exactly (fields, defaults, `@@unique([tool, sessionId])`, two indexes).
- [ ] `prisma migrate dev` generates a migration and the client regenerates.
- [ ] `pnpm --filter @jigit/shared build` clean.

**Verify:** `pnpm --filter @jigit/shared exec prisma validate` → "The schema is valid"; then `pnpm --filter @jigit/shared build`.

**Steps:**

- [ ] **Step 1: Add the enum and model to schema.prisma**

Append after the `UsageUpload` model (after current line 225):

```prisma
// ─── AgentSession ────────────────────────────────────────────────────────────
// Live per-session usage snapshots pushed by per-tool hook adapters.

enum AgentTool {
  claude_code
  codex
  copilot
}

model AgentSession {
  id                String    @id @default(cuid())
  tool              AgentTool
  sessionId         String
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  model             String
  inputTokens       Int       @default(0)
  cachedInputTokens Int       @default(0)
  outputTokens      Int       @default(0)
  costUsd           Float?
  toolCallCount     Int?
  startedAt         DateTime
  lastUpdatedAt     DateTime  @updatedAt
  rawPayload        Json      @default("{}")
  createdAt         DateTime  @default(now())

  @@unique([tool, sessionId])
  @@index([userId, lastUpdatedAt])
  @@index([tool, lastUpdatedAt])
}
```

- [ ] **Step 2: Add the relation to the User model**

In the existing `User` model (lines 206–211), add the relation line after `uploads`:

```prisma
model User {
  id            String         @id @default(cuid())
  username      String         @unique
  createdAt     DateTime       @default(now())
  uploads       UsageUpload[]
  agentSessions AgentSession[]
}
```

- [ ] **Step 3: Validate the schema**

Run: `pnpm --filter @jigit/shared exec prisma validate`
Expected: "The schema at ... is valid 🚀".

- [ ] **Step 4: Generate the migration**

Requires Postgres up (`docker-compose up -d postgres` or existing DB; `DATABASE_URL` in env).

Run: `pnpm --filter @jigit/shared exec prisma migrate dev --name add_agent_session`
Expected: new migration dir created, "Your database is now in sync", client regenerated.

> If Postgres is unavailable in the dev sandbox, run `prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ... --script` to author the SQL, place it under a new migration dir, and note "migrate deploy required on a live DB" in the changelog. Do NOT skip creating the migration file.

- [ ] **Step 5: Build**

Run: `pnpm --filter @jigit/shared build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(shared): add AgentSession model and migration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `AgentSessionService` — upsert / list / get

**Goal:** Implement the Prisma data layer: idempotent upsert (overwrite-not-merge, find-or-create user), filtered+paginated list, single get with `rawPayload`.

**Files:**
- Create: `packages/api/src/agent-sessions/agent-sessions.service.ts`
- Test: `packages/api/src/agent-sessions/agent-sessions.service.test.ts`

**Acceptance Criteria:**
- [ ] `upsert(payload)` find-or-creates `User` by `gitUsername`, maps wire tool → enum, upserts on `(tool, sessionId)`: create sets all fields incl. `startedAt`; update overwrites `model, inputTokens, cachedInputTokens, outputTokens, costUsd, toolCallCount, rawPayload` but NOT `startedAt`.
- [ ] `rawPayload` defaults to `{}` when omitted.
- [ ] `list({ tool?, username?, from?, to?, limit, offset })` filters and orders by `lastUpdatedAt` DESC, includes `user.username`, returns `{ rows, total }`.
- [ ] `get(id)` returns the row incl. `rawPayload` or throws `NotFoundException`.

**Verify:** `pnpm --filter @jigit/api test agent-sessions.service` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test (mock PrismaService)**

```ts
// packages/api/src/agent-sessions/agent-sessions.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AgentSessionService } from "./agent-sessions.service.js";
import { PrismaService } from "../common/prisma.module.js";

function makePrisma() {
  return {
    client: {
      user: { upsert: vi.fn().mockResolvedValue({ id: "u1", username: "alice" }) },
      agentSession: {
        upsert: vi.fn().mockResolvedValue({ id: "as1", tool: "claude_code", sessionId: "s1", lastUpdatedAt: new Date() }),
        findMany: vi.fn().mockResolvedValue([{ id: "as1", user: { username: "alice" } }]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue({ id: "as1", rawPayload: { a: 1 } }),
      },
    },
  } as unknown as PrismaService;
}

const payload = {
  tool: "claude-code" as const, sessionId: "s1", gitUsername: "alice", model: "m",
  inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, costUsd: null, toolCallCount: 2,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("AgentSessionService", () => {
  let prisma: PrismaService;
  let svc: AgentSessionService;
  beforeEach(() => { prisma = makePrisma(); svc = new AgentSessionService(prisma); });

  it("upsert maps wire tool to enum and find-or-creates user", async () => {
    await svc.upsert(payload);
    expect((prisma as any).client.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: "alice" }, create: { username: "alice" } }),
    );
    const call = (prisma as any).client.agentSession.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ tool_sessionId: { tool: "claude_code", sessionId: "s1" } });
    expect(call.create.startedAt).toBeInstanceOf(Date);
    expect(call.update.startedAt).toBeUndefined(); // never overwritten
    expect(call.create.rawPayload).toEqual({});    // default when omitted
  });

  it("list filters by tool, returns rows + total", async () => {
    const res = await svc.list({ tool: "claude-code", limit: 50, offset: 0 });
    const args = (prisma as any).client.agentSession.findMany.mock.calls[0][0];
    expect(args.where.tool).toBe("claude_code");
    expect(args.orderBy).toEqual({ lastUpdatedAt: "desc" });
    expect(res).toEqual({ rows: [{ id: "as1", user: { username: "alice" } }], total: 1 });
  });

  it("get returns row with rawPayload", async () => {
    expect(await svc.get("as1")).toMatchObject({ id: "as1", rawPayload: { a: 1 } });
  });

  it("get throws NotFound when missing", async () => {
    (prisma as any).client.agentSession.findUnique.mockResolvedValueOnce(null);
    await expect(svc.get("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @jigit/api test agent-sessions.service`
Expected: FAIL — service file not found.

- [ ] **Step 3: Implement the service**

```ts
// packages/api/src/agent-sessions/agent-sessions.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import type { AgentSessionPayload } from "@jigit/agent-reporter";

const TOOL_WIRE_TO_ENUM: Record<AgentSessionPayload["tool"], "claude_code" | "codex" | "copilot"> = {
  "claude-code": "claude_code",
  codex: "codex",
  copilot: "copilot",
};

export interface ListFilters {
  tool?: AgentSessionPayload["tool"];
  username?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

@Injectable()
export class AgentSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(payload: AgentSessionPayload) {
    const tool = TOOL_WIRE_TO_ENUM[payload.tool];
    const user = await this.prisma.client.user.upsert({
      where: { username: payload.gitUsername },
      create: { username: payload.gitUsername },
      update: {},
    });

    const raw = (payload.rawPayload ?? {}) as object;
    const common = {
      model: payload.model,
      inputTokens: payload.inputTokens,
      cachedInputTokens: payload.cachedInputTokens,
      outputTokens: payload.outputTokens,
      costUsd: payload.costUsd,
      toolCallCount: payload.toolCallCount,
      rawPayload: raw as never,
    };

    return this.prisma.client.agentSession.upsert({
      where: { tool_sessionId: { tool, sessionId: payload.sessionId } },
      create: {
        tool,
        sessionId: payload.sessionId,
        userId: user.id,
        startedAt: new Date(payload.startedAt),
        ...common,
      },
      update: { ...common },
      select: { id: true, tool: true, sessionId: true, lastUpdatedAt: true },
    });
  }

  async list(filters: ListFilters) {
    const where: Record<string, unknown> = {};
    if (filters.tool) where.tool = TOOL_WIRE_TO_ENUM[filters.tool];
    if (filters.username) where.user = { username: filters.username };
    if (filters.from || filters.to) {
      where.lastUpdatedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.client.agentSession.findMany({
        where,
        orderBy: { lastUpdatedAt: "desc" },
        take: filters.limit,
        skip: filters.offset,
        include: { user: { select: { username: true } } },
      }),
      this.prisma.client.agentSession.count({ where }),
    ]);
    return { rows, total };
  }

  async get(id: string) {
    const row = await this.prisma.client.agentSession.findUnique({
      where: { id },
      include: { user: { select: { username: true } } },
    });
    if (!row) throw new NotFoundException(`AgentSession ${id} not found`);
    return row;
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @jigit/api test agent-sessions.service`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/agent-sessions/agent-sessions.service.ts packages/api/src/agent-sessions/agent-sessions.service.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add AgentSessionService with idempotent upsert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `AgentSessionController` + module + app wiring

**Goal:** Expose `POST /api/agent-sessions` (auth + Zod validation + wire→enum mapping in the response) and the two GET read endpoints; register the module.

**Files:**
- Create: `packages/api/src/agent-sessions/agent-sessions.controller.ts`
- Create: `packages/api/src/agent-sessions/agent-sessions.module.ts`
- Modify: `packages/api/src/app.module.ts` (import + add to `imports`)
- Test: `packages/api/src/agent-sessions/agent-sessions.controller.test.ts`

**Acceptance Criteria:**
- [ ] `POST /api/agent-sessions` without auth → 401; with auth + valid body → 201 `{ id, tool, sessionId, lastUpdatedAt }` (`tool` returned in wire form `claude-code`).
- [ ] `POST` with invalid body (bad tool / negative tokens) → 400.
- [ ] `GET /api/agent-sessions?...` (auth) → `{ rows, total }`; parses `limit`/`offset` with defaults (50/0).
- [ ] `GET /api/agent-sessions/:id` (auth) → single row; 404 path covered by service test.
- [ ] Module registered in `AppModule`.

**Verify:** `pnpm --filter @jigit/api test agent-sessions.controller` → all pass; `pnpm --filter @jigit/api build` clean.

**Steps:**

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/agent-sessions/agent-sessions.controller.test.ts
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AgentSessionController } from "./agent-sessions.controller.js";
import { AgentSessionService } from "./agent-sessions.service.js";
import { PrismaService } from "../common/prisma.module.js";

const mockSvc = {
  upsert: vi.fn().mockResolvedValue({ id: "as1", tool: "claude_code", sessionId: "s1", lastUpdatedAt: new Date("2026-06-20T10:00:00.000Z") }),
  list: vi.fn().mockResolvedValue({ rows: [{ id: "as1" }], total: 1 }),
  get: vi.fn().mockResolvedValue({ id: "as1", rawPayload: {} }),
};

const validBody = {
  tool: "claude-code", sessionId: "s1", gitUsername: "alice", model: "m",
  inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, costUsd: null, toolCallCount: 2,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("AgentSessionController", () => {
  let app: NestFastifyApplication;
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [AgentSessionController],
      providers: [
        { provide: AgentSessionService, useValue: mockSvc },
        { provide: PrismaService, useValue: { client: {} } },
      ],
    }).compile();
    app = mod.createNestApplication(new FastifyAdapter());
    app.setGlobalPrefix("api");
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app?.close(); });

  const auth = { authorization: "Bearer test-dashboard-token" };

  it("POST without auth → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent-sessions", payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it("POST with auth + valid body → 201 with wire tool", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent-sessions", headers: auth, payload: validBody });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ id: "as1", tool: "claude-code", sessionId: "s1" });
    expect(mockSvc.upsert).toHaveBeenCalledWith(expect.objectContaining({ tool: "claude-code" }));
  });

  it("POST with invalid body → 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/agent-sessions", headers: auth, payload: { ...validBody, tool: "cursor" } });
    expect(res.statusCode).toBe(400);
  });

  it("GET list with auth → rows + total", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agent-sessions?tool=claude-code&limit=10", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ rows: [{ id: "as1" }], total: 1 });
    expect(mockSvc.list).toHaveBeenCalledWith(expect.objectContaining({ tool: "claude-code", limit: 10, offset: 0 }));
  });

  it("GET by id with auth → row", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agent-sessions/as1", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ id: "as1" });
  });
});
```

> Note: the test token `test-dashboard-token` must match what `loadConfig().dashboardApiToken` returns under the test env. Confirm `packages/api/src/test-setup.ts` sets `DASHBOARD_API_TOKEN=test-dashboard-token` (the existing `usage.controller.test.ts` relies on this). If it does not, set it there.

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @jigit/api test agent-sessions.controller`
Expected: FAIL — controller not found.

- [ ] **Step 3: Implement the controller**

```ts
// packages/api/src/agent-sessions/agent-sessions.controller.ts
import { Controller, Get, Post, Param, Query, Body, UseGuards, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AgentSessionPayloadSchema, AGENT_TOOLS, type AgentSessionPayload } from "@jigit/agent-reporter";
import { loadConfig } from "@jigit/shared";
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

  @Get(":id")
  @ApiOperation({ summary: "Get a single agent session with raw payload" })
  async get(@Param("id") id: string) {
    return this.svc.get(id);
  }
}
```

> Wire-format note: `ENUM_TO_WIRE` here and `TOOL_WIRE_TO_ENUM` in the service are inverse maps; keep their key/value spellings in sync (`claude_code ↔ claude-code`).

- [ ] **Step 4: Implement the module**

```ts
// packages/api/src/agent-sessions/agent-sessions.module.ts
import { Module } from "@nestjs/common";
import { AgentSessionController } from "./agent-sessions.controller.js";
import { AgentSessionService } from "./agent-sessions.service.js";

@Module({
  controllers: [AgentSessionController],
  providers: [AgentSessionService],
})
export class AgentSessionModule {}
```

- [ ] **Step 5: Wire into AppModule**

In `packages/api/src/app.module.ts`, add the import and append to `imports`:

```ts
import { AgentSessionModule } from "./agent-sessions/agent-sessions.module.js";
```
```ts
    UsageModule,
    AgentSessionModule,
```

- [ ] **Step 6: Run test — expect PASS**

Run: `pnpm --filter @jigit/api test agent-sessions.controller`
Expected: PASS (5 tests).

- [ ] **Step 7: Build & full API tests**

Run: `pnpm --filter @jigit/api build && pnpm --filter @jigit/api test`
Expected: build clean; new tests pass (the 2 pre-existing `webhooks.controller.test.ts` 401 failures noted in CLAUDE.md may still fail — they are unrelated).

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/agent-sessions/agent-sessions.controller.ts packages/api/src/agent-sessions/agent-sessions.module.ts packages/api/src/agent-sessions/agent-sessions.controller.test.ts packages/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(api): expose POST/GET /api/agent-sessions endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `@jigit/hook-claude-code` adapter

**Goal:** Ship a `bin` package that, given Claude Code `Stop`-hook stdin JSON, parses the transcript JSONL, sums cumulative usage, builds the payload, and calls `reportSession` — exiting 0 on every path.

**Files:**
- Create: `packages/hook-claude-code/package.json`
- Create: `packages/hook-claude-code/tsconfig.json`
- Create: `packages/hook-claude-code/src/index.ts`
- Create: `packages/hook-claude-code/README.md`
- Test: `packages/hook-claude-code/src/index.test.ts`

**Acceptance Criteria:**
- [ ] Exports a pure `buildPayload(stdin, readTranscript)` that produces the spec §4.1 sums: `inputTokens` = Σ`usage.input_tokens`; `cachedInputTokens` = Σ(`cache_read_input_tokens` + `cache_creation_input_tokens`); `outputTokens` = Σ`usage.output_tokens`; `model` = last assistant `message.model`; `toolCallCount` = count of assistant messages containing a `tool_use` block; `startedAt` = first message `timestamp`; `costUsd` = `null`; `sessionId` = stdin `session_id`; `gitUsername` = `resolveGitUsername(cwd)`.
- [ ] CLI entry reads stdin, calls `buildPayload`, calls `reportSession`, and `process.exit(0)` even on thrown errors.
- [ ] `bin` field exposes `jigit-hook-claude-code`.
- [ ] README leads with the `npx -y` `Stop`-hook snippet.

**Verify:** `pnpm --filter @jigit/hook-claude-code test` → all pass.

**Steps:**

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@jigit/hook-claude-code",
  "version": "0.0.0",
  "type": "module",
  "bin": { "jigit-hook-claude-code": "dist/index.js" },
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
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json** — copy `packages/agent-reporter/tsconfig.json`.

- [ ] **Step 3: Write the failing test**

```ts
// packages/hook-claude-code/src/index.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@jigit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jigit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload } from "./index.js";

const stdin = { session_id: "sess-9", transcript_path: "/tmp/t.jsonl", cwd: "/repo" };
const transcript = [
  { type: "user", timestamp: "2026-06-20T10:00:00.000Z", message: { role: "user", content: "hi" } },
  { type: "assistant", timestamp: "2026-06-20T10:00:01.000Z", message: { role: "assistant", model: "claude-opus-4-7",
    content: [{ type: "text", text: "ok" }], usage: { input_tokens: 100, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 40 } } },
  { type: "assistant", timestamp: "2026-06-20T10:00:02.000Z", message: { role: "assistant", model: "claude-opus-4-7",
    content: [{ type: "tool_use", name: "Bash", input: {} }], usage: { input_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 60 } } },
];

describe("buildPayload", () => {
  it("sums cumulative usage and derives fields", () => {
    const p = buildPayload(stdin, () => transcript);
    expect(p).toMatchObject({
      tool: "claude-code", sessionId: "sess-9", gitUsername: "alice", model: "claude-opus-4-7",
      inputTokens: 300, cachedInputTokens: 15, outputTokens: 100, costUsd: null, toolCallCount: 1,
      startedAt: "2026-06-20T10:00:00.000Z",
    });
  });

  it("tolerates assistant messages without usage", () => {
    const p = buildPayload(stdin, () => [{ type: "assistant", timestamp: "2026-06-20T10:00:00.000Z", message: { role: "assistant", model: "m", content: [] } }]);
    expect(p.inputTokens).toBe(0);
    expect(p.toolCallCount).toBe(0);
  });
});
```

- [ ] **Step 4: Run test — expect FAIL**

Run: `pnpm --filter @jigit/hook-claude-code test`
Expected: FAIL — `./index.js` not found.

- [ ] **Step 5: Implement index.ts**

```ts
#!/usr/bin/env node
// packages/hook-claude-code/src/index.ts
import { readFileSync } from "node:fs";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jigit/agent-reporter";

interface StopStdin { session_id: string; transcript_path: string; cwd?: string }
interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
}

function readTranscript(path: string): TranscriptEntry[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => { try { return JSON.parse(l) as TranscriptEntry; } catch { return {} as TranscriptEntry; } });
}

function hasToolUse(content: unknown): boolean {
  return Array.isArray(content) && content.some((b) => (b as { type?: string })?.type === "tool_use");
}

export function buildPayload(
  stdin: StopStdin,
  read: (path: string) => TranscriptEntry[] = readTranscript,
): AgentSessionPayload {
  const entries = read(stdin.transcript_path);
  let inputTokens = 0, cachedInputTokens = 0, outputTokens = 0, toolCallCount = 0;
  let model = "unknown";

  for (const e of entries) {
    if (e.message?.role !== "assistant") continue;
    if (e.message.model) model = e.message.model;
    if (hasToolUse(e.message.content)) toolCallCount += 1;
    const u = e.message.usage;
    if (u) {
      inputTokens += u.input_tokens ?? 0;
      cachedInputTokens += (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      outputTokens += u.output_tokens ?? 0;
    }
  }

  const startedAt = entries.find((e) => e.timestamp)?.timestamp ?? new Date().toISOString();

  return {
    tool: "claude-code",
    sessionId: stdin.session_id,
    gitUsername: resolveGitUsername(stdin.cwd),
    model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costUsd: null,
    toolCallCount,
    startedAt,
  };
}

async function main(): Promise<void> {
  try {
    const raw = readFileSync(0, "utf-8");
    const stdin = JSON.parse(raw) as StopStdin;
    await reportSession(buildPayload(stdin));
  } catch (err) {
    console.error("[hook-claude-code]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

// Run only as a CLI, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) void main();
```

- [ ] **Step 6: Run test — expect PASS**

Run: `pnpm --filter @jigit/hook-claude-code test`
Expected: PASS (2 tests).

- [ ] **Step 7: Write README.md**

```markdown
# @jigit/hook-claude-code

Reports per-session Claude Code usage to JiGit.

## Setup

Set in your shell rc:

    export JAGIT_BASE_URL="https://your-jigit-host"
    export JAGIT_API_KEY="<your DASHBOARD_API_TOKEN>"

Add to `~/.claude/settings.json` (or per-project `.claude/settings.json`):

    {
      "hooks": {
        "Stop": [{
          "matcher": "",
          "hooks": [{ "type": "command", "command": "npx -y @jigit/hook-claude-code" }]
        }]
      }
    }

No install needed — `npx -y` fetches on demand. For a permanent binary:
`npm i -g @jigit/hook-claude-code`, then use `jigit-hook-claude-code` as the command.

Identity defaults to `git config user.email`; override with `JAGIT_GIT_USERNAME`.
```

- [ ] **Step 8: Build & commit**

```bash
pnpm install
pnpm --filter @jigit/hook-claude-code build
git add packages/hook-claude-code pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(hook-claude-code): report Claude Code session usage via Stop hook

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `@jigit/hook-codex` + `@jigit/hook-copilot` adapters

**Goal:** Implement the Codex and Copilot CLI adapters per the Task 0 spike findings, each a `bin` package that builds the payload and calls `reportSession`, exiting 0 always.

**Files:**
- Create: `packages/hook-codex/{package.json,tsconfig.json,README.md}`, `src/index.ts`, `src/index.test.ts`
- Create: `packages/hook-copilot/{package.json,tsconfig.json,README.md}`, `src/index.ts`, `src/index.test.ts`

**Acceptance Criteria:**
- [ ] Codex: a pure `buildPayload(records)` that parses `~/.codex/sessions/*.jsonl` per the spike's confirmed schema, applying the spike's cumulative-vs-delta rule; `tool: "codex"`, `costUsd` from logs (or `null`), `toolCallCount` from `function_call` entries (or `null`).
- [ ] Codex install mechanism (shim or daemon) matches the spike decision and is documented in its README.
- [ ] Copilot: synthetic `sessionId` (`copilot-${Date.now()}-${pid}`), `tool: "copilot"`, `costUsd: null`, tokens/model per spike (0/constant if unavailable); pure `buildPayload` for whatever the CLI exposes.
- [ ] Both CLIs exit 0 on every path; both READMEs lead with `npx -y`.
- [ ] `bin` entries: `jigit-hook-codex`, `jigit-hook-copilot`.

**Verify:** `pnpm --filter @jigit/hook-codex test && pnpm --filter @jigit/hook-copilot test` → all pass.

**Steps:**

- [ ] **Step 1: Re-read the spike findings**

Open `docs/superpowers/specs/2026-06-20-codex-copilot-spike-findings.md`. The exact field names, delta/cumulative rule, and install mechanism below come from it. Where this plan shows placeholder field names (`tokens_in` etc.), replace them with the spike's confirmed names before writing tests.

- [ ] **Step 2: Scaffold both packages**

Copy the Task 7 `package.json`/`tsconfig.json` shape into `packages/hook-codex/` and `packages/hook-copilot/`, changing `name` to `@jigit/hook-codex` / `@jigit/hook-copilot` and `bin` to `jigit-hook-codex` / `jigit-hook-copilot`. Both depend on `@jigit/agent-reporter` (`workspace:*`).

- [ ] **Step 3: Codex — write the failing test (using spike field names)**

```ts
// packages/hook-codex/src/index.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@jigit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jigit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload } from "./index.js";

// Replace these record shapes with the spike's confirmed JSONL schema.
const records = [
  { type: "turn", model: "gpt-5-codex", input_tokens: 100, cached_input_tokens: 0, output_tokens: 40, cost_usd: 0.5, timestamp: "2026-06-20T10:00:00.000Z" },
  { type: "function_call", name: "shell" },
  { type: "turn", model: "gpt-5-codex", input_tokens: 50, cached_input_tokens: 0, output_tokens: 20, cost_usd: 0.3, timestamp: "2026-06-20T10:00:05.000Z" },
];

describe("codex buildPayload", () => {
  it("aggregates per the spike's delta/cumulative rule", () => {
    const p = buildPayload("codex-abc", "/repo", records);
    expect(p.tool).toBe("codex");
    expect(p.sessionId).toBe("codex-abc");
    // If spike says deltas: inputTokens === 150. If cumulative: last record's value.
    expect(p.inputTokens).toBeGreaterThan(0);
    expect(p.toolCallCount).toBe(1);
    expect(p.startedAt).toBe("2026-06-20T10:00:00.000Z");
  });
});
```

- [ ] **Step 4: Codex — implement index.ts**

Implement `buildPayload(sessionId, cwd, records)` applying the spike's confirmed aggregation, plus a `main()` that locates the latest `~/.codex/sessions/*.jsonl` (shim) or receives the path (daemon), reads + parses it, and calls `reportSession`. Guard every step; `process.exit(0)` in `finally`. Use the same `import.meta.url` CLI guard as Task 7.

- [ ] **Step 5: Codex — run test → PASS**

Run: `pnpm --filter @jigit/hook-codex test`
Expected: PASS.

- [ ] **Step 6: Copilot — write failing test + implement**

```ts
// packages/hook-copilot/src/index.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@jigit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jigit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload } from "./index.js";

describe("copilot buildPayload", () => {
  it("synthesizes a session id and null cost", () => {
    const p = buildPayload("/repo", { model: "gpt-4o" });
    expect(p.tool).toBe("copilot");
    expect(p.sessionId).toMatch(/^copilot-\d+-\d+$/);
    expect(p.costUsd).toBeNull();
    expect(p.gitUsername).toBe("alice");
  });
});
```

Implement `buildPayload(cwd, info)` returning `tool: "copilot"`, `sessionId: \`copilot-${Date.now()}-${process.pid}\``, tokens/model from `info` (defaults `0`/`"copilot"`), `costUsd: null`, `toolCallCount: null`, `startedAt: new Date().toISOString()`. `main()` runs `gh copilot "$@"` (per spike form), captures what it can, calls `reportSession`, exits 0.

- [ ] **Step 7: Copilot — run test → PASS**

Run: `pnpm --filter @jigit/hook-copilot test`
Expected: PASS.

- [ ] **Step 8: READMEs** — write `README.md` for each leading with the `npx -y` usage and the spike-chosen install form (Codex shim/daemon; Copilot wrapper/shell-function).

- [ ] **Step 9: Build & commit**

```bash
pnpm install
pnpm --filter @jigit/hook-codex build && pnpm --filter @jigit/hook-copilot build
git add packages/hook-codex packages/hook-copilot pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(hooks): add Codex and Copilot CLI session reporters

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Dashboard API client — `listAgentSessions` / `getAgentSession`

**Goal:** Add the typed client methods + types and test the URLs/params they build.

**Files:**
- Modify: `packages/dashboard/src/api/client.ts` (append after the Usage API block, ~line 352)
- Test: `packages/dashboard/src/api/client.test.ts` (add cases + imports)

**Acceptance Criteria:**
- [ ] `AgentSessionRow` + `AgentSessionListResponse` + `AgentSessionFilters` types exported.
- [ ] `listAgentSessions(filters)` builds `/agent-sessions?...` with only the provided params (URL-encoded).
- [ ] `getAgentSession(id)` builds `/agent-sessions/:id`.
- [ ] New client tests pass.

**Verify:** `pnpm --filter @jigit/dashboard test client` → all pass.

**Steps:**

- [ ] **Step 1: Add the failing tests**

In `packages/dashboard/src/api/client.test.ts`, extend the import on lines 4–9 with `listAgentSessions, getAgentSession`, and add:

```ts
  it("listAgentSessions builds query string from filters", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ rows: [], total: 0 }) } as any);
    await listAgentSessions({ tool: "claude-code", username: "alice", limit: 50, offset: 0 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("/api/agent-sessions?");
    expect(url).toContain("tool=claude-code");
    expect(url).toContain("username=alice");
    expect(url).toContain("limit=50");
  });

  it("getAgentSession builds /agent-sessions/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "as1" }) } as any);
    const row = await getAgentSession("as1");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agent-sessions/as1");
    expect(row.id).toBe("as1");
  });
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @jigit/dashboard test client`
Expected: FAIL — `listAgentSessions` is not exported.

- [ ] **Step 3: Implement client additions**

Append to `packages/dashboard/src/api/client.ts`:

```ts
// ─── Agent Sessions API ─────────────────────────────────────────────────────

export type AgentSessionTool = "claude-code" | "codex" | "copilot";

export interface AgentSessionRow {
  id: string;
  tool: string;          // enum form from API: claude_code | codex | copilot
  sessionId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  toolCallCount: number | null;
  startedAt: string;
  lastUpdatedAt: string;
  createdAt: string;
  rawPayload?: Record<string, unknown>;
  user: { username: string };
}

export interface AgentSessionListResponse {
  rows: AgentSessionRow[];
  total: number;
}

export interface AgentSessionFilters {
  tool?: AgentSessionTool;
  username?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const listAgentSessions = (filters: AgentSessionFilters = {}) => {
  const qs = new URLSearchParams();
  if (filters.tool) qs.set("tool", filters.tool);
  if (filters.username) qs.set("username", filters.username);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.limit != null) qs.set("limit", String(filters.limit));
  if (filters.offset != null) qs.set("offset", String(filters.offset));
  return request<AgentSessionListResponse>(`/agent-sessions?${qs.toString()}`);
};

export const getAgentSession = (id: string) =>
  request<AgentSessionRow>(`/agent-sessions/${encodeURIComponent(id)}`);
```

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @jigit/dashboard test client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/api/client.ts packages/dashboard/src/api/client.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): add agent-sessions API client methods

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Dashboard "Live Sessions" tab

**Goal:** Add a Historical | Live Sessions tab strip to `/usage`; the Live Sessions tab shows filters, 4 summary cards, a paginated table, and a row-click detail drawer with a raw-payload viewer.

**Files:**
- Create: `packages/dashboard/src/components/sessions/LiveSessionsTab.tsx`
- Create: `packages/dashboard/src/components/sessions/SessionsFilters.tsx`
- Create: `packages/dashboard/src/components/sessions/SessionSummaryCards.tsx`
- Create: `packages/dashboard/src/components/sessions/LiveSessionsTable.tsx`
- Create: `packages/dashboard/src/components/sessions/SessionDetailDrawer.tsx`
- Modify: `packages/dashboard/src/pages/Usage.tsx` (wrap existing body in a tab)

**Acceptance Criteria:**
- [ ] `/usage` shows a tab strip; "Historical (CodeBurn)" renders the existing page unchanged; "Live Sessions" renders `LiveSessionsTab`.
- [ ] Filters: tool dropdown (`all | claude-code | codex | copilot`), username dropdown (from `listUsageUsers`), date range (default last 7 days). Filter state persisted in URL params.
- [ ] Summary cards: total sessions, total input tokens, total output tokens, total cost (sums non-null `costUsd`; note count of rows missing cost).
- [ ] Table columns: User, Tool (badge), Model, Started, Last updated, Input, Cached, Output, Cost, Tool calls; default sort `lastUpdatedAt` DESC; pagination 50/page using `total` from the API.
- [ ] Row click opens `SessionDetailDrawer` with full fields + collapsible raw-payload JSON (from `getAgentSession`).
- [ ] `pnpm --filter @jigit/dashboard build` clean (no type errors).

**Verify:** `pnpm --filter @jigit/dashboard build` clean; `pnpm --filter @jigit/dashboard test` (client tests still green). Manual browser check noted below (no component test harness yet).

**Steps:**

- [ ] **Step 1: Check available shadcn primitives**

```bash
ls packages/dashboard/src/components/ui
```

Use whatever exists for Tabs / Table / Dialog-or-Sheet / Select / Badge / Card. If a `tabs` primitive is absent, render the tab strip with two buttons toggling local state (don't add new shadcn deps just for this). If a `sheet`/`drawer` is absent, use the existing `dialog` for the detail view.

- [ ] **Step 2: Build `SessionsFilters.tsx`**

A controlled component taking `{ tool, username, from, to }` + `onChange`, rendering the tool `Select`, the username `Select` (options from a `users` prop), and two date inputs. No data fetching here — parent owns state and URL sync.

- [ ] **Step 3: Build `SessionSummaryCards.tsx`**

Takes `rows: AgentSessionRow[]` (the current page) plus `total` and renders 4 cards. Sum tokens across rows; cost = sum of non-null `costUsd`; show "N sessions missing cost" when any `costUsd` is null.

> Note: summary reflects the current page of rows (Phase 1 keeps it simple — no separate aggregate endpoint per spec §2 "on-the-fly groupBy" is deferred to a later phase). Label the cards "this page" to avoid implying a full-range total.

- [ ] **Step 4: Build `LiveSessionsTable.tsx`**

Takes `rows` + `onRowClick(id)` + pagination props (`page`, `pageCount`, `onPageChange`). Render the columns from the AC; tool as a `Badge` (map enum `claude_code`→"Claude Code", etc.); format dates with `toLocaleString()`; render `costUsd` as `$x.xx` or `—` when null; `toolCallCount` as number or `—`.

- [ ] **Step 5: Build `SessionDetailDrawer.tsx`**

Takes `id | null` + `onClose`. When `id` set, `getAgentSession(id)` and show all fields + a `<details>`/collapsible `<pre>{JSON.stringify(rawPayload, null, 2)}</pre>`.

- [ ] **Step 6: Build `LiveSessionsTab.tsx` (the orchestrator)**

Owns filter state synced to URL params (reuse the `useSearchParams` pattern already in `Usage.tsx`), fetches `listUsageUsers()` for the username dropdown and `listAgentSessions(filters)` on filter/page change, holds `selectedId` for the drawer, and composes Filters + SummaryCards + Table + Drawer. Default date range = last 7 days computed on mount.

- [ ] **Step 7: Add the tab strip to `Usage.tsx`**

Read the current `Usage.tsx` fully first. Extract its existing JSX body into a local `HistoricalTab` (or keep inline) and wrap with a tab switcher; default tab = Historical. Use a `tab` URL param so deep links work: `?tab=sessions`. Render `LiveSessionsTab` when `tab === "sessions"`.

- [ ] **Step 8: Build & test**

Run: `pnpm --filter @jigit/dashboard build && pnpm --filter @jigit/dashboard test`
Expected: build clean; client tests pass. UI behavior cannot be auto-verified (no `@testing-library/react` yet — deferred per CLAUDE.md); state this explicitly when reporting.

- [ ] **Step 9: Commit**

```bash
git add packages/dashboard/src/components/sessions packages/dashboard/src/pages/Usage.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add Live Sessions tab to /usage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Overview "AI Usage" widget — live token volume

**Goal:** Add a "live token volume this week" number sourced from `AgentSession` to the Overview AI Usage widget, linking both tabs; leave existing CodeBurn widget content intact.

**Files:**
- Modify: `packages/dashboard/src/pages/Overview.tsx` (the AI Usage widget area)

**Acceptance Criteria:**
- [ ] Widget shows a combined live token number for the last 7 days (sum of input+output across `listAgentSessions({ from: <7d ago>, limit: 200 })` rows).
- [ ] Provides links to `/usage` (Historical) and `/usage?tab=sessions` (Live).
- [ ] Existing CodeBurn-sourced widget content remains below, unchanged.
- [ ] `pnpm --filter @jigit/dashboard build` clean.

**Verify:** `pnpm --filter @jigit/dashboard build` clean.

**Steps:**

- [ ] **Step 1: Locate the AI Usage widget**

```bash
grep -n "AI Usage\|usage\|Usage" packages/dashboard/src/pages/Overview.tsx
```

Read that region of `Overview.tsx`.

- [ ] **Step 2: Add the live fetch**

In the widget component, add an effect computing the 7-day window and calling `listAgentSessions({ from, limit: 200 })`, summing `inputTokens + outputTokens` across `rows`. Render the number with a label "Live tokens (7d)" and two `<Link>`s. Keep all existing content below.

> Cap at `limit: 200` (the API's max). Document inline that this is a coarse Phase-1 figure; a dedicated aggregate endpoint is deferred (spec §2).

- [ ] **Step 3: Build**

Run: `pnpm --filter @jigit/dashboard build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/pages/Overview.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): show live token volume on Overview AI Usage widget

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Full-repo verification, docs, changelog

**Goal:** Confirm the whole monorepo builds and tests green, document env vars, and record the session per CLAUDE.md.

**Files:**
- Modify: `.env.example` (add `JAGIT_BASE_URL`, `JAGIT_API_KEY`, `JAGIT_GIT_USERNAME` with comments — these are hook-side vars)
- Create: `docs/changelogs/2026-06-20-HHMM-agent-session-reporting.md`
- Modify: `CHANGELOG.md` (prepend one-line entry)
- Modify: `CLAUDE.md` (update "Current plan progress")

**Acceptance Criteria:**
- [ ] `pnpm -r build` clean.
- [ ] `pnpm -r test` green except the two pre-existing `webhooks.controller.test.ts` 401 failures noted in CLAUDE.md.
- [ ] `.env.example` documents the three hook env vars (no real secrets).
- [ ] Per-session changelog written; `CHANGELOG.md` and `CLAUDE.md` progress updated.

**Verify:** `pnpm -r build && pnpm -r test`.

**Steps:**

- [ ] **Step 1: Full build + test**

```bash
pnpm -r build
pnpm -r test
```

Expected: build clean; only the known 2 webhook failures remain. Investigate any NEW failures before proceeding.

- [ ] **Step 2: Document env vars in `.env.example`**

Append (these are consumed by the hook adapters on developer machines, not by the API):

```bash
# ─── Agent session reporting (hook adapters; set on developer machines) ───────
# Base URL of the JiGit API the hooks POST to.
JAGIT_BASE_URL=https://jigit.example.com
# Shared API key for hooks (use the same value as DASHBOARD_API_TOKEN).
JAGIT_API_KEY=replace-me
# Optional: override the reporting identity (defaults to git config user.email).
# JAGIT_GIT_USERNAME=alice@example.com
```

- [ ] **Step 3: Run detect_changes (GitNexus) before committing**

Per CLAUDE.md GitNexus rules, verify the change scope:

```
detect_changes({ scope: "compare", base_ref: "main" })
```

Confirm only the expected new symbols/flows appear.

- [ ] **Step 4: Write the per-session changelog**

Create `docs/changelogs/2026-06-20-HHMM-agent-session-reporting.md` describing: the task, packages created (`@jigit/agent-reporter`, three hook packages), the API module, the Prisma model + migration, the dashboard tab, tests added/run, and follow-ups (component tests once `@testing-library/react` lands; pricing lookup for Claude Code cost; per-turn reporting; aggregate endpoint for summary cards; publish hook packages to npm; `prisma migrate deploy` on deploy).

- [ ] **Step 5: Update `CHANGELOG.md` and `CLAUDE.md`**

Prepend a one-line entry under a dated heading in `CHANGELOG.md`. Update the "Current plan progress" section in `CLAUDE.md`: active plan = this one, last completed = agent session reporting Phase 1, next up = the deferred items above + Phase 2 (Copilot VS Code Chat, OpenCode, Cursor).

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/changelogs/2026-06-20-HHMM-agent-session-reporting.md CHANGELOG.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document agent session reporting and update changelog/progress

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes (author check against spec)

- **§ Unified payload** → Task 1 (schema), shared by hooks (Tasks 7–8) and API (Task 6). ✅
- **§1 Architecture** (3 pieces: reporter pkg, hook bins, API endpoint) → Tasks 1–3, 7–8, 5–6. ✅ Layout corrected to flat `packages/*` + `@jigit/` scope.
- **§2 Data model** (enum, model, indexes, User relation, Float? cost) → Task 4 (exact copy). ✅
- **§3 API contract** (auth reuse, upsert overwrite-not-merge, wire↔enum, read endpoints) → Tasks 5–6. 413 cap noted but de-scoped to "rely on global Fastify body handling"; if a 256KB cap is required, add it in `main.ts` `multipart`/body limit — flagged here rather than as a separate task since Phase-1 payloads are tiny.
- **§4 Adapters** (Claude Code full spec; Codex/Copilot spikes) → Task 0 spikes feed Tasks 7–8. ✅
- **§5 Dashboard** (tab strip, filters, cards, table, drawer, client methods+tests, Overview widget) → Tasks 9–11. Component tests explicitly deferred per spec §5. ✅
- **§6 Out of scope** honored: no OpenCode/Cursor/Copilot-Chat/per-turn/per-user-keys/rate-limit/pricing/SSE. ✅
- **Type consistency:** `TOOL_WIRE_TO_ENUM` (service) and `ENUM_TO_WIRE` (controller) are inverse maps with matching spellings; `buildPayload` signatures and `AgentSessionPayload` fields match the schema; client `AgentSessionRow.tool` documented as enum-form. ✅
