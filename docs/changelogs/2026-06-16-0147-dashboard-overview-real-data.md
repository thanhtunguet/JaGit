# Dashboard Overview — real data

## Task
Replace mock data on the Overview page with live metrics from Postgres.

## Changes
- **API** (`packages/api/src/stats/`): new `GET /api/stats/overview` endpoint aggregating:
  - Active jobs (non-terminal statuses)
  - Done today / yesterday (for delta description)
  - Pending approval count
  - Average job cost (last 7 days, done jobs)
  - Throughput chart (done jobs per UTC day, last 7 days)
  - Status distribution (`groupBy` on job status)
  - Recent activity (latest 15 `JobEvent` rows with issue key)
- **Dashboard** (`packages/dashboard/src/pages/Overview.tsx`): fetch via `getOverviewStats()`, loading skeletons, empty states.
- **Client** (`packages/dashboard/src/api/client.ts`): `OverviewStats` type + `getOverviewStats()`.

## Tests
- `packages/api/src/stats/stats.service.test.ts` — bucket logic + aggregation (2 tests, passing)
- `packages/dashboard/src/api/client.test.ts` — `getOverviewStats` URL (12 tests total, passing)
- Build: `@jigit/api` + `@jigit/dashboard` clean

## Follow-ups
- Optional auto-refresh or SSE for live overview updates
- Timezone-aware "today" if operators are not in UTC
