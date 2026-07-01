# Fix Agent Template edit modal empty prompt

## Task
Khi mở modal Edit Agent Template trên trang Config, trường Prompt không hiển thị giá trị đã lưu trước đó.

## Root cause
API trả về object Prisma thô với field `systemPrompt` và `maxConcurrent`, trong khi dashboard (`AgentTemplateItem`) đọc `prompt` và `maxTurns`. Create/update đã map `prompt` → `systemPrompt` khi ghi DB nhưng không map ngược khi đọc.

## Changes
- `packages/api/src/config/agent-templates.service.ts`: thêm `toResponse()` map `systemPrompt` → `prompt`, `maxConcurrent` → `maxTurns`; dùng cho `list`, `create`, `update`. `create`/`update` cũng chấp nhận `maxTurns` từ dashboard.
- `packages/api/src/config/agent-templates.service.test.ts`: thêm test cho mapping list/create response.

## Tests
- `pnpm --filter @jigit/api test -- agent-templates.service.test.ts` — 6/6 passed.

## Follow-ups
- Không cần thay đổi frontend; dashboard đã dùng đúng field names.
