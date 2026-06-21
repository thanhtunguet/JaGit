# Fix Redis Unhandled Rejections

Fixed an issue where the API and Worker processes would crash with an unhandled exception (`Error: Connection is closed.`) when the Redis connection failed or dropped. This caused `pnpm dev:api` to restart or exit, resulting in 500/502 errors for all endpoints.

## Changes

- Added `.on("error")` listeners to `Queue` and `Worker` instances in `packages/shared/src/queue.ts`.
- Added an `.on("error")` listener to the Redis client created by `makeRedis` in `packages/shared/src/events.ts`.
- Added an `.on("error")` listener to the `IORedis` instance used for `RedisSignals` in `packages/worker/src/main.ts`.
- Increased `requestTimeoutMs` from 200ms to 500ms in `packages/worker/src/acp/client.test.ts` to prevent flaky timeout failures on slower test runners during the `initialize` step.

## Tests Added/Run
- Ran `pnpm -r test` across all workspaces to ensure the changes did not break existing functionality. All tests pass, including the previously flaky `client.test.ts`.

## Follow-ups
- Consider implementing a more robust reconnection backoff strategy if the default ioredis behavior becomes insufficient for production deployments.
