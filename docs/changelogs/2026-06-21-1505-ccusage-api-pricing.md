# ccusage API Pricing Integration

## Task
Query the newly added `ccusage` package to understand how it fetches API pricing, implement a service to fetch this periodically, and update the agent session endpoint to calculate costs using this data when absent.

## Changes
- **Database Schema**: Appended `ModelPricing` table to `@jagit/shared`'s `schema.prisma`.
- **Packages**: Installed `@nestjs/schedule` in `@jagit/api` for periodic polling. Disabled `packages/ccusage` submodule from root `pnpm-workspace.yaml` to fix internal catalog issues.
- **Backend API**:
  - `packages/api/src/pricing/pricing.service.ts`: Implemented `fetchAndSavePricing` to parse LiteLLM's JSON and sync costs. Created `calculateCost` with caching rules. Added cron task to run daily.
  - `packages/api/src/agent-sessions/agent-sessions.service.ts`: Updated `upsert` to fallback to `pricingService.calculateCost(...)` when `costUsd` is null or undefined.
- **Tests**: Added tests for `PricingService` and `AgentSessionService` to verify the cost calculation fallback. `pnpm -r test` confirms passing tests.

## Follow-ups
- Run `npx prisma migrate deploy` locally and on deploy environments to create the `ModelPricing` table.
