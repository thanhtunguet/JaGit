# Add Cached Percentage to Session Summary

Updated the `SessionSummaryCards` component in `@jigit/dashboard` to display the percentage of input tokens that were read from the cache. 

- Modified `packages/dashboard/src/components/sessions/SessionSummaryCards.tsx`.
- The "Input tokens" card now sums `inputTokens`, `cachedInputTokens`, and `cacheCreationInputTokens`.
- It dynamically updates the label to show `Input tokens (Cached X%)` if the cache percentage is greater than 0.
- Re-built `@jigit/dashboard` and confirmed it compiles without errors.
