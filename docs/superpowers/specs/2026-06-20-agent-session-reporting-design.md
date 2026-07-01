# Agent Session Reporting — Design

**Status:** Approved (all sections confirmed by user 2026-06-20)
**Date:** 2026-06-20
**Author:** Brainstorming session with Claude

## Goal

Collect per-session metadata (token usage, model, cost, tool calls) from AI coding
agents and push it to the JaGit dashboard so we can see live, per-developer usage
across multiple agents — alongside the existing CodeBurn historical/batch CSV
pipeline.

A session-finish hook in each supported tool POSTs a snapshot to JaGit, keyed by
`(tool, sessionId)` so repeated updates from the same session upsert in place
rather than duplicating.

## Scope

### Phase 1 — supported tools

- Claude Code (`Stop` hook in `settings.json`)
- Codex (mechanism TBD — see Section 4.2 spike)
- GitHub Copilot CLI only (IDE-chat deferred — see Section 4.3)

### Deferred (not Phase 1)

See Section 6 for the full list. Highlights: OpenCode, Cursor, Copilot VS Code
Chat extension, per-turn event timeline, per-user API keys.

### Consolidation with existing CodeBurn

Both pipelines feed one unified conceptual model:

- **CodeBurn ZIP upload** → backfills historical/aggregated usage from existing
  logs (untouched in this work, keeps current `/api/usage/*` surface).
- **Hook push** → live per-session rows for sessions conducted *after* the hook
  is installed.

The dashboard reads both. There is no migration of CodeBurn rows into the new
`AgentSession` table; they coexist, attached to the same `User` row.

## Decisions captured

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Relationship to CodeBurn | Consolidate behaviors (CodeBurn = historical, hooks = live) | User direction |
| 2 | Live data granularity | Per-session snapshot, upsert by `(tool, sessionId)` | Matches "hook fires when agent finishes"; minimal write volume; idempotent by PK |
| 3 | Hook script structure | One thin adapter per tool + shared `@jagit/agent-reporter` core | Hook surfaces are too different across tools to share dispatch logic |
| 4 | Auth & identity | Shared `JAGIT_API_KEY` + `git config user.email` default, overridable via `JAGIT_GIT_USERNAME` env | Matches existing `DASHBOARD_API_TOKEN` trust model; env override covers CI/Docker |
| 5 | User model | Reuse existing `User` (CodeBurn) | One identity column already exists; both tables attach to the same row |
| 6 | Cost type | `Float?` | Matches `Job.costUsd`; nullable distinguishes "no data" from "$0" |
| 7 | API endpoint | `POST /api/agent-sessions`, JSON body, `AuthGuard` reuse | Symmetric with `/api/usage/*` |
| 8 | Idempotency | Overwrite-not-merge on `(tool, sessionId)` | Adapters send cumulative totals; merge would double-count |
| 9 | Adapter packaging | Each ships with a `bin` entry; usable via `npm i -g` and `npx -y` | Zero-install path for hook config snippets |
| 10 | Dashboard placement | Extend `/usage` with a "Live Sessions" tab | All token/cost data lives in one place |

## Unified payload (single source of truth)

`@jagit/agent-reporter` exports the Zod schema below; both the hook side and the
API side import it.

```ts
const AgentSessionPayloadSchema = z.object({
  tool: z.enum(["claude-code", "codex", "copilot"]),
  sessionId: z.string().min(1).max(200),
  gitUsername: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),  // cache_read + cache_creation
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),       // null = tool doesn't expose cost
  toolCallCount: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime(),
  rawPayload: z.record(z.unknown()).optional(),       // server fills with {} if absent
});
```

Prisma enum stores `claude_code` / `codex` / `copilot` (Prisma forbids hyphens
in enum members); the controller maps `claude-code ↔ claude_code` on the
boundary.

---

## Section 1 — Architecture Overview

Add a new bounded context inside JaGit: **agent session reporting**. Three
pieces:

### 1. `@jagit/agent-reporter` — new shared package (`packages/agent-reporter/`)

The single source of truth for what gets sent and how. Exports:

- `reportSession(payload, opts?): Promise<void>`
  POSTs to `${JAGIT_BASE_URL}/api/agent-sessions` with `x-api-key: ${JAGIT_API_KEY}`,
  retries via the existing `withRetry` helper from `@jigit/shared` (bounded
  retries on 5xx/network; 4xx fails fast), **never throws to the caller**
  (hooks must not crash agents). Missing env → log to stderr and return.
- `resolveGitUsername(cwd?): string`
  Checks `JAGIT_GIT_USERNAME` env first → `git -C <cwd> config user.email` →
  `git -C <cwd> config user.name` → `"unknown"`. Each subprocess wrapped in
  try/catch.
