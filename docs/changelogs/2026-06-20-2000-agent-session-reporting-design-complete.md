# 2026-06-20 20:00 — Agent session reporting design completed

## Task

Resume the brainstorming session paused mid-design and complete Sections 2–6
of `docs/superpowers/specs/2026-06-20-agent-session-reporting-design.md`.

## What happened

Walked through Sections 2–6 in order, each confirmed by the user:

- **Section 2 — Data Model:** new `AgentSession` Prisma model + `AgentTool`
  enum. Reuses the existing `User` (CodeBurn) row for identity. Unique on
  `(tool, sessionId)` drives the idempotent upsert. `costUsd Float?` matches
  `Job.costUsd`. `rawPayload Json` stores the last adapter payload for
  debugging.
- **Section 3 — API Contract:** `POST /api/agent-sessions`, JSON body,
  reuses `AuthGuard(loadConfig().dashboardApiToken)`. Idempotency: overwrite
  on `(tool, sessionId)`, not merge — adapters send cumulative totals.
  Read endpoints (`GET /api/agent-sessions`, `GET /api/agent-sessions/:id`)
  added for the dashboard.
- **Section 4 — Hook Adapters:** Shared `@jagit/agent-reporter` core
  (`reportSession`, `resolveGitUsername`, Zod schema). Three adapter
  packages with `bin` entries usable via both `npm i -g` and `npx -y`.
  Claude Code adapter fully specced (`Stop` hook + transcript JSONL parse,
  `costUsd: null` for Phase 1). Codex and Copilot adapters have explicit
  spike deliverables (mechanism choice + JSONL schema confirmation) folded
  into the plan.
- **Section 5 — Dashboard Surface:** extend `/usage` with a "Live Sessions"
  tab at `/usage/sessions`. Filters bar, summary cards, sortable table, row
  drawer with raw-payload viewer. Two new `api/client.ts` methods. Component
  tests deferred to whenever `@testing-library/react` setup lands.
- **Section 6 — Out of Scope:** OpenCode, Cursor, Copilot VS Code Chat,
  per-turn timeline, per-user API keys, cost forecasting, cross-tool
  charts, rate limiting, Claude Code pricing lookup, SSE — all explicitly
  deferred.

User-requested tweak applied during Section 4: every adapter package ships a
`bin` entry so it's usable via both `npm i -g` and `npx -y` (READMEs lead
with `npx`).

Self-review pass: clean (two intentional "TBD"s flag spike deliverables,
enum boundary mapping documented, no scope creep, no ambiguous requirements).

## Files touched

- Updated `docs/superpowers/specs/2026-06-20-agent-session-reporting-design.md`
  — all six sections filled in, decisions table extended, status changed to
  "Approved".
- Updated `CHANGELOG.md` — prepended a "design-complete" entry above the
  earlier "brainstorm" entry.
- Created this changelog.

## Tests

None — no code changed. Design only.

## Next

Invoke the `writing-plans` skill to produce the implementation plan. The plan
will own:
- Codex adapter mechanism spike (filesystem watcher daemon vs. shell shim).
- Copilot CLI adapter spike (where `gh copilot` writes telemetry, if at all).
- Prisma migration for `AgentSession` + `AgentTool` enum.
- `@jagit/agent-reporter` package scaffolding.
- Three hook packages with `bin` entries.
- `AgentSessionModule` in the API service (controller, service, Zod-validated
  POST, Prisma upsert).
- Dashboard `/usage/sessions` page and `api/client.ts` additions.
