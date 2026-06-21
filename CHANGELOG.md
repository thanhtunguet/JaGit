## 2026-06-21 (pricing-model-normalization)

**Pricing Model Normalization**: Updated `PricingService` cost calculation to normalize model names and fall back to case-insensitive exact or partial match (`contains`) if an exact match isn't found. This prevents calculation errors when provided names differ slightly from stored DB names (e.g. `Kimi-K2.6` vs `azure_ai/kimi-k2.6`).

## 2026-06-21 (prefer-git-username)

**Prefer Git Username**: Hooks now prefer `git config user.name` over `git config user.email` by default when resolving the username.

## 2026-06-21 (fix-live-sessions-date-filter-bounds)

**Fix Live Sessions Date Filter Bounds**: Modified `AgentSessionService` so that filtering by end date correctly appends `T23:59:59.999Z` to ensure all sessions on that day are included. The start date also defaults to `T00:00:00.000Z`.

## 2026-06-21 (fix-live-sessions-date-picker)

**Fix Live Sessions Date Picker**: Added `color-scheme: dark` to global CSS to make the native date picker icon visible in dark mode, and changed date inputs to use uncontrolled `defaultValue` with `ref` syncing to fix a bug where typing a year manually would reset the input.

## 2026-06-21 (pricing-review-fixes)

**Pricing Review Fixes**: Verified an external review of the ccusage pricing work; fixed real issues — `hook-claude-code` no longer conflates cache-read and cache-creation tokens (was undercosting cache writes by ~12x), `PricingService`'s LiteLLM fetch now has a 10s timeout, and the per-model upsert loop runs in parallel. The "double-counting input tokens" claim was a false positive (Anthropic's `input_tokens` already excludes cache tokens).

## 2026-06-21 (ccusage-api-pricing)

**ccusage API Pricing Integration**: Implemented a periodic fetch service using `@nestjs/schedule` to sync LiteLLM model prices into the database and calculate accurate session costs on the fly when natively unavailable.

# Changelog

## 2026-06-20 (fix-hook-claude-code-symlink)

Fixed `@jigit/hook-claude-code` silently failing when installed globally: the `main()` guard used `import.meta.url === file://${process.argv[1]}`, which fails for symlinked packages because `import.meta.url` resolves to the real path while `process.argv[1]` preserves the symlink path. Changed to `realpathSync()` comparison so `main()` actually runs. See `docs/changelogs/2026-06-20-2330-fix-hook-claude-code-symlink.md`.

## 2026-06-20 (agent-session-reporting-impl)

Implemented agent session reporting Phase 1: new `@jigit/agent-reporter` shared package, `AgentSession` Prisma model + migration, `AgentSessionModule` (`POST/GET /api/agent-sessions`, idempotent upsert), three hook bin packages (`@jigit/hook-{claude-code,codex,copilot}`), and a `/usage` "Live Sessions" tab + Overview live-token widget. `pnpm -r build` clean; tests green except 2 pre-existing webhook 401s. See `docs/changelogs/2026-06-20-2230-agent-session-reporting.md`.

## 2026-06-20 (agent-session-reporting-design-complete)

Completed all six sections of the agent session reporting design (data model, API contract, hook adapters for Claude Code / Codex / Copilot CLI, dashboard surface, out-of-scope list). Spec self-review pass clean. Ready for `writing-plans`. See `docs/superpowers/specs/2026-06-20-agent-session-reporting-design.md`.

## 2026-06-20 (agent-session-reporting-brainstorm)

Started design for agent session reporting (per-session token/cost snapshots from Claude Code, Codex, GitHub Copilot via a shared `@jagit/agent-reporter` core). Section 1 (architecture) confirmed; paused mid-spec. See `docs/superpowers/specs/2026-06-20-agent-session-reporting-design.md`.

## 2026-06-20 (auth-guard-api-key)

**`AuthGuard` chấp nhận thêm `x-api-key`**: ngoài `Authorization: Bearer <token>`, giờ guard còn fallback sang header `x-api-key`, tạm thời verify cả hai cùng giá trị `DASHBOARD_API_TOKEN` (`loadConfig().dashboardApiToken`). Không đổi constructor nên 10 call site `@UseGuards(new AuthGuard(...))` hiện có không bị ảnh hưởng.

