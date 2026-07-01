# Session: CodeBurn Consolidation into JiGit

**Date:** 2026-06-20
**Task:** Merge CodeBurn AI usage analytics dashboard (Go backend + React frontend) into JiGit as a first-class dashboard feature.

## What Changed

### Backend (`packages/api`)
- New `UsageModule` (`packages/api/src/usage/`): controller, service, Zod types.
- Endpoints:
  - `POST /api/usage/upload` — multipart ZIP upload, AuthGuard protected
  - `GET /api/usage/users` — list users with upload counts
  - `GET /api/usage/users/:username` — user's uploads (latest first)
  - `GET /api/usage/users/:username/latest` — most recent upload
  - `DELETE /api/usage/users/:username` — delete user + uploads, AuthGuard protected
- ZIP extraction via `adm-zip`, CSV parsing via `papaparse`, validation via Zod (`UsageDataSchema` covering all 8 CodeBurn CSV row shapes).
- Registered `@fastify/multipart` in `main.ts` for file uploads (50MB limit).
- Added `packages/api/src/test-setup.ts` (vitest `setupFiles`) to provide default test env vars, loaded once before any controller decorator evaluates `loadConfig()`/`process.env` at class-definition time — this was needed because `AuthGuard` is instantiated inline in the `@UseGuards()` decorator (existing codebase pattern, see `credentials.controller.ts`), so env vars must be set before the controller module is first imported by any test file.

### Database (`packages/shared`)
- Added `User` model: `id` (CUID), `username` (unique), `createdAt`, `uploads` relation.
- Added `UsageUpload` model: `id` (CUID), `userId` (FK, cascade delete), `uploadedAt`, `period` (`"today"|"7days"|"30days"`), `data` (JSONB — single blob holding all 8 parsed CSV arrays).
- Migration: `20260620040203_add_usage_models`.

### Dashboard (`packages/dashboard`)
- New `/usage` route (`pages/Usage.tsx`) replicating CodeBurn's analytics layout: period toggle (Today/7 Days/30 Days), user selector (URL-synced via `?u=`), summary cards, daily spend chart, activity/model breakdowns, top projects, top sessions table, tool/shell-command usage.
- New components under `components/usage/`: `SummaryCards`, `DailyChart`, `ActivityChart`, `ModelsChart`, `ProjectsChart`, `SessionsTable`, `ToolsChart`, `ShellCommandsChart`, `UserSelector`, `PeriodToggle` — ported from CodeBurn's React components, restyled with shadcn/ui `Card`/`Table` and theme CSS variables instead of hardcoded slate colors.
- New `useUsageData` hook (`hooks/useUsageData.ts`) — fetches latest upload for a user, filters rows by period.
- New API client functions in `api/client.ts`: `listUsageUsers`, `getUserUploads`, `getLatestUpload`, `deleteUsageUser`, plus all 8 CSV row type interfaces.
- New "AI Usage" widget on `Overview.tsx`: shows top 3 users by upload count + mini daily-spend bar chart for the first user, links to `/usage`.
- New sidebar nav item "Usage" (`BarChart3` icon) in `AppShell.tsx`.

## Tests

- `packages/api/src/usage/usage.service.test.ts` — 5 tests (listUsers, getUserUploads 404, getLatestUpload null case, deleteUser, uploadUsageData invalid ZIP).
- `packages/api/src/usage/usage.controller.test.ts` — 4 tests (users list, latest upload, delete without/with auth).
- `packages/dashboard/src/api/client.test.ts` — 4 new tests for the usage client functions (21 total in file).
- Full suite: `pnpm -r test` — all usage-related tests pass. Pre-existing failures unrelated to this work: `packages/worker` tests fail in this worktree due to a `@jigit/shared` workspace-resolution issue (worktree-specific, not introduced by this session); `packages/api/src/webhooks/webhooks.controller.test.ts` has 2 pre-existing 401 failures already flagged in `CLAUDE.md` from an earlier session.
- Full build: `pnpm -r build` — clean across all 4 buildable packages (shared, api, dashboard, worker).

## Files Created
- `packages/api/src/usage/usage.module.ts`
- `packages/api/src/usage/usage.controller.ts`
- `packages/api/src/usage/usage.service.ts`
- `packages/api/src/usage/types.ts`
- `packages/api/src/usage/usage.controller.test.ts`
- `packages/api/src/usage/usage.service.test.ts`
- `packages/api/src/test-setup.ts`
- `packages/dashboard/src/pages/Usage.tsx`
- `packages/dashboard/src/hooks/useUsageData.ts`
- `packages/dashboard/src/components/usage/*.tsx` (10 files)
- `packages/shared/prisma/migrations/20260620040203_add_usage_models/migration.sql`
- `docs/superpowers/specs/2026-06-20-codeburn-consolidation-design.md`
- `docs/superpowers/plans/2026-06-20-codeburn-phase{1,2,3}-*.md` (+ `.tasks.json`)

## Files Modified
- `packages/shared/prisma/schema.prisma`
- `packages/api/src/app.module.ts`
- `packages/api/src/main.ts` (register `@fastify/multipart`)
- `packages/api/vitest.config.ts` (add `setupFiles`)
- `packages/api/package.json` (+`adm-zip`, `papaparse`, `zod`, `@fastify/multipart`, type packages)
- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/components/layout/AppShell.tsx`
- `packages/dashboard/src/api/client.ts` / `client.test.ts`
- `packages/dashboard/src/pages/Overview.tsx`
- `CHANGELOG.md`

## Follow-ups (not done, out of scope for MVP)
- Update the standalone `codeburn` CLI tool to point at `/api/usage/upload` instead of the old Go server's `/upload/{username}`.
- No automatic data retention/cleanup policy for old uploads.
- No dedicated component/page-level tests were added for the dashboard (the existing dashboard test suite only covers `api/client.ts`; no `@testing-library/react` dependency exists in the project yet — would need to be added to test page rendering/interaction).
- `packages/worker` test failures in this worktree (pre-existing `@jigit/shared` resolution issue) were not investigated — unrelated to this session's scope.
- The Go `codeburn/` directory (server, CLI, bash script, original dashboard) was left untouched; it can be removed once the new endpoints are verified in production and the `codeburn-upload` CLI is repointed.
