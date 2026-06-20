# CodeBurn → JiGit Consolidation Design Spec

**Date:** 2026-06-20
**Status:** Approved
**Approach:** B — Generic JSONB Storage

---

## 1. Goal

Merge the CodeBurn AI usage analytics dashboard into JiGit as a first-class feature. Port the Go backend endpoints into JiGit's NestJS/Fastify API, store usage data in Postgres (JSONB), and add a `/usage` dashboard page plus an Overview widget.

## 2. Data Model

### New Prisma Models

```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  createdAt DateTime @default(now())
  uploads   UsageUpload[]
}

model UsageUpload {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  uploadedAt DateTime @default(now())
  period     String   // "today", "7days", "30days"
  data       Json     // structured JSON containing all parsed CSV data
}
```

### JSONB Data Structure

The `data` field stores all parsed CSV data in a single structured JSON object:

```typescript
{
  summary: SummaryRow[],      // { Period, Cost, Saved, API Calls, Sessions, Projects }
  daily: DailyRow[],          // { Period, Date, Cost, InputTokens, OutputTokens, CacheReadTokens, CacheWriteTokens }
  activity: ActivityRow[],    // { Period, Activity, Cost, Share, Turns }
  models: ModelRow[],         // { Period, Model, Cost, Saved, Share, API Calls, EditTurns, OneShotRate, RetriesPerEdit, CostPerEdit, InputTokens, OutputTokens, CacheTokens }
  projects: ProjectRow[],      // { Project, Cost, Saved, AvgPerSession, Share, API Calls, Sessions }
  sessions: SessionRow[],     // { Project, SessionId, StartedAt, Cost, Saved, API Calls, Turns }
  tools: ToolRow[],           // { Tool, Calls, Share }
  shellCommands: ShellCommandRow[]  // { Command, Calls, Share }
}
```

### Rationale
- Single `UsageUpload` table avoids schema proliferation (7-8 tables for each CSV type)
- `period` is stored at upload level since all CSVs in a ZIP share the same period context
- JSONB enables flexible querying with Postgres operators; no schema changes needed for new CSV types
- `User` model is minimal (username + createdAt) with cascade delete for cleanup

## 3. API Endpoints

New `UsageModule` in `packages/api`:

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `POST /api/usage/upload` | POST | AuthGuard | Accept multipart ZIP, extract CSVs, parse, store in UsageUpload |
| `GET /api/usage/users` | GET | None | List all users who have uploaded data |
| `GET /api/usage/users/:username` | GET | None | Get a specific user's uploads (latest first) |
| `GET /api/usage/users/:username/latest` | GET | None | Get most recent upload data for a user |
| `DELETE /api/usage/users/:username` | DELETE | AuthGuard | Delete user and all uploads |

### Upload Flow
1. Receive multipart ZIP (max 50MB)
2. Extract allowed CSV files in-memory: `summary.csv`, `daily.csv`, `activity.csv`, `models.csv`, `projects.csv`, `sessions.csv`, `tools.csv`, `shell-commands.csv`
3. Parse each CSV with `papaparse` into typed arrays
4. Zod validate row shapes
5. Prisma: upsert User by username, create UsageUpload with parsed JSONB data
6. Return `{ userId, uploadId, uploadedAt, filesProcessed: string[] }`

### Error Responses
- Invalid ZIP → 400 `{ error: "Invalid ZIP file" }`
- Missing required CSV → 400 `{ error: "Missing required CSV: summary.csv" }`
- CSV parse error → 400 `{ error: "Failed to parse daily.csv: <details>" }`
- File too large → 413 (Fastify body limit)

## 4. Dashboard

### New Route: `/usage`
- Sidebar nav item: "Usage" (bar-chart icon)
- Full page replicating CodeBurn's analytics layout:
  - **Period Toggle** — Today / 7 Days / 30 Days (filters which upload to show)
  - **User Selector** — pills for each user, synced to URL `?u=username`
  - **Summary Cards** — Total Cost, API Calls, Projects, Avg/Session
  - **Daily Chart** — bar chart of daily spend
  - **Activity + Models** — side-by-side horizontal bar charts
  - **Projects** — top 10 projects by cost
  - **Top Sessions** — table of top 20 sessions
  - **Tools + Shell Commands** — side-by-side horizontal bar charts

### Overview Page Widget
- New section below existing stats cards: "AI Usage"
- Shows: top 3 users by total cost (last 30 days), mini bar chart of daily spend for current user, link to `/usage`
- Fetches from `GET /api/usage/users` + `GET /api/usage/users/:username/latest`