## 2026-06-20 (codeburn-consolidation-review-fix)

**Fix code review CodeBurn consolidation**: `POST /usage/upload` không đọc được field `username` từ multipart form (do `@fastify/multipart` ở stream mode không populate `req.body`) — mọi upload bị gắn sai vào user `"unknown"`. Đọc từ `data.fields.username`. Đổi `AuthGuard` token source từ đọc `process.env` trực tiếp sang `loadConfig().dashboardApiToken` để đồng bộ với các controller khác (fail fast lúc boot nếu thiếu token). Thêm integration test upload với multipart body thật.

## 2026-06-20 (codeburn-consolidation)

**Gộp CodeBurn vào JiGit như một trang dashboard mới**: Port backend Go của CodeBurn (upload ZIP CSV, list users, lấy data) sang `UsageModule` trong NestJS/Fastify, lưu trữ ở Postgres dạng JSONB (`User` + `UsageUpload` models) thay vì filesystem. Thêm trang `/usage` với đầy đủ charts/tables (Summary, Daily, Activity, Models, Projects, Sessions, Tools, Shell Commands) và widget "AI Usage" trên Overview.

## 2026-06-16 (jira-adf-description-fix)

**Fix agent không tuân theo hướng dẫn trong Jira Description**: `JiraAdapter.getIssue` lấy `description` thẳng từ Jira API v3 (Atlassian Document Format — object JSON, không phải string), khiến prompt ACP chỉ nhận được `"Description: [object Object]"`. Giờ có `adfToText`/`descriptionToText` convert ADF sang plain text trước khi đưa vào state/prompt.

## 2026-06-16 (acp-stop-rejects-pending)

**Fix job kẹt vĩnh viễn ở `runAgent`, Stop/Pause vô tác dụng**: `AcpSession.stop()` chỉ clear timer của các request đang chờ mà không bao giờ `reject()` chúng — khi subprocess bị kill, promise đang `await` (kể cả trong handshake `start()`) không bao giờ settle, treo mãi dù đã click Stop/Pause. Giờ `stop()` reject toàn bộ pending request ngay lập tức với message `"ACP session stopped"`.

## 2026-06-16 (skip-mr-when-no-changes)

**Fix GitLab 400 "source_branch does not exist"**: branch được tạo trong worktree nhưng không bao giờ push lên remote khi agent không tạo thay đổi nào, nên `openMergeRequest` luôn fail. Graph giờ có conditional edge sau `commitAndPush`: không có thay đổi → bỏ qua `openMergeRequest`/`jiraWorklog`, báo cáo "done, no MR opened" thay vì gọi GitLab API với branch chưa tồn tại trên remote.

## 2026-06-16 (gitlab-400-error-body)

**Fix lỗi GitLab 400 không có chi tiết**: `GitlabAdapter.openMergeRequest` giờ đọc response body khi request thất bại và đính kèm vào message lỗi, thay vì chỉ throw `"gitlab 400"`. Lý do thật của GitLab (nhánh không tồn tại, MR trùng, v.v.) nay xuất hiện trong `step_error` event và báo cáo Telegram.

## 2026-06-16 (acp-timeout-and-pause)

**Fix job treo vô hạn + Pause vô dụng**: `AcpSession.request()` nay có timeout (`ACP_REQUEST_TIMEOUT_MS`, default 10 phút) — chặn job kẹt "running" mãi khi subprocess ACP gặp bug "No onPostToolUseHook" và không trả response. `shouldPause` (tồn tại từ đầu project nhưng chưa từng được gọi) giờ được wire vào abort-poll loop: Pause thực sự kill agent session đang chạy và set status `"paused"`.

## 2026-06-16 (review-default-false)

**Tắt enforcement cứng review**: `requireReviewBeforeCommit` đổi default `true` → `false` (schema, API, worker, dashboard) — job không còn tự fail nếu agent không gọi `jigit_request_review`; tool vẫn luôn sẵn có, người dùng tự hướng dẫn agent qua prompt/skill khi cần review.

## 2026-06-16 (mcp-http-transport)

**MCP stdio + HTTP transport**: `McpServerConfig` hỗ trợ `transport` stdio/http; dashboard chọn loại kết nối (command hoặc URL + headers); worker build ACP `mcpServers` theo transport.