- `AgentSessionPayloadSchema` + inferred `AgentSessionPayload` type.

Zero runtime deps beyond `zod` and `@jigit/shared`. ESM Node package.

### 2. Three hook bin packages (Phase 1)

Each package ships with a `bin` entry so it is usable both as a globally
installed binary (`npm i -g @jagit/hook-claude-code`) and via `npx -y
@jagit/hook-claude-code`. READMEs lead with the `npx` form.

- `packages/hooks/claude-code/` — Node script wired to Claude Code's `Stop`
  hook in `settings.json`. Reads `transcript_path` from stdin JSON, parses
  the JSONL, sums cumulative usage.
- `packages/hooks/codex/` — Node script. Mechanism (filesystem watcher
  daemon vs. shell wrapper shim) decided by a spike in the planning phase.
  Parses `~/.codex/sessions/*.jsonl`.
- `packages/hooks/copilot/` — Node script wrapping the `gh copilot` CLI.
  Phase 1 ships CLI only; IDE-chat deferred.

Each is a one-file adapter: parse → build `AgentSessionPayload` → call
`reportSession`.

### 3. `POST /api/agent-sessions` on the existing API service

Idempotent upsert keyed by `(tool, sessionId)`. Lives next to the existing
`UsageModule` as a sibling `AgentSessionModule` at
`packages/api/src/agent-sessions/`. CodeBurn keeps owning historical CSVs
(unchanged); the new module owns live per-session rows. The dashboard reads
both via separate API client methods.

### Data flow at runtime

```
agent finishes turn
  → tool fires hook (Stop / wrapper / log poll)
    → adapter reads its session log
      → reportSession()
        → API upserts AgentSession row
          → dashboard reflects it on refresh
```

---

## Section 2 — Data Model

### New enum + model

```prisma
enum AgentTool {
  claude_code
  codex
  copilot
}

model AgentSession {
  id                String    @id @default(cuid())
  tool              AgentTool
  sessionId         String              // tool's native session id
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  model             String              // "claude-opus-4-7", "gpt-4o", etc.
  inputTokens       Int       @default(0)
  cachedInputTokens Int       @default(0)   // cache_read + cache_creation
  outputTokens      Int       @default(0)
  costUsd           Float?              // null = tool doesn't expose cost
  toolCallCount     Int?                // null = tool doesn't expose it
  startedAt         DateTime
  lastUpdatedAt     DateTime  @updatedAt
  rawPayload        Json      @default("{}")  // last adapter payload, for debugging
  createdAt         DateTime  @default(now())

  @@unique([tool, sessionId])          // drives idempotent upsert
  @@index([userId, lastUpdatedAt])     // "recent sessions for user X"
  @@index([tool, lastUpdatedAt])       // "recent sessions per tool"
}
```

Add `agentSessions AgentSession[]` to the existing `User` model.

### Type choices and rationale

| Field | Type | Why |
|-------|------|-----|
| `costUsd` | `Float?` | Matches `Job.costUsd`. Nullable distinguishes "no data" from "$0". |
| Token fields | `Int` | Stays well under 2.1B per session; migrate to `BigInt` only if we hit it. |
| `rawPayload` | `Json @default("{}")` | Last-write only (no history). Cheap; pays off the first time an adapter ships malformed numbers. |
| `toolCallCount` | `Int?` | Original requirement mentioned tool calls; Copilot likely won't expose. |
| `startedAt` | `DateTime` (explicit) | Set on create, never overwritten on upsert. |
| `lastUpdatedAt` | `DateTime @updatedAt` | Prisma auto-updates on every write. |

### Aggregation

On-the-fly Prisma `groupBy` queries for Phase 1. Volume is small (one row per
session, hundreds/day per user at most). No materialized views.

---

## Section 3 — API Contract

### Endpoint

`POST /api/agent-sessions`

### Module placement

New `AgentSessionModule` at `packages/api/src/agent-sessions/`, sibling to
`UsageModule`.

### Auth

Reuse `AuthGuard(loadConfig().dashboardApiToken)`. Hooks send
`x-api-key: ${JAGIT_API_KEY}`; the existing guard accepts both `x-api-key`
and `Authorization: Bearer`.

### Request body

JSON, validated against `AgentSessionPayloadSchema` (defined above). No
multipart.

### Response (200)

```json
{ "id": "ck...", "tool": "claude-code", "sessionId": "...", "lastUpdatedAt": "2026-..." }
```

### Error responses

