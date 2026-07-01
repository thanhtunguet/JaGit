# Format Tokens Overview

## Task
Apply the same `k, M, B` token formatting rule used in the Live Sessions summary cards to the Overview page widgets, and consolidate the behavior into a single shared helper method.

## Changes
- **Refactoring**: Extracted `formatTokens` function from `packages/dashboard/src/components/sessions/SessionSummaryCards.tsx` into a shared utility at `packages/dashboard/src/lib/utils.ts`.
- **SessionSummaryCards**: Removed local `formatTokens` implementation and imported it from `@/lib/utils`.
- **Overview**: 
  - Replaced the local `formatTokenCount` (which only did `.toLocaleString()`) with the shared `formatTokens` utility.
  - Applied `formatTokens` to the "Total Tokens Used" `StatCard` value.
  - Applied `formatTokens` to the "Live tokens (7d)" counter in the AI Usage widget.
- **Testing**: Dashboard built successfully.
