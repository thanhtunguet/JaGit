# Daily Spend Chart Modes (2026-06-21)

## Summary
Added a toggle button group to the "Daily Spend" chart to allow switching between Individual and Cumulative modes.

## Changes Made
- Modified `DailyChart.tsx` to include internal state for `mode` (`"individual"` vs `"cumulative"`).
- Added a two-button toggle group to the top right of the chart header using shadcn/ui style classes.
- Updated the data mapping logic to calculate a running total when the cumulative mode is selected.

## Testing
- Verified `@jagit/dashboard` compiles without errors using `pnpm --filter @jagit/dashboard typecheck`.
