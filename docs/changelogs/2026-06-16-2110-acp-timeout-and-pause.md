# Fix: job treo vô hạn khi ACP subprocess kẹt + Pause không có tác dụng

**Date:** 2026-06-16
**Task:** Fix "No onPostToolUseHook found" gây treo cả máy + nút Pause vô dụng (UI và logic)

## Root cause (systematic-debugging)

1. **Treo vô hạn**: `AcpSession.request()` (`packages/worker/src/acp/client.ts`)
   lưu mọi outgoing JSON-RPC request (kể cả `session/prompt`) vào `Map`
   `pending` **không có timeout**. Khi subprocess
   `@agentclientprotocol/claude-agent-acp` (chạy qua `npx`, không pin
   version) gặp bug nội bộ "No onPostToolUseHook found..." và không bao giờ
   trả response, Promise đó treo vĩnh viễn → node `runAgent` của LangGraph
   treo vĩnh viễn → job kẹt "running" mãi. Kết luận trước đây (changelog
   `2026-06-16-fix-job-status-running.md`) rằng lỗi này "harmless, chỉ log
   stderr" chỉ đúng khi thư viện vẫn tiếp tục trả response sau khi log —
   không đúng cho mọi trường hợp.
2. **Pause vô dụng**: `shouldPause(jobId)` (interface `ISignals`,
   implementation `RedisSignals` trong `main.ts`) nhận đúng tín hiệu pause
   qua Redis, nhưng **không có chỗ nào trong `graph.ts`/`main.ts` gọi nó**.
   Xác nhận qua `git log -S shouldPause`: hàm được khai báo từ commit đầu
   tiên scaffold project, chưa từng được wire vào logic thực thi — tính năng
   nửa vời (có transport, thiếu consumer), không phải regression.

## Changes

### `packages/shared`
- `config.ts` — thêm `ACP_REQUEST_TIMEOUT_MS` (default `600000`ms = 10 phút) → `cfg.acpRequestTimeoutMs`.
- `.env.example` — document biến mới.

### `packages/worker`
- `acp/client.ts`:
  - `AcpSessionOpts.requestTimeoutMs` (optional, default 600000ms qua `DEFAULT_REQUEST_TIMEOUT_MS`).
  - `request()`: mỗi outgoing request có `setTimeout` riêng; hết hạn mà chưa có response → reject `"ACP request timed out after <ms>ms: <method>"`, xoá khỏi `pending`.
  - `handleMessage()`: `clearTimeout` khi response thật đến.
  - `stop()`: clear toàn bộ timer còn lại trong `pending` trước khi kill subprocess (tránh leak).
- `main.ts`:
  - Truyền `requestTimeoutMs: cfg.acpRequestTimeoutMs` khi tạo `AcpSession`.
  - Abort-poll loop (đang dùng cho `shouldStop`/`shouldDelete`, `Promise.race` với `session.runPrompt()`): thêm điều kiện `shouldPause(jobId)` → `session.stop()` + reject `"Job paused"`.
  - Catch block ở job runner: thêm nhánh `message === "Job paused" || shouldPause(jobId)` → `sink.setStatus(jobId, "paused")` (đặt trước nhánh `"failed"` chung, không xoá worktree — khác `stop`/`delete`).

### Dashboard
- Không cần sửa — `JobStatusBadge.tsx` và `Overview.tsx` đã có style sẵn cho status `"paused"`; tự hiển thị đúng khi backend set status qua polling/SSE hiện có.

## Tests

- Viết test mới `client.test.ts`: fake ACP subprocess hoàn thành handshake nhưng không bao giờ trả lời `session/prompt` (mô phỏng đúng bug "No onPostToolUseHook") — xác nhận `runPrompt()` reject với message chứa "timed out" trong `requestTimeoutMs: 200`ms thay vì treo. Test fail trước khi implement (10s timeout của vitest), pass sau khi implement (300ms).
- `pnpm --filter @jigit/shared test` — 64 passed, 2 skipped
- `pnpm --filter @jigit/worker test` — 20 passed (19 cũ + 1 mới)
- `pnpm -r build` — all packages clean

## Follow-ups

- Pause hiện tại chỉ dừng agent run đang diễn ra (kill subprocess ACP) và set status `"paused"`, giữ nguyên worktree để có thể resume — nhưng **resume-from-checkpoint thực sự** (tiếp tục đúng tiến trình LangGraph từ điểm dừng) chưa được implement trong task này, ngoài phạm vi 2 bug đang fix.
- `ACP_REQUEST_TIMEOUT_MS` mặc định 10 phút — nên theo dõi thực tế xem có job hợp lệ nào cần agent suy nghĩ/tool-call lâu hơn ngưỡng này không, điều chỉnh nếu cần.
- Nguyên nhân gốc của lỗi "No onPostToolUseHook" vẫn nằm trong thư viện bên thứ 3 `@zed-industries/claude-code-acp` (qua `npx`, không pin version) — chưa report/pin version, chỉ chặn hậu quả phía JiGit.