### Component Strategy
- Port CodeBurn components from `codeburn/dashboard/src/components/` → `packages/dashboard/src/components/usage/`
- Adapt data fetching: replace `useCSVData.ts` with API client calls to JiGit endpoints
- Keep visual design consistent with CodeBurn's dark slate theme (matches JiGit's existing dark mode)
- Reuse Recharts components (already a dependency)

### URL Sync
- `/usage?u=username` for deep-linking
- `popstate` listener for back/forward button support

## 5. Data Flow & Error Handling

```
codeburn CLI → POST /api/usage/upload (multipart ZIP)
    → NestJS FileInterceptor / Fastify multipart
    → Extract ZIP in-memory (adm-zip)
    → Validate: only allowed CSV filenames
    → Parse each CSV with papaparse
    → Zod validate row shapes
    → Prisma: upsert User, create UsageUpload
    → Return 200 with metadata
```

### Period Handling
- ZIP CSVs contain a `Period` column (Today, 7 Days, 30 Days)
- `period` stored on `UsageUpload` record
- Dashboard Period Toggle filters which upload to fetch (latest matching period)
- Empty state shown if no upload exists for selected period

### Data Retention
- No automatic cleanup in MVP
- Admin DELETE endpoint removes user + all uploads

## 6. Testing Strategy

### Backend Tests (`packages/api`)
- `usage.controller.test.ts` — All endpoint tests (upload, users list, latest, delete)
- `usage.service.test.ts` — Business logic (ZIP extraction, CSV parsing, Zod validation, user upsert)

### Frontend Tests (`packages/dashboard`)
- `UsagePage.test.tsx` — Page rendering, user selection, period toggle
- `useUsageData.test.ts` — API client hooks (mock fetch)
- Component tests — SummaryCards, DailyChart, UserSelector

### Shared Tests
- Prisma schema validation — migrations apply cleanly

## 7. Files to Create/Modify

### New Files
- `packages/api/src/usage/usage.module.ts`
- `packages/api/src/usage/usage.controller.ts`
- `packages/api/src/usage/usage.service.ts`
- `packages/api/src/usage/usage.controller.test.ts`
- `packages/api/src/usage/usage.service.test.ts`
- `packages/api/src/usage/types.ts` (Zod schemas for CSV rows)
- `packages/dashboard/src/pages/Usage.tsx`
- `packages/dashboard/src/components/usage/SummaryCards.tsx`
- `packages/dashboard/src/components/usage/DailyChart.tsx`
- `packages/dashboard/src/components/usage/ActivityChart.tsx`
- `packages/dashboard/src/components/usage/ModelsChart.tsx`
- `packages/dashboard/src/components/usage/ProjectsChart.tsx`
- `packages/dashboard/src/components/usage/SessionsTable.tsx`
- `packages/dashboard/src/components/usage/ToolsChart.tsx`
- `packages/dashboard/src/components/usage/ShellCommandsChart.tsx`
- `packages/dashboard/src/components/usage/UserSelector.tsx`
- `packages/dashboard/src/components/usage/PeriodToggle.tsx`
- `packages/dashboard/src/hooks/useUsageData.ts`
- `packages/shared/prisma/migrations/20260620_add_usage_models/migration.sql`

### Modified Files
- `packages/shared/prisma/schema.prisma` — add User and UsageUpload models
- `packages/api/src/app.module.ts` — import UsageModule
- `packages/dashboard/src/App.tsx` — add `/usage` route
- `packages/dashboard/src/components/layout/AppShell.tsx` — add Usage nav item
- `packages/dashboard/src/api/client.ts` — add usage API functions
- `packages/dashboard/src/pages/Overview.tsx` — add AI Usage widget

## 8. Out of Scope (YAGNI)

- Real-time updates (SSE) for usage data — polling is sufficient
- Automatic data retention / cleanup policies
- Team-wide aggregation beyond top-3 widget
- Export functionality (CSV download from dashboard)
- User authentication / roles beyond simple username
- Integration with JiGit's Job model (tying usage to specific jobs)

## 9. Dependencies

### New API Dependencies
- `papaparse` — CSV parsing
- `adm-zip` — ZIP extraction
- `@types/papaparse` — TypeScript types

### New Dashboard Dependencies
- None (Recharts already present)

## 10. Migration Plan

1. Add Prisma models, generate migration
2. Implement backend (module → service → controller → tests)
3. Wire into AppModule
4. Port dashboard components (types → hooks → components → page)
5. Add route and nav item
6. Add Overview widget
7. Run full test suite (`pnpm -r test`)
8. Run build (`pnpm -r build`)
9. Update CHANGELOG and session log
