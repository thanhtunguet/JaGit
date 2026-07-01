# Historical Codeburn Overview Mode

**Date:** 2026-06-28
**Task:** Add an Overview page for the Historical Codeburn tab matching the old dashboard functionality.

## Summary of Changes

1. **New `useHistoricalOverview` Hook (`packages/dashboard-v2/src/hooks/use-api.ts`)**
   - Added a query hook that concurrently fetches the latest CodeBurn usage uploads for all registered usage users (`getLatestUpload`).
   - Aggregates metrics across all users for the selected period (`30 Days`, `7 Days`, `Today`).
   - Computes total spend, estimated savings, total sessions, API calls, and project counts.
   - Builds aggregate daily spend area chart breakdown (`daily`) and pie chart groupings (`byUser`, `byModel`, `byTool`).

2. **Overview Mode Support (`packages/dashboard-v2/src/routes/usage.tsx`)**
   - Updated `HistoricalCodeBurnView` state so `selectedUser` initializes to `"overview"` by default.
   - Added an `"All Users (Overview)"` option at the top of the user selector dropdown.
   - Added robust fallback logic when user counts (`_count?.uploads`) or individual upload records are missing.
   - Rendered aggregate KPIs, aggregate Daily Spend area chart, and User/Model/Tool pie breakdowns when in Overview mode.

## Test Verification

- Ran `pnpm --filter @jagit/dashboard-v2 test`: 40/40 passing.
