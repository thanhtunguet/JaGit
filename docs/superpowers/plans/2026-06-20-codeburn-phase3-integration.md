# CodeBurn Consolidation — Phase 3: Integration, Build, and Documentation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run full integration tests, verify builds, update documentation, and record the session.

**Architecture:** End-to-end validation that backend and frontend work together. No new code — only verification, fixes, and docs.

**Tech Stack:** pnpm workspaces, Vitest, TypeScript, Prisma, Docker Compose

---

## Task 1: Integration, Build, and Documentation

**Goal:** Verify everything works together, fix any issues, and document the session.

**Files:**
- Modify: `CHANGELOG.md`
- Create: `docs/changelogs/2026-06-20-codeburn-consolidation.md`
- Modify: `docs/superpowers/plans/2026-06-14-jigit-mvp.md` (update progress if applicable)

**Acceptance Criteria:**
- [ ] `pnpm -r build` succeeds for all packages
- [ ] `pnpm -r test` passes for all packages
- [ ] Prisma migration applies cleanly to a fresh database
- [ ] CHANGELOG.md updated with session summary
- [ ] Per-session changelog written with details
- [ ] Plan progress updated in CLAUDE.md

**Verify:** `pnpm -r build && pnpm -r test` → all pass

**Steps:**

- [ ] **Step 1: Run full build**

```bash
pnpm -r build
```

Expected: Success for all packages (shared, api, dashboard, worker).

If errors:
- Fix TypeScript errors in any new files
- Ensure all imports use `.js` extensions (JiGit convention for ESM)
- Check that `packages/api/src/usage/types.ts` is properly exported

- [ ] **Step 2: Run full test suite**

```bash
pnpm -r test
```

Expected: All tests pass.

If failures:
- Check for mock Prisma issues in controller tests
- Verify `AuthGuard` is properly mocked in controller tests
- Check for missing `await` in async tests

- [ ] **Step 3: Verify Prisma migration**

```bash
cd packages/shared
pnpm prisma migrate deploy
```

Expected: Migration applies cleanly (test against a fresh Postgres instance if possible, or verify the migration SQL is correct).

Migration SQL should be at:
`packages/shared/prisma/migrations/20260620_add_usage_models/migration.sql`

Contents should be:
```sql
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "UsageUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "UsageUpload_userId_uploadedAt_idx" ON "UsageUpload"("userId", "uploadedAt");

-- AddForeignKey
ALTER TABLE "UsageUpload" ADD CONSTRAINT "UsageUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Update CHANGELOG.md**

Append to top of `CHANGELOG.md`:

```markdown
## 2026-06-20

- **CodeBurn Consolidation**: Merged CodeBurn AI usage analytics into JiGit.
  - New backend: `UsageModule` with ZIP upload, CSV parsing, JSONB storage
  - New dashboard: `/usage` page with period toggle, user selector, charts, and tables
  - New Overview widget: AI Usage summary with top users and mini chart
  - New Prisma models: `User` and `UsageUpload`
```

- [ ] **Step 5: Write per-session changelog**

Create `docs/changelogs/2026-06-20-codeburn-consolidation.md`:

```markdown
# Session: CodeBurn Consolidation into JiGit

**Date:** 2026-06-20
**Task:** Merge CodeBurn AI usage analytics dashboard into JiGit as a first-class feature

## What Changed

### Backend (`packages/api`)
- Created `UsageModule` with controller, service, and types
- Endpoints: `POST /api/usage/upload`, `GET /api/usage/users`, `GET /api/usage/users/:username/latest`, `DELETE /api/usage/users/:username`
- ZIP extraction via `adm-zip`, CSV parsing via `papaparse`, validation via Zod
- JSONB storage in new `UsageUpload` table linked to `User` table
- AuthGuard on mutation endpoints (upload, delete)
- Full test coverage: controller and service tests

### Database (`packages/shared`)
- Added `User` model: `id` (CUID), `username` (unique), `createdAt`, `uploads` relation
- Added `UsageUpload` model: `id` (CUID), `userId` (FK), `uploadedAt`, `period`, `data` (JSONB)
- Cascade delete from User to UsageUpload
- Generated migration: `20260620_add_usage_models`

### Dashboard (`packages/dashboard`)
- New `/usage` page with full CodeBurn analytics UI
- Components: `SummaryCards`, `DailyChart`, `ActivityChart`, `ModelsChart`, `ProjectsChart`, `SessionsTable`, `ToolsChart`, `ShellCommandsChart`
- `UserSelector` pill buttons and `PeriodToggle` (Today/7 Days/30 Days)
- `useUsageData` hook fetches from API and filters by period
- URL sync: `?u=username` for deep-linking, `popstate` support
- Overview widget: top 3 users + mini daily chart + link to `/usage`
- New nav item: "Usage" with `BarChart3` icon

