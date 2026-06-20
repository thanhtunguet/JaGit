# 2026-06-20 19:00 — Agent session reporting brainstorm (paused)

## Task

Brainstorm a design for collecting AI agent session metadata (tokens, cost, model)
from multiple coding tools and pushing to the JaGit dashboard.

## What happened

Worked through the brainstorming skill clarifying questions. Reached the
following confirmed decisions:

1. **Consolidate with CodeBurn** — CodeBurn keeps owning historical/batch CSV
   uploads; new hook pipeline owns live per-session rows for sessions conducted
   after the hooks are installed. Both coexist; dashboard reads both.
2. **Per-session snapshot grain** — one row per `(tool, sessionId)`, upsert on
   each hook fire. No per-turn events in Phase 1.
3. **Per-tool adapter + shared core** — new `@jagit/agent-reporter` package
   exports `reportSession()` and `resolveGitUsername()`; thin one-file adapters
   per tool.
4. **Phase 1 tools:** Claude Code, Codex, GitHub Copilot. (OpenCode and Cursor
   deferred.)
5. **Auth:** shared `JAGIT_API_KEY` + `JAGIT_BASE_URL` env, identity from
   `git config user.email` with `JAGIT_GIT_USERNAME` override.

Section 1 (architecture overview) confirmed by user.

User then asked to save the design and `/compact` mid-brainstorm.

## Files touched

- Created `docs/superpowers/specs/2026-06-20-agent-session-reporting-design.md`
  — in-progress design doc with Section 1 confirmed and Sections 2–6 stubbed
  with open questions and resume instructions.
- Created this changelog.

## Tests

None — no code changed. Brainstorming only.

## Resume

Next session: open the design doc and continue from **Section 2 — Data Model**.
Walk through Sections 2–6 with the user, then run spec self-review and invoke
`writing-plans`.
