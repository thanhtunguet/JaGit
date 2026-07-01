# Dashboard V2 Job Detail Tabs Implementation

## Task
Add missing tabs to Job Detail page (`jobs_.$id.tsx`):
- Events
- Console
- Raw logs for each step

## What Changed
- **`packages/dashboard-v2/src/routes/jobs_.$id.tsx`**: Added Radix UI `<Tabs>` navigation to the main content area of the job detail view with three tabs:
  - **Events**: Displays the full live event stream (`mergedEvents`) with timestamps, level coloring, step/type labels, and JSON payload inspection.
  - **Console**: Displays live agent output, approval requests, agent completion, and errors in a dark terminal-themed window with an auto-scroll toggle.
  - **Raw Logs**: Displays an interactive accordion list of all job execution steps (`job.steps`) showing step names, status badges, execution times, and expandable JSON blocks for inspecting raw step telemetry (`step.detail`). Includes a full job raw JSON inspector.

## Verification
- Ran `pnpm --filter @jagit/dashboard-v2 test` — 42/42 tests passing.
- Ran `pnpm --filter @jagit/dashboard-v2 build` — clean Nitro SSR server and client bundle compilation.