### Tests
- Backend: `usage.controller.test.ts`, `usage.service.test.ts`
- Frontend: `Usage.test.tsx`, `SummaryCards.test.tsx`, `useUsageData.test.ts`, `client.test.ts` additions
- All tests passing

## Files Created
- `packages/api/src/usage/usage.module.ts`
- `packages/api/src/usage/usage.controller.ts`
- `packages/api/src/usage/usage.service.ts`
- `packages/api/src/usage/types.ts`
- `packages/api/src/usage/usage.controller.test.ts`
- `packages/api/src/usage/usage.service.test.ts`
- `packages/dashboard/src/pages/Usage.tsx`
- `packages/dashboard/src/pages/Usage.test.tsx`
- `packages/dashboard/src/hooks/useUsageData.ts`
- `packages/dashboard/src/hooks/useUsageData.test.ts`
- `packages/dashboard/src/components/usage/SummaryCards.tsx`
- `packages/dashboard/src/components/usage/SummaryCards.test.tsx`
- `packages/dashboard/src/components/usage/DailyChart.tsx`
- `packages/dashboard/src/components/usage/ActivityChart.tsx`
- `packages/dashboard/src/components/usage/ModelsChart.tsx`
- `packages/dashboard/src/components/usage/ProjectsChart.tsx`
- `packages/dashboard/src/components/usage/SessionsTable.tsx`
- `packages/dashboard/src/components/usage/ToolsChart.tsx`
- `packages/dashboard/src/components/usage/ShellCommandsChart.tsx`
- `packages/dashboard/src/components/usage/UserSelector.tsx`
- `packages/dashboard/src/components/usage/PeriodToggle.tsx`
- `packages/shared/prisma/migrations/20260620_add_usage_models/migration.sql`
- `docs/changelogs/2026-06-20-codeburn-consolidation.md`

## Files Modified
- `packages/shared/prisma/schema.prisma`
- `packages/api/src/app.module.ts`
- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/components/layout/AppShell.tsx`
- `packages/dashboard/src/api/client.ts`
- `packages/dashboard/src/api/client.test.ts`
- `packages/dashboard/src/pages/Overview.tsx`
- `CHANGELOG.md`

## Dependencies Added
- `papaparse` (API)
- `adm-zip` (API)
- `zod` (API — may already be present via shared)
- `@types/papaparse` (API dev)

## Verification
- `pnpm -r build`: ✅
- `pnpm -r test`: ✅
- `prisma migrate deploy`: ✅

## Follow-ups
- Update `codeburn` CLI to point to new `/api/usage/upload` endpoint
- Add data retention / cleanup policy (out of scope for MVP)
- Consider adding SSE for real-time usage updates (low priority)
- Add export functionality (CSV download from dashboard)
```

- [ ] **Step 6: Update CLAUDE.md plan progress**

Update the "Current plan progress" section in `CLAUDE.md`:

```markdown
### Current plan progress

- **Active plan:** CodeBurn Consolidation into JiGit (completed)
- **Last completed:** Merged CodeBurn AI usage analytics into JiGit. New `User` and `UsageUpload` Prisma models, `UsageModule` backend with ZIP/CSV parsing, `/usage` dashboard page with all charts/tables, Overview widget. All tests passing, build clean.
- **In progress:** _n/a_
- **Next up:** Update `codeburn` CLI to use new `/api/usage/upload` endpoint; add data retention policy; E2E test with real ZIP upload
```

- [ ] **Step 7: Commit documentation**

```bash
git add CHANGELOG.md docs/changelogs/2026-06-20-codeburn-consolidation.md CLAUDE.md
git commit -m "docs: update CHANGELOG and session log for CodeBurn consolidation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3 Completion Checklist

- [ ] Full build succeeds (`pnpm -r build`)
- [ ] All tests pass (`pnpm -r test`)
- [ ] Prisma migration verified
- [ ] CHANGELOG.md updated
- [ ] Per-session changelog written
- [ ] CLAUDE.md plan progress updated
- [ ] All changes committed

## Post-Implementation Notes

### Known Limitations (by design)
- No real-time updates (SSE) for usage data — polling is sufficient
- No automatic data retention / cleanup
- No team-wide aggregation beyond top-3 widget
- No export functionality
- No user authentication beyond simple username

### Future Enhancements (out of scope)
- Update `codeburn` CLI to point to new endpoint
- Add data retention policy (e.g., keep only last N uploads per user)
- Add team-wide cost aggregation and comparisons
- Add CSV export from dashboard
- Integrate usage data with Job model (track which jobs consumed tokens)
