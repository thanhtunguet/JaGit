# Live Sessions Aggregate Charts

**Task**: Add aggregate cost data (by user, by model, by tool) alongside the existing 4 summary cards on the Live Sessions page.

**What Changed**:
- **Backend**: Added a new `aggregate` method in `packages/api/src/agent-sessions/agent-sessions.service.ts` that runs Prisma `groupBy` on `agentSession` by `userId`, `model`, and `tool`. Added `GET /api/agent-sessions/aggregate` endpoint in `packages/api/src/agent-sessions/agent-sessions.controller.ts`.
- **Frontend API**: Added `aggregateAgentSessions` method and `AgentSessionAggregateResponse` type to `packages/dashboard/src/api/client.ts`.
- **Frontend UI**:
  - Created a new `LiveSessionsCharts` component (`packages/dashboard/src/components/sessions/LiveSessionsCharts.tsx`) using Recharts to render the three aggregate pie charts (Cost by User, Cost by Model, Cost by Tool).
  - Updated `LiveSessionsTab` to call `aggregateAgentSessions` when filters change (ignoring the pagination changes) and conditionally render `LiveSessionsCharts` if aggregate data is present.

**Tests Added/Run**:
- Built all packages via `pnpm -r build` (passed).
- Verified TypeScript checks over frontend and backend models.

**Follow-ups**:
- Ensure layout handles small screens nicely.
