# Normalize Model Name Pricing

## Task
Update the `PricingService` in `@jagit/api` to normalize model names during cost calculation, allowing it to fall back to a case-insensitive partial match (`contains`) when an exact match isn't found. This prevents calculation failures when the provided model name (e.g. `Kimi-K2.6`) differs slightly from the one stored in the DB (e.g. `azure_ai/kimi-k2.6`).

## Changes
- **`packages/api/src/pricing/pricing.service.ts`**:
  - Modified `calculateCost` to try `findUnique` exact match first.
  - Added fallback to `findFirst` case-insensitive exact match (`equals`, `mode: "insensitive"`).
  - Added final fallback to `findFirst` case-insensitive partial match (`contains`, `mode: "insensitive"`).
- **`packages/api/src/pricing/pricing.service.test.ts`**:
  - Mocked `findFirst` in `makePrisma()`.
  - Added two new unit tests to cover the fallback exact match and contains match logic.

## Verification
- Ran `pnpm --filter @jagit/api test -t "PricingService"`: all 8 tests passed successfully.
