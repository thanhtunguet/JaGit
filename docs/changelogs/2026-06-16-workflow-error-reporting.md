# Workflow error reporting + failure notifications

**Date:** 2026-06-16

## Task

1. Khi commit/tạo MR GitLab lỗi, step `openMergeRequest` bị stuck ở `running`, không có event lỗi trên UI.
2. Khi task fail, cần báo qua Telegram và comment lỗi vào Jira issue.

## Changes

### Worker
- **`packages/worker/src/run-step.ts`** (new): `runStep()` bọc mỗi graph node — khi lỗi ghi `step_error` event, `finishStep(..., "failed")`, rồi rethrow.
- **`packages/worker/src/graph.ts`**: Tất cả nodes dùng `runStep` thay vì start/finish thủ công.
- **`packages/worker/src/prisma-sink.ts`**: `finishStep` publish SSE `step_changed` để dashboard cập nhật timeline live.
- **`packages/worker/src/main.ts`**: Trong catch, gửi Telegram + comment Jira (`addWorklog`) với nội dung lỗi (best-effort qua `Promise.allSettled`).

### Dashboard
- **`packages/dashboard/src/pages/JobDetail.tsx`**: Lắng nghe SSE `status_changed` / `step_changed`; hiển thị `step_error` trong Console; hiện `job.error` trong sidebar.
- **`packages/dashboard/src/api/client.ts`**: Thêm `error` vào type `Job`.

## Tests
- `packages/worker/src/graph.test.ts`: test mới — `openMergeRequest` throw → `step_error` event + step `failed`.
- `pnpm --filter @jigit/worker test` — 16 passed.
- Build worker + dashboard OK.

## Follow-ups
- `addWorklog` hiện gọi Jira comment API, chưa phải time-tracking worklog endpoint.
