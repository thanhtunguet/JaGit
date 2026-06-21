# Add Tokens Breakdown Pie Chart

Added a fourth pie chart to the Live Sessions page to display the breakdown of Cached Input vs New Input vs Output tokens across the current filter.

- Modified `packages/api/src/agent-sessions/agent-sessions.service.ts` to add a new token aggregation query inside the `aggregate()` function. It now calculates sums for `inputTokens`, `cachedInputTokens`, `cacheCreationInputTokens`, and `outputTokens`, returning them grouped as `totalTokens.newInput`, `totalTokens.cachedInput`, and `totalTokens.output`.
- Updated the `AgentSessionAggregateResponse` interface in `packages/dashboard/src/api/client.ts` to reflect the new `totalTokens` return value.
- Modified `packages/dashboard/src/components/sessions/LiveSessionsCharts.tsx` to include the fourth pie chart, mapped it from `totalTokens`, and updated the grid layout from 3 columns to `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` to fit all four charts nicely.
- Both `@jagit/api` and `dashboard` were successfully built without any errors.

- Added `label` prop to all `Pie` components to display slice names with leader lines.

- Replaced text labels with color blocks to avoid cutoff while preserving leader lines.
