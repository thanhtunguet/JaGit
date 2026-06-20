# Codex & Copilot Session-Reporting Spike — Findings

**Date:** 2026-06-20
**Status:** Complete — input spec for Task 8 (`@jigit/hook-codex`, `@jigit/hook-copilot`)
**Method:** Direct inspection of real local session logs + CLI probing.

This resolves the open mechanism questions from the design spec §4.2 / §4.3.

---

## Codex

### 1. Session log location & layout

- Logs live under `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO-ish-timestamp>-<uuid>.jsonl`
  (e.g. `~/.codex/sessions/2026/05/11/rollout-2026-05-11T20-37-53-019e1742-...jsonl`).
- One JSONL file per session. Each line is a JSON object with a top-level
  `type` and a `payload`, plus a top-level `timestamp` (ISO-8601 with ms + `Z`).
- Observed top-level `type` values in a 209-line session:
  `session_meta` (1), `turn_context` (1), `event_msg` (68), `response_item` (139).

### 2. Confirmed JSONL schema (mapping to `AgentSessionPayload`)

| `AgentSessionPayload` field | Source in Codex JSONL |
|---|---|
| `sessionId` | `session_meta.payload.id` (a UUID; also embedded in the filename). |
| `model` | `turn_context.payload.model` (e.g. `"gpt-5.3-codex"`). **Not** `session_meta.payload.model` — that field holds `"privateproxy"` (the provider). Use the **last** `turn_context.model` seen. |
| `inputTokens` | `event_msg` where `payload.type == "token_count"` → `payload.info.total_token_usage.input_tokens`. |
| `cachedInputTokens` | same record → `payload.info.total_token_usage.cached_input_tokens`. |
| `outputTokens` | same record → `payload.info.total_token_usage.output_tokens`. (Codex also reports `reasoning_output_tokens` and `total_tokens`; we map only the three canonical fields. Reasoning tokens can optionally be folded into `outputTokens` later — Phase 1 keeps them separate / ignored.) |
| `costUsd` | **Not present.** No cost field anywhere in the JSONL. → `costUsd: null` (permanent for Phase 1). |
| `toolCallCount` | count of `response_item` records with `payload.type` in `{ "function_call", "custom_tool_call", "web_search_call" }`. (Observed: 41 + 3 + 8.) |
| `startedAt` | first record's top-level `timestamp` (or `session_meta.payload.timestamp`). |
| `gitUsername` | `resolveGitUsername(cwd)` where `cwd = session_meta.payload.cwd`. |

### 3. Cumulative vs. delta — CONFIRMED CUMULATIVE

`token_count` events carry `payload.info` with **both** `total_token_usage` and
`last_token_usage`. `total_token_usage` is the running cumulative total for the
session (on the final event, `total_*` ≈ `last_*` because it represents the
whole session state at that point). Some early `token_count` events have
`info: null` (rate-limit-only pings) and must be skipped.

**Rule:** Walk all `token_count` events, keep the **last one whose `info` is
non-null**, and read its `info.total_token_usage`. Do NOT sum across events
(that would multi-count). This matches the API's overwrite-not-merge contract.

### 4. Mechanism decision — (B) `$PATH` shim

Codex has no Claude-Code-style `Stop` hook. Of the two candidates:

- **(A) filesystem watcher daemon** — rejected for Phase 1: requires a
  launchd/systemd service, lifecycle management, "session ended" heuristics.
- **(B) `$PATH` shim** — **CHOSEN.** Simpler install, no daemon, fires on
  graceful exit. Tradeoff: won't fire on `kill -9` (acceptable; the next
  graceful session still re-reports cumulative totals for *its* session, and a
  missed session is a tolerable gap for live telemetry).

**Install story (documented in `@jigit/hook-codex` README):**
A shell function or shim earlier in `$PATH` named `codex` that runs the real
`codex "$@"`, then on exit runs the reporter against the most-recently-modified
file under `~/.codex/sessions/**/*.jsonl`:

```sh
codex() {
  command codex "$@"
  local status=$?
  npx -y @jigit/hook-codex >/dev/null 2>&1 || true
  return $status
}
```

