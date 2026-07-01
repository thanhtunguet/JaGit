# 2026-06-28 22:30 — hook-copilot: Fix transcript parsing to real VS Code format

## Task

Fix `@jagit/hook-copilot` to correctly parse the real VS Code Copilot agent transcript format for tool call counting and session start time extraction.

## Problem

The previous implementation's `CopilotTranscriptEntry` interface was modelled after the Claude Code / OpenAI-style format (`message.role`, `message.model`, `message.usage`), which does **not** match the actual VS Code Copilot transcript format. As a result:

- **Model name** always fell back to `"copilot"` (correct by accident, but for the wrong reason)
- **Token usage** (input/cached/output) was always 0 (correct by accident — Copilot uses seat-based billing and does NOT expose per-call token telemetry in the transcript)
- **Tool call count** was always 0 (wrong — the old code looked for `message.content[].type === "tool_use"` which doesn't exist in the real format)
- **Session start time** used the first entry's `timestamp` field, missing the more accurate `session.start` → `data.startTime`

## Root Cause

The real VS Code Copilot transcript (`.jsonl`) format (observed in VS Code Copilot 0.44+):

```jsonl
{"type":"session.start","data":{"sessionId":"...","startTime":"...","copilotVersion":"0.54.0",...},"timestamp":"..."}
{"type":"user.message","data":{"content":"...","attachments":[]},"timestamp":"..."}
{"type":"assistant.turn_start","data":{"turnId":"0"},"timestamp":"..."}
{"type":"assistant.message","data":{"messageId":"...","content":"...","toolRequests":[{"toolCallId":"...","name":"list_dir","arguments":"{...}","type":"function"}]},"timestamp":"..."}
{"type":"tool.execution_start","data":{"toolCallId":"...","toolName":"list_dir","arguments":{...}},"timestamp":"..."}
{"type":"tool.execution_complete","data":{"toolCallId":"...","success":true},"timestamp":"..."}
{"type":"assistant.turn_end","data":{"turnId":"0"},"timestamp":"..."}
```

Key facts confirmed from the VS Code hooks reference and real transcript inspection:
- **No `message.usage` field** — token usage is not in the transcript
- **No `message.model` field** — model name is not in the transcript
- Tool calls are in `assistant.message` → `data.toolRequests[]` (not `message.content[].type === "tool_use"`)
- Session start time is in `session.start` → `data.startTime`

## Changes

### `packages/hook-copilot/src/index.ts`

- **Replaced** `CopilotTranscriptEntry` (old Claude-style interface) with proper typed interfaces:
  - `CopilotTranscriptSessionStart` — `type: "session.start"` with `data.startTime`, `data.copilotVersion`, etc.
  - `CopilotTranscriptAssistantMessage` — `type: "assistant.message"` with `data.toolRequests[]`
  - `CopilotTranscriptEntry` union type covering all observed entry types
- **Replaced** `hasToolUse()` helper with `countToolCalls()` — counts individual `toolRequests` items across all `assistant.message` entries
- **Replaced** `extractStartTime()` — prefers `session.start` → `data.startTime`, falls back to first entry `timestamp`
- **Updated** `buildPayloadFromStdin()` — uses new helpers; explicitly documents that model/tokens are not available
- **Removed** the old token aggregation loop (was reading non-existent fields)

### `packages/hook-copilot/src/index.test.ts`

- **Replaced** old `TRANSCRIPT_SNAKE` / `TRANSCRIPT_CAMEL` fixtures (Claude-style) with real-format fixtures:
  - `REAL_TRANSCRIPT` — `session.start` + two `assistant.message` entries (one with 2 tool requests, one with 0)
  - `TRANSCRIPT_NO_SESSION_START` — `assistant.message` only (tests fallback timestamp logic)
- **Updated** all test assertions to match real behavior:
  - Model is always `"copilot"` (not extracted from transcript)
  - Tokens are always 0 (not available)
  - Tool call count = sum of `toolRequests.length` across all `assistant.message` entries
  - `startedAt` prefers `session.start.data.startTime`
- **Added** new tests: `ignores non-assistant.message entries for tool call counting`, `counts tool requests from transcript without session.start`, `handles missing transcript_path gracefully (no read called)`
- Removed `beforeEach` import (unused)

## Tests

```
pnpm --filter @jagit/hook-copilot test
✓ src/index.test.ts (16)
  ✓ copilot buildPayload (legacy / no-stdin mode) (3)
  ✓ copilot buildPayloadFromStdin (VS Code agent hook mode) (13)
Tests: 16 passed (16)
```

## Follow-ups

- Token usage (input/cached/output/cost) remains unavailable — Copilot uses seat-based billing and does not expose per-call telemetry in the hook transcript or stdin payload. This is a fundamental limitation of the Copilot billing model, not a bug.
- Model name remains `"copilot"` — not exposed in the transcript. If VS Code adds model info to the Stop hook stdin in a future release, it can be read from `stdin.model`.
- The transcript format is explicitly marked as unstable by VS Code docs — monitor for changes.
