# Jobs page actions: retry, pause, delete

**Date:** 2026-06-16

## Task

Thêm action buttons trên Jobs page:
- Retry cho job `failed`
- Pause cho job `running`
- Delete cho mọi job (có confirmation)
- Job đang running: stop agent + dọn worktree trước khi xóa

## Changes

### API
- `POST /jobs/:id/retry` — reset failed job → queued, re-enqueue BullMQ
- `DELETE /jobs/:id` — gửi `delete` control nếu active, chờ worker, remove worktree, xóa DB
- `packages/api/src/jobs/jobs.service.test.ts` — 5 tests

### Shared
- `delete` control signal type
- `removeWorktree()` helper (`git-worktree.ts`)

### Worker
- `job-runtime.ts` — track ACP session + workdir per job
- `main.ts` — abort agent on stop/delete; cleanup worktree on delete
- `graph.ts` — persist `workdir` + `branch` to Job row

### Dashboard
- `Jobs.tsx` — Retry / Pause / Delete buttons + delete confirmation dialog
- `client.ts` — `retryJob`, `deleteJob`

## Tests
- Worker: 16/16 passed
- API jobs.service: 5/5 passed
- Dashboard client: passed
- Build: worker, api, dashboard OK

## Follow-ups
- None
