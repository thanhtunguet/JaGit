# `runAgent` stuck forever, Stop/Pause have no effect once it's hung

**Task:** Debug "stuck ở bước runAgent mãi không dừng được" — a job stuck in
`runAgent` that clicking Stop/Pause does not unstick.

## Root cause

`AcpSession.stop()` (`packages/worker/src/acp/client.ts`) only cleared
pending requests' timeout timers and the `pending` map — it never called
`reject()` on the in-flight request promises:

```ts
async stop(): Promise<void> {
  for (const { timer } of this.pending.values()) clearTimeout(timer);
  this.pending.clear();
  try { this.proc.kill("SIGTERM"); } catch { /* ignore */ }
}
```

Any code awaiting `AcpSession.request()` (including `runPrompt()`, and the
three handshake calls inside `start()`) has its only path to settling —
the `setTimeout` rejection installed in `request()` — disarmed by `stop()`
before the kill. The subprocess is dead, but the JS promise is never
resolved or rejected, so `await` on it hangs indefinitely.

This matters because `stop()` is exactly what gets called when a human
clicks Stop/Pause (`RedisSignals.onAbort` → `abortJobAgent` →
`session.stop()`, see `packages/worker/src/job-runtime.ts` and
`packages/worker/src/main.ts`'s abort-poll loop). So once a request is
in-flight when Stop/Pause is clicked — including during the ACP handshake
in `start()`, before the abort-poll `Promise.race` is even constructed —
clicking Stop/Pause kills the subprocess but leaves the awaiting code
hanging forever, looking exactly like "stuck at runAgent, can't be
stopped."

(Separately, while investigating, confirmed `docker-compose.yml` is
currently empty on disk — a pre-existing uncommitted local change from
before this session, unrelated to this bug; flagged to the user, not
touched.)

## Fix

`AcpSession.stop()` now rejects every pending request with
`Error("ACP session stopped")` before clearing the timer, so any code
awaiting `request()`/`runPrompt()`/`start()` settles immediately when
`stop()` is called, instead of relying on the (now-cleared) timeout.

## Tests

- Added `packages/worker/src/acp/client.test.ts`: "AcpSession stop() while
  a request is pending > rejects the in-flight request immediately instead
  of hanging until the timeout" — uses the existing `HANGING_AGENT_SCRIPT`
  fake agent, calls `stop()` while `runPrompt()` is pending, asserts the
  promise rejects with `/stopped/i` instead of waiting for the (60s)
  `requestTimeoutMs`.
- Verified RED: test timed out at 10s against the old `stop()` — proving
  the hang.
- Verified GREEN: `pnpm --filter @jigit/worker test` → 6 files, 23 tests,
  all passing (600ms for the full `client.test.ts` file).
- `pnpm -r build`: all packages build clean.

## Follow-ups

- None required for this fix. Worth separately checking why
  `docker-compose.yml` is empty on disk (uncommitted, pre-existing) —
  flagged to the user.
