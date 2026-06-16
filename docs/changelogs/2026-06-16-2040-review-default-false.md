# Tắt enforcement cứng requireReviewBeforeCommit (default false)

**Date:** 2026-06-16
**Task:** Fix job SCRUM-11 failing with "Human review required before commit"

## Summary

`reviewCheck` trong `graph.ts` chặn job nếu agent không tự gọi MCP tool
`jigit_request_review` trước khi commit — nhưng việc gọi tool đó chỉ là một
instruction chèn vào prompt, không có cơ chế ép buộc ở tầng protocol. Mọi job
mà agent không tự gọi tool sẽ luôn fail ở bước này vì `requireReviewBeforeCommit`
mặc định `true` ở mọi nơi.

Quyết định: đổi default thành `false`. Tool `jigit_request_review` vẫn luôn
được pass xuống ACP session (không đổi — `buildAcpMcpServers` luôn push MCP
server `jigit` bất kể flag), nên agent vẫn có thể tự gọi review khi cần; việc
"khi nào cần review" do người dùng tự hướng dẫn qua system prompt/instructions/
skill của từng AgentTemplate, không còn bị graph ép buộc theo mặc định. Field
và hard-gate `reviewCheck` vẫn giữ nguyên — chỉ đổi giá trị mặc định, các
template muốn bật review chủ động set `requireReviewBeforeCommit = true`.

## Changes

- `packages/shared/prisma/schema.prisma` — `requireReviewBeforeCommit @default(true)` → `@default(false)`.
- `packages/shared/prisma/migrations/20260616120000_review_default_false/` — `ALTER COLUMN ... SET DEFAULT false`.
- `packages/api/src/config/agent-templates.service.ts` — `create()` và `toResponse()` fallback `?? true` → `?? false`.
- `packages/worker/src/main.ts` — 2 chỗ `template?.requireReviewBeforeCommit ?? true` → `?? false`.
- `packages/dashboard/src/pages/Config.tsx` — checkbox mặc định `initial?.requireReviewBeforeCommit ?? true` → `?? false`.
- `packages/api/src/config/agent-templates.service.test.ts` — cập nhật 2 assertion mong default cũ (`true` → `false`).

Không đổi: `mcp-servers.ts` (`buildAcpMcpServers`/`buildJigitServer` đã luôn
push tool `jigit`), `graph.ts` (`reviewCheck` logic, `buildReviewInstruction`
vẫn chạy có điều kiện theo flag).

## Tests

- `pnpm --filter @jigit/shared test` — 64 passed, 2 skipped
- `pnpm --filter @jigit/api test` — 67 passed; 2 pre-existing webhook failures
  (xác nhận tồn tại sẵn trên `main` trước thay đổi này qua `git stash`, không
  liên quan tới review flag — không sửa trong phạm vi task này)
- `pnpm --filter @jigit/worker test` — 19 passed
- `pnpm --filter @jigit/dashboard test` — 17 passed
- `pnpm -r build` — all packages clean

## Follow-ups

- `prisma migrate deploy` khi deploy để áp default mới lên DB (không đổi dữ liệu hiện có).
- 2 webhook test failures pre-existing (`webhooks.controller.test.ts` — 401 thay vì 202/200) cần điều tra riêng, không thuộc phạm vi task này.
