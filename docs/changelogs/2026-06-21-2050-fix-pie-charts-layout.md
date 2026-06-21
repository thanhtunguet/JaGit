# Fix Pie Charts Layout

## Task
Fix an issue where pie charts on the dashboard had overlapping legends when there were 10 items, and pie charts in different cards were not horizontally aligned because they were centered within their available vertical space rather than a fixed area.

## Changes
- `packages/dashboard/src/components/sessions/LiveSessionsCharts.tsx`: 
  - Extracted the Recharts `<Legend>` completely out of the `<PieChart>`'s `<ResponsiveContainer>`.
  - Refactored chart items into a new helper component `ChartCard`.
  - Modified the structure of the chart cards to use flex layouts (`flex-col`, `grow`, `shrink`).
  - The pie chart itself is now placed in a fixed `shrink` container with a height of `200px`, guaranteeing that all charts align correctly horizontally across different cards.
  - The legend is placed in a `grow` flex item below the chart, allowing it to stretch and take up as much space as needed without overlapping the chart SVG.

## Tests Added/Run
- Verified the build via `pnpm -r build` (Dashboard build succeeded).

## Follow-ups
None.
