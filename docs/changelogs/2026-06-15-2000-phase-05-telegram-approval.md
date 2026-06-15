# Phase 5 — Telegram Bot + Approval Bridge

**Date:** 2026-06-15  
**Branch:** `worktree-phase-05-telegram-approval`

## Task

Implement Phase 5: approval lifecycle — idempotent `resolveApproval`, `awaitApproval` helper, Telegram bot, and wiring into the LangGraph worker.

## What Changed

### packages/api

- `src/approvals/approvals.service.test.ts` _(new)_ — TDD tests for `ApprovalsService.decide`: pending approval resolves `{ decided: true }`, already-decided returns `{ alreadyDecided: true }`.
- `src/approvals/approvals.module.ts` — Added `exports: [ApprovalsService]` so `TelegramModule` can inject it.
- `src/telegram/telegram.service.ts` _(new)_ — `TelegramService` with `OnModuleInit` (starts polling), `OnModuleDestroy` (stops polling), `sendApproval` (inline keyboard with `appr:<id>:<optionId>` callback data), `sendReport`, and a `callback_query` handler that calls `approvalsService.decide`.
- `src/telegram/telegram.module.ts` _(new)_ — `TelegramModule` imports `ApprovalsModule`, provides and exports `TelegramService`.
- `src/app.module.ts` — Registered `TelegramModule`.

### packages/worker

- `src/approval.ts` _(new)_ — `awaitApproval(opts)`: subscribes to `controlChannel(jobId)` via IORedis, resolves on matching `approval` signal, auto-rejects on timeout (calls `resolveApproval` with `denyOptionId` + `"system"` via).
- `src/approval.test.ts` _(new)_ — TDD: resolves with `chosenOptionId` from channel; auto-rejects with `denyOptionId` on timeout.
- `src/graph.ts` — Added `prisma: PrismaClient` to `GraphDeps`; imported `awaitApproval`; replaced the placeholder `onPermission` stub in `runAgent` with full approval workflow (create Approval row, publish `approval_requested` event, best-effort Telegram notify, `awaitApproval`).
- `src/graph.test.ts` — Added `prisma` mock to `fakeDeps`.
- `src/main.ts` — Pass `prisma` singleton in `GraphDeps`.

## Tests

| Package | Before | After |
|---------|--------|-------|
| `@jigit/api` | 9 passing | 11 passing (+2 approve/idempotent) |
| `@jigit/worker` | 7 passing | 9 passing (+2 awaitApproval) |

## Follow-ups

- Phase 5b (dashboard) — `docs/plans/phase-05-dashboard.md` (if exists) for SSE approval cards.
- Integration test: real Telegram bot token + DB to verify end-to-end.
