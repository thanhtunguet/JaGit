# Fix: job status never transitions to "running"

**Date:** 2026-06-16  
**Files changed:** `packages/worker/src/main.ts`

## Task

Two bugs reported:
1. Job status stays `queued` when agent opens a job (never transitions to `running`).
2. ACP subprocess emits: `No onPostToolUseHook found for tool use ID: toolu_...`

## Root causes

### Bug 1 — job status stays `queued`
The BullMQ processor in `main.ts` never called `setStatus(jobId, "running")` at job pickup. The LangGraph state was initialized with `status: "running"` in memory, but that was never persisted to the DB. The job stayed `queued` until the `report` node called `setStatus("done")` at the very end — or stayed `queued` forever on failure.

### Bug 2 — `No onPostToolUseHook` error
This is a bug inside `@zed-industries/claude-code-acp` (the library used by `@agentclientprotocol/claude-agent-acp`). When `bypassPermissions` mode is active, some tool use IDs go through a `registerHooks: false` path and are not registered in the `toolUseCallbacks` map, but the `PostToolUse` hook still fires for them — triggering the error. This is logged to the ACP subprocess stderr (which is inherited by the worker) but does **not** interrupt execution. It's a library bug, not ours to fix.

## Changes made

**`packages/worker/src/main.ts`**
- Added `await deps.sink.setStatus(jobId, "running")` immediately before `graph.run()` so the DB is updated as soon as the worker picks up the job.
- Wrapped `graph.run()` in a try/catch: on unhandled error, set status to `"failed"` with the error message and re-throw (so BullMQ still marks the queue job as failed).

## Tests
- Build passes cleanly (`pnpm --filter @jigit/worker build`).
- No new tests added (this is a two-line runtime behavior fix; existing graph tests cover the graph logic).

## Follow-ups
- None; the ACP hook warning is an upstream library issue with no practical impact on functionality.
