# Update Total Token Used Card

## Task
Update the "Total token used card" on the dashboard Overview page to be a calculated summary from both live sessions and historical CodeBurn data.

## Changes
- **Backend**: Updated `packages/api/src/stats/stats.service.ts` inside `StatsService.getOverview` to sum:
  - Total tokens from `agentSession.aggregate` (live sessions).
  - Total tokens from `usageUpload.findMany` (historical CodeBurn data). Deduplicated historical tokens by `Date` to ensure periods like "7 Days" and "30 Days" don't double count.
- **Frontend**: Updated `packages/dashboard/src/pages/Overview.tsx` to display `"Live sessions & historical"` as the description for the Total Tokens Used card.
- **Tests**: Mocked `agentSession.aggregate` and `usageUpload.findMany` in `packages/api/src/stats/stats.service.test.ts` to ensure the overview endpoint still passes unit tests with the new sources.

## Follow-ups
None. Tests pass successfully.
