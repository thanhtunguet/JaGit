# 2026-06-28-1231 — Improve hook-copilot for Real VS Code Copilot Agent Hooks

## Task

Upgrade `@jagit/hook-copilot` to handle GitHub Copilot's real VS Code agent hook payload structure (Stop event via stdin), while preserving backward compatibility with the legacy CLI shell-wrapper mode.

## What Changed

### `packages/hook-copilot/src/index.ts`
- **New interface `CopilotStopStdin`** — mirrors the VS Code agent `Stop` hook stdin shape: `session_id`, `cwd`, `hook_event_name`, `transcript_path`, `timestamp`, `stop_hook_active`.
- **New interface `CopilotTranscriptEntry`** — covers Copilot's transcript format, supporting both snake_case (`input_tokens`, `cache_read_input_tokens`) and camelCase (`inputTokens`, `cachedInputTokens`) token field naming (OpenAI-style vs Claude-style).
- **New function `buildPayloadFromStdin(stdin, read?)`** — reads the session transcript from `stdin.transcript_path`, aggregates token usage across all `assistant` messages, detects model name, counts tool use calls, and picks the earliest timestamp as `startedAt`. Handles missing transcript path and read errors gracefully.
- **New function `tryReadStdin()`** — attempts to read JSON from stdin (fd 0); returns `undefined` if stdin is empty or non-JSON, enabling the legacy fallback.
- **`main()` updated** — detects stdin mode vs. legacy mode: if valid `CopilotStopStdin` JSON is present, calls `buildPayloadFromStdin`; otherwise falls back to `buildPayload` (synthetic session ID, zero tokens).
- **`buildPayload` (legacy)** — unchanged for backward compatibility with the shell-wrapper pattern.

### `packages/hook-copilot/src/index.test.ts`
- Expanded from 2 → 11 tests.
- **Legacy mode tests** (3): synthetic session-id, model default, CopilotInfo passthrough.
- **Stdin mode tests** (8): session_id from stdin, empty transcript defaults, timestamp fallback, snake_case token aggregation, camelCase token aggregation (OpenAI-style), non-assistant entry skipping, missing transcript_path graceful handling, transcript read error graceful handling.

### `packages/hook-copilot/README.md`
- Rewrote to document both modes: VS Code agent hook (`.github/hooks/jagit.json` `Stop` event, recommended) and legacy CLI shell wrapper.

## Tests
- `pnpm --filter @jagit/hook-copilot test` — **11/11 passing**
- `pnpm --filter @jagit/hook-copilot build` — clean (no TypeScript errors)

## Follow-ups
- Register `.github/hooks/jagit.json` in the JaGit workspace itself for dogfooding.
- `cacheCreationInputTokens` is optional in the `AgentSessionPayload` schema and is now populated when the Copilot transcript contains it.
