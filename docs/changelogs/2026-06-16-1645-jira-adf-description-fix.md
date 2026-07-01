# 2026-06-16 1645 — Fix Jira description bị mất nội dung trong prompt agent

## Task

Người dùng tạo Jira task có hướng dẫn cụ thể trong Description ("Clone repo về,
sửa 1 dòng readme, commit và tạo MR") nhưng agent không tuân theo. Yêu cầu điều
tra xem Description có được truyền vào prompt ACP không.

## Root cause

`JiraAdapter.getIssue` (`packages/worker/src/adapters/jira.ts`) gọi Jira REST
API v3 (`/rest/api/3/issue/{key}`), nơi field `description` mặc định trả về
**Atlassian Document Format (ADF)** — một object JSON lồng nhau, không phải
plain string. Code cũ gán thẳng `data.fields?.description` vào
`IssueData.description` (khai báo `string` nhưng TypeScript không bắt được vì
`data` có type `any`).

Khi `graph.ts`'s `runAgent` ghép prompt bằng template string
`` `Description: ${state.issueDescription}` ``, JS coerce object thành
`"[object Object]"` — toàn bộ nội dung hướng dẫn thật không bao giờ tới được
agent.

Test cũ (`jira.test.ts`) chỉ mock `description: "details"` (plain string) nên
không phát hiện được lỗi này.

## Thay đổi

- `packages/worker/src/adapters/jira.ts`: thêm `adfToText()` (đệ quy duyệt cây
  ADF, nối text node, thêm `\n\n` sau các block type) và `descriptionToText()`
  (pass-through nếu đã là string, convert nếu là object/null). `getIssue` giờ
  dùng `descriptionToText(data.fields?.description)`.
- `packages/worker/src/adapters/jira.test.ts`: thêm test
  `"converts an Atlassian Document Format description into plain text"` với
  fixture ADF thật (paragraph + bulletList), xác nhận không còn
  `[object Object]` và text gốc xuất hiện trong kết quả.

## Tests

- `pnpm --filter @jigit/worker test`: 25/25 passed (test mới RED trước fix,
  GREEN sau fix).
- `pnpm -r build`: clean, không lỗi type.

## Follow-up (chưa fix, không trong scope)

- `packages/api/src/webhooks/normalize.ts` có cùng pattern
  (`fields.description ?? ""`) ở `normalizeJira`. Hiện tại field này không
  được dùng ở downstream (`webhooks.service.ts`, `jobs.service.ts` không đọc
  `trigger.description`), nên không ảnh hưởng hành vi thực tế — nhưng nếu sau
  này có chỗ dùng `NormalizedTrigger.description` (hiển thị dashboard, log...),
  cần áp dụng cùng fix hoặc factor `adfToText`/`descriptionToText` ra
  `packages/shared` để dùng chung.