## 2026-06-16 (mcp-review-dashboard)

**MCP Review + Config Dashboard**: Built-in `jigit` MCP (`jigit_request_review`), MCP server CRUD + `/mcp-servers` page, AgentTemplate MCP assignment, worker injects MCP into ACP session, hard guard blocks commit without human review approval.

## 2026-06-16 (github-actions-docker)

**GitHub Actions Docker CI**: Workflow test + build/push multi-arch (amd64/arm64) images api/dashboard/worker lên GHCR; thêm Dockerfile dashboard.

## 2026-06-16 (job-actions-shared-component)

**Shared JobActions component**: Retry/Pause/Delete + delete confirmation dùng chung giữa Jobs list và Job detail Controls.

## 2026-06-16 (jobs-page-actions)

**Jobs page actions**: Retry (failed), Pause (running), Delete (all) với confirmation; delete job active sẽ stop agent và dọn worktree trước khi xóa.

## 2026-06-16 (workflow-error-reporting)

**Workflow error reporting**: Graph steps dùng `runStep` để ghi `step_error` và đánh dấu step `failed` khi lỗi; job fail gửi Telegram + comment Jira; dashboard cập nhật step/status qua SSE.

## 2026-06-16 (token-usage-tracking)

**Token usage from ACP + Total Tokens Used widget**: Worker parses ACP `usage_update`/`PromptResponse.usage`, persists `tokensUsed`/`costUsd` on Job after `runAgent`; Overview stat replaces Avg Token Cost with sum of tokens across all jobs.

## 2026-06-16 (dashboard-overview-real-data)

**Dashboard Overview real data**: New `GET /api/stats/overview` aggregates jobs, approvals, throughput, status distribution, and recent events from Postgres; Overview page replaces mock charts/stats with live API data.

## 2026-06-16 (config-api-token-field-style)

**Config API token field styling**: Token input now uses the same `Field` component styling as other form inputs (border, padding, focus ring).

## 2026-06-16 (fix-agent-template-edit-prompt)

**Fix Agent Template edit modal empty prompt**: API now maps `systemPrompt` → `prompt` and `maxConcurrent` → `maxTurns` in list/create/update responses so the dashboard edit dialog shows saved values.

## 2026-06-16 (job-detail-events-raw-height)

**Job detail Events/Raw full height**: Events tab scroll area and Raw tab now fill available viewport height. Raw JSON is shown in a readonly Monaco editor instead of a `<pre>` block.

## 2026-06-16 (fix-job-status-running)

**Fix job status never transitioning to "running"**: Worker now calls `setStatus(jobId, "running")` at job pickup before `graph.run()`. Added try/catch to set status to `"failed"` on unhandled graph errors. The "No onPostToolUseHook found" ACP stderr warning is an upstream library bug (harmless, no fix needed from our side).

## 2026-06-16 (fix-sse-stream-agent-output)

**Fix SSE 404s + Agent Console Streaming**: Fixed dashboard SSE URLs to use `/api` prefix (resolves 404 on `/approvals/stream`). Added ACP protocol output capture (`text`, `tool_use`, `tool_result`) streamed as `agent_output` job events. New Console tab in JobDetail with auto-scroll, dark terminal styling, and level-colored output. Jobs table rows now clickable to navigate to detail. All dashboard tests pass (11/11).

## 2026-06-15 (agent-template-model-anthropic-fields)

**AgentTemplate model field + Anthropic credential UI**: Added `model` field to `AgentTemplateItem` and `AgentTemplateDialog` (default `claude-sonnet-4-6`); updated API service default; Anthropic credential dialog now shows explicit Base URL / Auth Token / Meta fields instead of generic JSON editor.

## 2026-06-15 (config-ui-and-approvals)

**Config UI + Approvals Page (Tasks 5-11)**: Full CRUD for credentials, repo-mappings, and agent-templates with bearer-token `AuthGuard`; global `approvals` SSE channel; worker publishes `approval_requested` to global channel; Approvals page with live inline approve/reject; editable Config page with dialogs; API token bar in sessionStorage. All packages build cleanly (0 TS errors).

## 2026-06-15 (task-01 credential schemas)

**Task 1 — Shared Credential Schemas + mergeSecrets**: Added per-kind Zod schemas (`jira`, `gitlab`, `anthropic`, `telegram`) and `mergeSecrets` helper (decrypt → merge → re-encrypt) in `@jigit/shared`. Exported from shared index. 18 new tests passing.

