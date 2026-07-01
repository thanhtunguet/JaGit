# Fix Live Sessions Date Filter Bounds

- Modified the backend `AgentSessionService` to properly handle date filtering. When `filters.to` is provided as a date string without a time, the service now appends `T23:59:59.999Z` to ensure that sessions occurring anytime during the end date are included in the results. Similarly, `filters.from` defaults to `T00:00:00.000Z`.

## Files Touched
- `packages/api/src/agent-sessions/agent-sessions.service.ts`