- `400` — Zod validation failure (returns `{ error, issues }`)
- `401` — missing/wrong API key
- `413` — body > 256 KB (rawPayload could grow; cap it at the Fastify layer)
- `500` — DB error

### Idempotency semantics — overwrite, not merge

On each POST, run a Prisma `upsert` keyed by `(tool, sessionId)`:

- **create:** insert with all fields. `userId` resolved via find-or-create on
  `User.username = gitUsername`.
- **update:** overwrite `model, inputTokens, cachedInputTokens, outputTokens,
  costUsd, toolCallCount, rawPayload`. `startedAt` preserved (set only on
  create). `lastUpdatedAt` auto-updates via Prisma's `@updatedAt`.

Rationale: hooks emit cumulative totals (not deltas), so a merge would
double-count if both sides happened to accumulate. Overwrite is also resilient
to out-of-order delivery within a session because values are monotonically
non-decreasing and the last write represents the true cumulative state at
end-of-session.

### Rate limiting

None in Phase 1. Hook firing is bounded by human throughput (a few per minute
per developer). Revisit if per-turn reporting lands.

### Read endpoints (for the dashboard)

- `GET /api/agent-sessions?tool=&username=&from=&to=&limit=&offset=` — list,
  paginated, auth-guarded.
- `GET /api/agent-sessions/:id` — single row including `rawPayload`,
  auth-guarded.

---

## Section 4 — Hook Adapters

### Shared core (`@jagit/agent-reporter`)

See Section 1 for the export surface. The package is the dependency every hook
binary pulls in to build, validate, and POST the payload.

### Packaging contract for every adapter

Each adapter package:

- has a `bin` entry in `package.json` exposing the script as a CLI command
- is publishable to npm so `npx -y @jagit/hook-<tool>` works zero-install
- supports `npm i -g @jagit/hook-<tool>` for users who want the binary on
  `$PATH` permanently
- exits 0 on every code path (errors → log to stderr, never block the agent)

### 4.1 Claude Code — `packages/hooks/claude-code/`

**Mechanism:** `Stop` hook in `~/.claude/settings.json` (or per-project
`.claude/settings.json`).

