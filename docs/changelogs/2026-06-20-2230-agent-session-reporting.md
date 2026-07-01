# 2026-06-20 22:30 — Agent Session Reporting (Phase 1)

## Task

Implement the approved agent-session-reporting design
(`docs/superpowers/specs/2026-06-20-agent-session-reporting-design.md`) via the
13-task plan (`docs/superpowers/plans/2026-06-20-agent-session-reporting.md`).
Executed subagent-driven in an isolated worktree on branch
`feature/agent-session-reporting`.

## What changed

### New shared package — `@jigit/agent-reporter` (`packages/agent-reporter/`)
Single source of truth for the reporting payload, imported by both hooks and API.
- `schema.ts` — `AgentSessionPayloadSchema` (Zod) + `AgentSessionPayload` type + `AGENT_TOOLS`.
- `git-username.ts` — `resolveGitUsername()` (env → `git config user.email` → `user.name` → "unknown"; never throws). Added `@types/node` devDep for node builtins.
- `report.ts` — `reportSession()`: validates, POSTs `x-api-key`, retries 5xx via `@jigit/shared` `withRetry`, fails fast on 4xx, never throws.
- `index.ts` barrel. 16 tests.

### Data model — `packages/shared/prisma/`
- New `AgentTool` enum (`claude_code|codex|copilot`) + `AgentSession` model keyed by `@@unique([tool, sessionId])`, FK to `User` (cascade), two indexes. `User.agentSessions` relation added.
- New incremental migration `20260620120000_add_agent_session/migration.sql` (authored offline via `prisma migrate diff` schema-to-schema; **`prisma migrate deploy` required on a live DB**).

### API — `packages/api/src/agent-sessions/` (new `AgentSessionModule`, sibling to `UsageModule`)
- `AgentSessionService`: idempotent `upsert` (overwrite-not-merge, find-or-create user by `gitUsername`, wire↔enum mapping, `startedAt` set only on create), filtered/paginated `list`, `get` with `rawPayload`.
- `AgentSessionController`: `POST /api/agent-sessions` (auth + Zod 400 + wire-form response), `GET /api/agent-sessions` (filters tool/username/from/to, limit/offset defaults 50/0, cap 200), `GET /api/agent-sessions/:id`. Reuses `AuthGuard(loadConfig().dashboardApiToken)`. Registered in `AppModule`. Added `@jigit/agent-reporter` dep to api.

### Hook bin packages (Phase 1)
- `@jigit/hook-claude-code` — parses Claude Code `Stop`-hook transcript JSONL, sums cumulative usage, `costUsd: null`. bin `jigit-hook-claude-code`.
- `@jigit/hook-codex` — parses `~/.codex/sessions/**/*.jsonl` (takes last cumulative `token_count`, model from last `turn_context`, tool calls from `function_call`/`custom_tool_call`/`web_search_call`), `$PATH` shim install. bin `jigit-hook-codex`, supports `--file`.
- `@jigit/hook-copilot` — synthetic `sessionId`, `costUsd: null` (seat-based). bin `jigit-hook-copilot`.
- Each: pure `buildPayload` (tested), `import.meta.url` CLI guard, `process.exit(0)` on every path, README leading with `npx -y`.

### Dashboard — `packages/dashboard/`
- `api/client.ts`: `listAgentSessions` / `getAgentSession` + types (tested, 23 client tests).
- New `components/sessions/`: `LiveSessionsTab`, `SessionsFilters`, `SessionSummaryCards`, `LiveSessionsTable`, `SessionDetailDrawer` (raw-payload viewer).
- `pages/Usage.tsx`: tab strip **Historical (CodeBurn) | Live Sessions** via `?tab=`; Historical behavior unchanged (extracted to `HistoricalView`).
- `pages/Overview.tsx`: AI Usage widget gains a 7-day live-token figure + links to both tabs.

### Docs / config
- `.env.example`: documented `JAGIT_BASE_URL`, `JAGIT_API_KEY`, `JAGIT_GIT_USERNAME` (hook-side).
- Spike findings: `docs/superpowers/specs/2026-06-20-codex-copilot-spike-findings.md`.

## Tests / verification

- `pnpm -r build`: clean (9 packages).
- `pnpm -r test`: green except the 2 pre-existing unrelated `webhooks.controller.test.ts` 401 failures (documented before this work). New: agent-reporter 16, api agent-sessions 9 (5 controller + 4 service), dashboard 23, hooks pass.

## Follow-ups

- Run `prisma migrate deploy` on deploy.
- Publish the four new packages to npm so `npx -y @jigit/hook-*` works zero-install.
- Component tests once `@testing-library/react` lands (UI behavior currently only build-verified).
- Pricing lookup for Claude Code `costUsd` (currently null).
- Dedicated aggregate endpoint so summary cards / Overview reflect the full range (currently page-bounded / 200-row cap).
- Per-turn reporting, rate limiting, SSE — deferred per spec §6.
- Investigate the pre-existing `webhooks.controller.test.ts` 401 failures (unrelated).
