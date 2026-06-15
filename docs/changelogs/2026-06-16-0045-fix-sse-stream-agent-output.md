# Session Changelog — 2026-06-16-0045-fix-sse-stream-agent-output

## Task
Fix SSE 404 errors, stream agent output from worker to dashboard, add console tab to JobDetail, and make job rows clickable.

## What Changed

### Dashboard
- `packages/dashboard/src/api/client.ts` — Fixed SSE URLs: `useSSE` now connects to `/api/jobs/${id}/stream`, `useApprovalsSSE` to `/api/approvals/stream`
- `packages/dashboard/src/components/layout/AppShell.tsx` — Fixed fetch and SSE URLs to `/api/approvals` and `/api/approvals/stream`
- `packages/dashboard/src/pages/JobDetail.tsx` — Added `ConsoleTab` component (terminal-like dark view, auto-scroll, toggleable); added "Console" tab to tab list
- `packages/dashboard/src/pages/Jobs.tsx` — Made table rows clickable via `useNavigate` to `/jobs/${id}`
- `packages/dashboard/src/api/client.test.ts` — Updated all test expectations to use `/api/*` URLs

### Worker
- `packages/worker/src/acp/client.ts` — Added `AcpOutput` interface and `onOutput` callback to `AcpSessionOpts`; wired `session/update` handler to emit structured output (text, tool_use, tool_result)
- `packages/worker/src/graph.ts` — Updated `acp.run` signature to accept `onOutput`; wired it to `sink.addEvent(..., type: "agent_output")`
- `packages/worker/src/main.ts` — Passed `onOutput` through to `AcpSession` constructor

## Tests
- Dashboard: 11 passed (was 8 failed before URL fix)
- Worker: 10 passed
- Shared: 50 passed, 2 skipped
- API: 51 passed, 3 pre-existing webhook failures (unrelated — missing DASHBOARD_API_TOKEN env in test)

## Follow-ups
- Consider adding ANSI color rendering to ConsoleTab for richer agent output display
- Consider adding log-level filtering (info/warn/error) to ConsoleTab