## 2026-06-15 (phase-08 docker-e2e)

**Phase 8 — Docker + E2E Smoke Test**: Added Dockerfiles (api, worker), expanded docker-compose.yml to full stack (migrate + api + worker), added `JIGIT_FAKE_ADAPTERS=1` mode to worker (in-memory fakes, no credentials needed), E2E smoke test fires synthetic Jira webhook and polls until job reaches `done`. Fixed SpaController/Fastify wildcard conflict. All 49 unit tests + 3 E2E tests pass.

## 2026-06-15 (phase-07 post-review fixes)

**Post-review fixes** (8 findings from high-effort code review): Fixed P0 worker decrypt crash (wrong JSON.stringify wrapping), added SpaController for SPA fallback, removed duplicate path computation, fixed seed import to use @jigit/shared, removed double Zod parse, relaxed .length(4) to .min(1), removed dead export, replaced disk-only test with HTTP integration tests. All 49 tests pass.

## 2026-06-15

**Phase 7 — Seed Script + Full Wiring** (`worktree-phase-07-seed-wiring`): Completed Phase 7 — seed script (TDD, encrypted secrets, zod validation), dashboard static serving from API (`@fastify/static`), SPA integration, and full smoke-run verified (`/health`, `/api/docs`, `/jobs` all pass). 46 tests passing.

**Phase 7 Step 1 — Seed Script** (`worktree-phase-07-seed-wiring`): Added TDD-covered seed helpers plus `scripts/seed.ts` wrapper for validated AgentTemplate, Credential, and RepoMapping upserts with encrypted credential secrets.

**Phase 6 — Dashboard Frontend** (`worktree-phase-06-dashboard`): Implemented full React + Vite + TailwindCSS + shadcn/ui dashboard with Overview (mock metrics + Recharts), Jobs list, Job Detail (tabs, timeline, SSE events, approvals), and read-only Config. API client TDD (4 tests passing), build clean, all shadcn/ui UI rules followed.

**Phase 5 — Telegram Bot + Approval Bridge** (`worktree-phase-05-telegram-approval`): Implemented full approval lifecycle — `awaitApproval` Redis helper (TDD), `TelegramService` with inline-keyboard callbacks and idempotent `ApprovalsService.decide` tests (TDD), wired into LangGraph `runAgent` `onPermission`. API: 11 tests passing; Worker: 9 tests passing.

**Phase 4 — Worker Service** (`worktree-phase-04-worker`): Implemented full `@jigit/worker` package — adapter interfaces, JiraAdapter + GitlabAdapter + GitAdapter (all TDD), AcpSession JSON-RPC client with permission bridge (TDD), LangGraph StateGraph with stop-signal conditional edge (TDD), PrismaJobSink, BullMQ worker entrypoint. 7 tests passing, build clean.

**Phase 3 — NestJS API Backend** (`worktree-phase-03-nestjs-api`): Implemented full NestJS API with Fastify adapter — webhook ingestion (Jira), job control, SSE streaming, approvals, config-view endpoints, Swagger UI at `/api/docs`, health check. 9 tests passing (TDD), build clean. Added `unplugin-swc` for Vitest decorator metadata support.

**Phase 2 — Shared Package** (`worktree-phase-02-shared-package`): Implemented all `@jigit/shared` utilities via TDD — AES-256-GCM crypto, Zod config loader, bounded retry, branch-name derivation, BullMQ factory, Redis pub/sub helpers, shared types, and barrel export. 16 tests passing, build clean.


**Phase 1 — Database Design** (`feat/phase-01-database`): Added full Prisma 7 schema (6 models, 3 enums), migration, PrismaPg adapter singleton, smoke tests, and barrel exports in `@jigit/shared`. Adapted plan for Prisma 7's breaking changes (adapter pattern, `prisma.config.ts`).

**Phase 0 — Monorepo Scaffolding** (`feat/phase-00-scaffolding`): Set up pnpm workspace with `@jigit/shared`, `@jigit/api`, `@jigit/worker`, `@jigit/dashboard`. All packages build and typecheck cleanly. Added tsconfig.base.json, .env.example, Vite config for dashboard.
