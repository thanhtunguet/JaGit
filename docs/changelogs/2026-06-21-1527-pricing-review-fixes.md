# Pricing Review Fixes

## Task
Verify a set of issues flagged by an external review of the ccusage API pricing work (`docs/changelogs/2026-06-21-1505-ccusage-api-pricing.md`) and fix the confirmed ones.

## Findings

1. **"Double-counting input tokens" — false positive.** The review claimed `inputTokens` already includes cached tokens, so adding `cachedInputTokens * cacheReadCost` on top double-charges. Verified against `hook-claude-code`'s transcript parsing and the `ccusage` Rust reference (`TokenUsageRaw`/`UsageTotals` in `rust/crates/ccusage/src/types.rs`, `cost.rs`): Anthropic's `usage.input_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` are separate, additive counters — not a superset relationship. No fix needed.
2. **Cache read vs. cache creation conflated — confirmed real.** `hook-claude-code` summed `cache_read_input_tokens + cache_creation_input_tokens` into one `cachedInputTokens` field, then `pricing.service.ts` priced the whole pool at the (cheap) cache-read rate. ccusage's own fallback rates differ by ~12x (`cache_read ≈ input * 0.1` vs `cache_creation ≈ input * 1.25`), so cache-write-heavy sessions were undercosted. **Fixed** by splitting into two fields end-to-end.
3. **Missing `fetch` timeout — confirmed real.** `PricingService.fetchAndSavePricing` had no timeout on the LiteLLM fetch; a hung request could block `onModuleInit`/the daily cron indefinitely. **Fixed** with `AbortSignal.timeout(10_000)`.
4. **Sequential DB upserts for ~300+ models — confirmed real.** Upserts ran serially in a `for` loop. **Fixed** with `Promise.all`.

## Changes
- **Schema** (`packages/shared/prisma/schema.prisma`): added `AgentSession.cacheCreationInputTokens Int @default(0)`. New migration `20260621082352_add_cache_creation_input_tokens` (also applies the previously-pending `ModelPricing` table + all earlier unapplied migrations — confirmed via `prisma migrate status` that nothing had been deployed to the local dev DB yet).
- **`packages/agent-reporter/src/schema.ts`**: added optional `cacheCreationInputTokens` to `AgentSessionPayloadSchema` (optional so `hook-codex`/`hook-copilot`, which have no creation/read split in their source APIs, don't need changes).
- **`packages/hook-claude-code/src/index.ts`**: `buildPayload` now tracks `cache_read_input_tokens` and `cache_creation_input_tokens` as separate accumulators instead of summing them into `cachedInputTokens`.
- **`packages/api/src/pricing/pricing.service.ts`**:
  - `calculateCost` takes a new `cacheCreationInputTokens` param, priced via `cacheCreationInputTokenCost` (falls back to `inputCostPerToken * 1.25`, matching ccusage).
  - `fetchAndSavePricing`: added `AbortSignal.timeout(10_000)` to the fetch call; switched the per-model upsert loop to `Promise.all`.
- **`packages/api/src/agent-sessions/agent-sessions.service.ts`**: `upsert` passes `payload.cacheCreationInputTokens ?? 0` through to `pricing.calculateCost` and persists it on the `AgentSession` row.
- **`packages/dashboard/src/api/client.ts`**: added `cacheCreationInputTokens` to `AgentSessionRow` (UI components not changed — still display the combined `cachedInputTokens` total only).
- **Tests**: updated `hook-claude-code/src/index.test.ts`, `pricing.service.test.ts` (added 2 new cases for the cache-creation fallback/explicit-rate paths, fixed the `fetch` assertion for the new `signal` option), `agent-sessions.service.test.ts`.

## Verification
- `pnpm --filter @jagit/api test`: 97/99 passing — the 2 failures are the pre-existing, unrelated `webhooks.controller.test.ts` 401s already noted in CLAUDE.md, confirmed unaffected by this change (same failures before and after).
- `pnpm --filter @jagit/hook-claude-code test`: 2/2 passing.
- Built `agent-reporter`, `hook-claude-code`, `hook-codex`, `hook-copilot`, `api`, `dashboard`, `shared` — all clean.
- `detect_changes()` (GitNexus): risk `low`, all changed symbols match the intended files, no unexpected affected processes.

## Follow-ups
- None new. Existing follow-ups in `CLAUDE.md` (publish hook packages, dedicated aggregate endpoint, webhooks 401 investigation) are unaffected.