**User config snippet (shipped in README):**

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "npx -y @jagit/hook-claude-code" }]
    }]
  }
}
```

**Adapter flow:**

1. Read JSON from stdin: `{ session_id, transcript_path, cwd, ... }`.
2. Read JSONL at `transcript_path`; walk every assistant message that has a
   `message.usage` block.
3. Sum cumulative usage across the whole transcript:
   - `inputTokens` = sum of `usage.input_tokens`
   - `cachedInputTokens` = sum of `usage.cache_read_input_tokens + usage.cache_creation_input_tokens`
   - `outputTokens` = sum of `usage.output_tokens`
4. `model` = last assistant message's `message.model`.
5. `costUsd` = `null` for Phase 1 (Claude Code does not expose cost in the
   transcript; pricing-table lookup is a deferred enhancement).
6. `toolCallCount` = count of assistant messages whose content includes a
   `tool_use` block.
7. `startedAt` = first message's `timestamp`.
8. `sessionId` = the `session_id` from stdin.
9. `gitUsername` = `resolveGitUsername(cwd)`.
10. Call `reportSession()`. On any error, log to stderr and exit 0.

Cumulative semantics: `Stop` fires after every assistant turn group; the
adapter re-reads the full transcript and re-sums each time. Each POST overwrites
with the new cumulative total, matching the API's overwrite-not-merge contract.

### 4.2 Codex — `packages/hooks/codex/`

**Status: spike required during planning.** Codex CLI does not currently expose
a hook surface analogous to Claude Code's `Stop`. Two candidate mechanisms:

- **(A) Filesystem watcher daemon** — long-running process polls / `fs.watch`es
  `~/.codex/sessions/*.jsonl`, detects "session ended" (file untouched for N
  seconds), parses, posts. Requires a launchd / systemd service.
- **(B) Shell wrapper shim** — installer drops a `codex` shim earlier in
  `$PATH` that runs the real `codex`, then on exit reads the most-recent
  session file and posts. Simpler install; only fires on graceful exit.

Parsing logic for `~/.codex/sessions/*.jsonl` is the same regardless of (A)/(B).

**Spike deliverables (in the implementation plan):**

- Confirm the JSONL schema (fields for model, prompt/completion tokens, cached
  tokens, cost).
- Pick (A) vs (B); spec the install/uninstall story.
- Confirm cumulative-vs-delta semantics — if Codex logs per-turn deltas, the
  adapter sums; if cumulative, take the last record.

`costUsd` likely available (Codex CLI shows running cost). `toolCallCount`
derivable from `function_call`-type entries.

### 4.3 GitHub Copilot — `packages/hooks/copilot/`

**Status: spike required. Phase 1 ships CLI only.**

- **`gh copilot` CLI** (`gh copilot suggest` / `gh copilot explain`) — wrapper
  shim approach analogous to Codex (B); parse output. Low session concept;
  each invocation is a one-shot, so `sessionId` is synthesized
  (timestamp + PID).
- **Copilot Chat in VS Code** — **deferred to Phase 2**. Would require a
  separate VS Code extension; out of scope here.

**Spike deliverables:**

- Confirm where (if anywhere) `gh copilot` writes session/usage data.
- Confirm what token/cost telemetry GitHub Copilot exposes at all (Copilot's
  billing is seat-based, so per-call cost may not exist —
  `costUsd: null` permanently is acceptable).

### Installation summary (READMEs)

- **Claude Code:** add the `Stop` hook block above to `~/.claude/settings.json`.
  Set `JAGIT_BASE_URL` and `JAGIT_API_KEY` in shell rc. Uses `npx -y` so no
  global install required.
- **Codex:** TBD by spike (daemon `launchctl load` vs. `$PATH` shim).
- **Copilot CLI:** install `@jagit/hook-copilot` globally and replace `gh
  copilot` invocations with the wrapper `gh-copilot-jagit`, **or** add a shell
  function that runs `gh copilot "$@"` and then triggers
  `npx -y @jagit/hook-copilot`. Exact form decided by the spike.

---

## Section 5 — Dashboard Surface

Extend `/usage`. Don't create a new top-level page.

### Page structure (`packages/dashboard/src/pages/usage/`)

- `/usage` — existing CodeBurn page (unchanged in this work). Add a tab strip
  at the top: **Historical (CodeBurn)** | **Live Sessions**.
- `/usage/sessions` — new tab/route showing `AgentSession` rows.

### `/usage/sessions` layout

- **Filters bar (top):** tool dropdown
  (`all | claude-code | codex | copilot`), username dropdown (populated from
  distinct `User.username`), date range picker (defaults to last 7 days).
  Filter state in URL params so links are shareable.
- **Summary cards (row of 4):** total sessions in range, total input tokens,
  total output tokens, total cost (sums only non-null `costUsd` rows; tooltip
  clarifies "X sessions missing cost data" when relevant).
- **Sessions table** — columns: User, Tool (badge), Model, Started, Last
  updated, Input, Cached, Output, Cost, Tool calls. Sortable by
  `lastUpdatedAt` DESC by default. Pagination at 50/page.
- **Row click → drawer or `/usage/sessions/:id`** showing the full row plus a
  collapsible "Raw payload" JSON viewer for debugging.

### API client additions (`packages/dashboard/src/api/client.ts`)

- `listAgentSessions(filters)` → `GET /api/agent-sessions?...`
- `getAgentSession(id)` → `GET /api/agent-sessions/:id`

### Overview "AI Usage" widget tweak

Show a combined number for "live token volume this week" sourced from
`AgentSession` and link both tabs. Existing CodeBurn-sourced widget content
stays as-is below.

### Tests

Ship `api/client.ts` tests for the two new methods in this phase. Component
tests deferred until `@testing-library/react` setup lands (already in
the "Next up" list of [CLAUDE.md](../../../CLAUDE.md)).

---

## Section 6 — Out of Scope (Phase 1)

Explicitly deferred:

- **OpenCode adapter** — deferred per user direction.
- **Cursor adapters** (CLI + IDE-chat) — deferred per user direction.
- **Copilot VS Code Chat adapter** — Phase 1 ships CLI only.
- **Per-turn event timeline** — `AgentSession` is snapshot-grain only.
- **Backfilling CodeBurn data into `AgentSession`** — the two tables coexist by
  design.
- **Per-user API keys** — Phase 1 uses one shared `JAGIT_API_KEY` per the
  existing `DASHBOARD_API_TOKEN` trust model.
- **Cost forecasting / budget alerts.**
- **Cross-tool comparison charts** — Phase 1 ships a table grouped by tool;
  analytics charts come later.
- **Rate limiting on `POST /api/agent-sessions`** — revisit only if per-turn
  reporting lands.
- **Pricing lookup for Claude Code `costUsd`** — `costUsd: null` for Phase 1.
- **Streaming / SSE for live session updates** — dashboard polls or refreshes
  on user action; no SSE pipeline like the Jobs surface.

---

## Resume / next steps

All six sections approved. Next:

1. User reviews this written spec.
2. On approval, invoke the `writing-plans` skill to produce the implementation
   plan (which will own the Codex and Copilot spikes as early tasks).
