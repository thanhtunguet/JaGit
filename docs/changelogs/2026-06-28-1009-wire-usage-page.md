# Wire Usage Page in Dashboard V2

**Date:** 2026-06-28  
**Task:** Wire the Usage page (`usage.tsx`) in `dashboard-v2` supporting both Live Sessions and Historical CodeBurn tabs.

## Summary of Changes

1. **New API Hook (`useAgentSession`)**:
   - Added `useAgentSession(id)` hook to `packages/dashboard-v2/src/hooks/use-api.ts` to allow inspecting full single-session details and raw JSON payload on demand.

2. **Replaced Mock Usage Data with Live API Queries (`usage.tsx`)**:
   - Removed static imports (`AI_SESSIONS`, `USAGE_MODELS`, `USAGE_TOOLS`, `USAGE_USERS`) from `jigit-data.ts`.
   - **Live Sessions Tab**:
     - Connected to `useAgentSessions` and `useAgentSessionAggregate` hooks with reactive filtering by user, AI tool, and search string.
     - Replaced hardcoded KPI counters with live token, Base Token (BT), and cost aggregates.
     - Built dynamic Recharts pie cards for spend breakdown by user, model, and tool.
     - Added an interactive session inspection modal (`SessionDetailModal`) showing full execution metadata (duration, tokens, Jira ticket ID, initial commit SHA, lines changed, and raw payload viewer).
   - **Historical CodeBurn Tab**:
     - Connected to `useUsageUsers` and `useUsageData` to render historical analytics uploaded from the CodeBurn CLI.
     - Added a user selector dropdown and period toggle buttons (`Today`, `7 Days`, `30 Days`).
     - Wired Recharts daily spend charts and structured breakdown tables for models, activities, projects, and most-used tools.
     - Added empty state instructional cards for environments without previous CodeBurn uploads.

## Verification & Tests

- `pnpm --filter @jagit/dashboard-v2 test`: 33/33 passing.
- `pnpm -r test`: 147/147 passing across all monorepo packages.
