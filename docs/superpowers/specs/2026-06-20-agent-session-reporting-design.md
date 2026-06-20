# Agent Session Reporting — Design

**Status:** In progress (brainstorming paused mid-design — Section 1 confirmed, Sections 2–6 pending)
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
- Claude Code
- Codex (OpenAI codex CLI)
- GitHub Copilot (CLI + IDE-chat, sharing one adapter if possible)

### Deferred (not Phase 1)
- OpenCode
- Cursor (IDE-chat and CLI)

### Consolidation with existing CodeBurn
Both pipelines feed one unified conceptual model:
- **CodeBurn ZIP upload** → backfills historical/aggregated usage from existing
  logs (untouched in this work, keeps current `/api/usage/*` surface).
- **Hook push** → live per-session rows for sessions conducted *after* the hook
  is installed.

The dashboard reads both. There is no migration of CodeBurn rows into the new
`AgentSession` table; they coexist.

## Decisions captured so far

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Relationship to CodeBurn | Consolidate behaviors (CodeBurn = historical, hooks = live) | User direction |
| 2 | Live data granularity | **A** — per-session snapshot, upsert by `(tool, sessionId)` | Matches "hook fires when agent finishes", minimal write volume, idempotent by PK |
| 3 | Hook script structure | **A** — one thin adapter per tool + shared `@jagit/agent-reporter` core | Hook surfaces are too different across tools to share dispatch logic |
| 4 | Auth & identity | **C** — shared `JAGIT_API_KEY` + `git config user.email` default, overridable via `JAGIT_GIT_USERNAME` env var | Matches existing `DASHBOARD_API_TOKEN` trust model; env override covers CI/Docker |
| —  | Base URL | Hook reads `JAGIT_BASE_URL` from env | Per user requirement |

## Unified token fields (target schema, to be finalized in Section 2)

All adapters MUST report at least:
- `model` (string)
- `inputTokens` (int)
- `cachedInputTokens` (int — sum of cache read + cache creation when the tool exposes both)
- `outputTokens` (int)
- `costUsd` (decimal | null — null when the tool doesn't expose cost)

Plus identity & idempotency:
- `tool` (enum: `claude-code` | `codex` | `copilot`)
- `sessionId` (string — the tool's native session ID)
- `gitUsername` (string — resolved via `resolveGitUsername()`)
- `startedAt`, `lastUpdatedAt` (ISO timestamps)

---

## Section 1 — Architecture Overview ✅ CONFIRMED

Add a new bounded context inside JaGit: **agent session reporting**. Three
pieces:

### 1. `@jagit/agent-reporter` — new shared package (`packages/agent-reporter/`)

The single source of truth for what gets sent and how. Exports:

- `reportSession(payload, opts?): Promise<void>`
  POSTs to `${JAGIT_BASE_URL}/api/agent-sessions` with `x-api-key: ${JAGIT_API_KEY}`,
  retries via the existing `withRetry` helper, **never throws to the caller**
  (hooks must not crash agents).
- `resolveGitUsername(): string`
  Checks `JAGIT_GIT_USERNAME` env first → `git config user.email` → `git config user.name` → `"unknown"`.
- Zod-validated `AgentSessionPayload` type (the unified shape above).

### 2. Three hook bin packages (Phase 1)

- `packages/hooks/claude-code/` — Node script wired to Claude Code's `Stop` hook
  in `settings.json`. Reads `transcript_path` from stdin JSON, parses the JSONL,
  extracts cumulative usage from the last assistant message.
- `packages/hooks/codex/` — Node script invoked via a shell wrapper around
  `codex` (or a post-session trap). Parses `~/.codex/sessions/*.jsonl`.
- `packages/hooks/copilot/` — Node script for Copilot CLI's session log
  (exact mechanism needs a research spike — flagged in plan).

Each is a one-file adapter: parse → build `AgentSessionPayload` → call
`reportSession`. Codex and Copilot adapters need a brief research spike during
planning because their hook surfaces aren't as clean as Claude Code's.

### 3. `POST /api/agent-sessions` on the existing API service

Idempotent upsert keyed by `(tool, sessionId)`. Lives next to the existing
`UsageModule` as a sibling `AgentSessionModule`. CodeBurn keeps owning
historical/aggregated CSVs (unchanged); the new module owns live per-session
rows. The dashboard reads both.

### Data flow at runtime

```
agent finishes turn
  → tool fires hook (Stop / wrapper / log poll)
    → adapter reads its session log
      → reportSession()
        → API upserts AgentSession row
          → dashboard reflects it
```

---

## Section 2 — Data Model (TODO)

Open questions to resolve in next session:
- Exact Prisma schema for `AgentSession` (fields, indexes, FK to `User`?)
- Do we extend the existing minimal `User` model (CodeBurn) or add `gitEmail` / `gitUsername` columns?
- Cost: `Decimal(10,4)` or `Float`? Nullable when unknown.
- Raw payload JSONB for debugging / future per-turn migration?
- Aggregation: views / materialized queries / on-the-fly?

## Section 3 — API Contract (TODO)

- Exact request/response shape.
- Auth guard reuse from `UsageController`.
- Idempotency semantics: pure upsert by `(tool, sessionId)`; later POSTs
  overwrite *or* merge? (Likely overwrite — adapters send cumulative totals.)
- Rate limiting / payload size cap.
- Error responses for malformed payloads.

## Section 4 — Hook Adapters (TODO)

Per-tool details:
- **Claude Code:** `Stop` hook config snippet; transcript JSONL parsing;
  cumulative-vs-delta semantics.
- **Codex:** investigate `~/.codex/sessions/` format; choose between wrapper
  binary, `PROMPT_COMMAND`-style trap, or filesystem watcher.
- **Copilot:** spike needed — `gh copilot` CLI vs. Copilot Chat IDE.

Installation story for each (one-paragraph user docs per adapter).

## Section 5 — Dashboard Surface (TODO)

- New `/usage/sessions` page or extend `/usage`?
- Filters: tool, user, date range.
- Drill-down: session → raw payload.

## Section 6 — Out of Scope (TODO)

Explicit list:
- OpenCode / Cursor adapters (deferred).
- Per-turn event timeline (Section 2 Option B from brainstorm — deferred).
- Per-user API keys (Section 4 Option B — deferred; shared key is sufficient).
- Backfilling CodeBurn data into `AgentSession` (kept separate by design).

---

## Resume instructions

Next session: start at **Section 2 — Data Model**, working through Sections 2–6
in order. Confirm each section with the user before moving on. After Section 6,
run the spec self-review checklist (placeholder scan, internal consistency,
scope check, ambiguity check), then ask the user to review the spec before
invoking `writing-plans`.

Key files already explored:
- `packages/api/src/usage/usage.controller.ts` — auth pattern (`AuthGuard` +
  `loadConfig().dashboardApiToken`) and Fastify multipart handling.
- `packages/api/src/usage/types.ts` — CodeBurn Zod schemas (note: `SessionRow`
  has `Project, Session ID, Started At, Cost (USD), Saved (USD), API Calls, Turns`
  — no token breakdown, no model).
- `packages/shared/` — location for `withRetry`, config loader, Prisma client.