The reporter (`jigit-hook-codex`), when run with no args, locates the latest
`~/.codex/sessions/**/*.jsonl`, parses it, builds the payload, and posts.
Uninstall = remove the shell function. (A `--file <path>` arg is also supported
so a future daemon variant can reuse the same parser.)

### 5. Parser contract for Task 8

`buildPayload(sessionId, cwd, records)` where `records` is the parsed array of
line objects:
- `model` = last `turn_context.payload.model` (fallback `"unknown"`).
- token fields = last non-null `token_count.info.total_token_usage`.
- `toolCallCount` = count of the three tool-call `response_item` subtypes.
- `startedAt` = first record `timestamp`.
- `sessionId` = `session_meta.payload.id` (the `main()` derives this + `cwd`
  from the file; `buildPayload` takes them as params so it's pure/testable).
- `costUsd: null`.

---

## Copilot

### 1. CLI surface

Two things named "copilot" exist on this machine:
- `gh copilot` — the legacy **preview** wrapper (`gh` extension). `gh copilot --help`
  describes it as "in preview and subject to change"; it downloads/execs a
  Copilot CLI from `$PATH` or `~/.local/share/gh/copilot`.
- `copilot` — the newer **standalone** GitHub Copilot CLI, **v1.0.61**
  (`copilot --version` → "GitHub Copilot CLI 1.0.61").

Phase 1 targets the CLI invocation path (either form); IDE-chat stays deferred.

### 2. Telemetry availability — NONE local

- No usage/session state directories: `~/.config/gh-copilot/` and
  `~/.cache/gh-copilot/` do **not** exist.
- Copilot billing is **seat-based**, so there is no per-invocation cost or token
  accounting exposed to the client. → `costUsd: null` is **permanent**;
  `inputTokens/outputTokens` default to `0` and `toolCallCount: null` unless a
  future CLI version surfaces them in stdout.

### 3. Synthetic session identity

Copilot CLI invocations are effectively one-shot with no persistent session id.
→ synthesize `sessionId = \`copilot-${Date.now()}-${process.pid}\`` (matches
spec §4.3). `model` defaults to the constant `"copilot"` unless the CLI prints
a model name we can capture.

### 4. Install form — shell function wrapper

Mirror the Codex shim: a shell function that runs the real Copilot CLI then
fires the reporter. Documented in `@jigit/hook-copilot` README:

```sh
copilot() {
  command copilot "$@"
  local status=$?
  npx -y @jigit/hook-copilot >/dev/null 2>&1 || true
  return $status
}
```

(Or the `gh copilot` equivalent for users on the preview wrapper.) The reporter
builds a minimal payload (synthetic id, `model: "copilot"`, zero tokens, null
cost) and posts — establishing presence/usage counts per developer even without
token data. A globally-installed `jigit-hook-copilot` binary is the alternative
to `npx -y`.

### 5. Parser contract for Task 8

`buildPayload(cwd, info?)` where `info` is an optional bag of whatever the CLI
exposes (`{ model?, inputTokens?, outputTokens?, toolCallCount? }`):
- `tool: "copilot"`, `sessionId: \`copilot-${Date.now()}-${process.pid}\``.
- `model = info?.model ?? "copilot"`, tokens default `0`,
  `costUsd: null`, `toolCallCount: info?.toolCallCount ?? null`.
- `gitUsername = resolveGitUsername(cwd)`, `startedAt = new Date().toISOString()`.

---

## Summary of decisions

| Question | Decision |
|---|---|
| Codex log schema | Documented above; tokens in `event_msg`/`token_count`/`info.total_token_usage`. |
| Codex mechanism | (B) `$PATH` shim (shell function), with `--file` arg for future daemon reuse. |
| Codex cumulative vs delta | Cumulative — take the **last non-null** `token_count.info.total_token_usage`. |
| Copilot telemetry | None locally; seat-based → `costUsd` null permanently, tokens 0. |
| Copilot session id | Synthetic `copilot-<ts>-<pid>`. |
| Copilot install | Shell-function wrapper (same shape as Codex). |
