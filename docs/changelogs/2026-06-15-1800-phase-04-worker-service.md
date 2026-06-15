# Phase 4 — Worker Service

**Date:** 2026-06-15  
**Branch:** `worktree-phase-04-worker`  
**Plan:** `docs/plans/phase-04-worker-service.md`

## What was done

Implemented the full `@jigit/worker` package from scratch using TDD throughout.

## Files created / modified

### `packages/worker/src/adapters/`
- `interfaces.ts` — `IssueData`, `MrResult`, `IJiraAdapter`, `IGitlabAdapter`, `IGitAdapter`, `IJobSink`, `ISignals`
- `jira.ts` — `JiraAdapter` (Basic-auth, withRetry, fetch-injectable)
- `jira.test.ts` — 2 tests: correct REST path + Basic-auth header; non-ok throws
- `gitlab.ts` — `GitlabAdapter` (token-embedded clone URL, MR creation)
- `gitlab.test.ts` — 2 tests: clone URL format; MR returns webUrl
- `git.ts` — `GitAdapter` (execa shell-outs: clone, createBranch, hasChanges, commitAll, push)

### `packages/worker/src/acp/`
- `protocol.ts` — newline-delimited JSON-RPC framing (`createWriter`, `createReader`)
- `client.ts` — `AcpSession` (spawn subprocess, handshake, permission bridge via `onPermission`)
- `client.test.ts` — 1 test: fake node process over stdio, verifies end_turn + permission bridge + update tracking

### `packages/worker/src/`
- `graph.ts` — `buildGraph()` returns `{ run() }`. LangGraph `StateGraph` with 8 nodes + stop node. Conditional edge before `runAgent` checks `signals.shouldStop()`.
- `graph.test.ts` — 2 tests: full run to `done` sets `mrUrl`; stop signal halts before `runAgent`
- `prisma-sink.ts` — `PrismaJobSink` implements `IJobSink` via Prisma + Redis pub/sub
- `main.ts` — BullMQ consumer wiring JiraAdapter, GitlabAdapter, GitAdapter, AcpSession, PrismaJobSink, RedisSignals, TelegramBot

### `packages/worker/package.json`
- Added: `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `bullmq`, `ioredis`, `execa`, `node-telegram-bot-api`, `@types/node-telegram-bot-api`

## Tests added / run

- 4 test files, 7 tests — all passing
- `pnpm --filter @jigit/worker test` → 7 passed
- `pnpm --filter @jigit/worker build` → clean

## Notes / follow-ups

- The ACP fake-agent test required fixing the protocol: the fake sends `end_turn` with the original `session/prompt` id (not the permission id), matching the real ACP protocol design.
- `IORedis` is imported as `{ Redis as IORedis }` from `ioredis` v5 (named export, no default constructor).
- `node-telegram-bot-api`'s `sendMessage` returns `Promise<Message>`, wrapped with `.then(() => undefined)` to satisfy `sendTelegram: (text) => Promise<void>`.
- Phase 5 (Dashboard) is next.
