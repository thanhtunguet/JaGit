# Token usage tracking + Total Tokens Used widget

## Task
Measure agent token usage directly from ACP, persist to Job rows, and replace the Overview "Avg Token Cost" stat with "Total Tokens Used".

## Changes
- **Worker ACP** (`packages/worker/src/acp/client.ts`):
  - Parse ACP `usage_update` (`used`, `cost.amount`) and legacy `tokens`/`costUsd`
  - Fallback to `PromptResponse.usage` after `session/prompt`
  - Pure helpers `applyUsageUpdate` / `applyPromptUsage` (unit tested)
- **Worker graph** (`graph.ts`): `sink.setUsage()` after `runAgent`
- **Prisma sink** (`prisma-sink.ts`): `setUsage` writes `Job.tokensUsed`/`costUsd` + SSE `usage_updated`
- **Stats API**: `totalTokensUsed` = `sum(tokensUsed)` across all jobs (replaces `avgCostUsd`)
- **Dashboard Overview**: "Total Tokens Used" stat card with `Hash` icon

## Tests
- Worker: 15 tests (6 ACP + graph setUsage assertion) — pass
- API stats: 2 tests — pass
- Dashboard client: 12 tests — pass
- Build: worker + api + dashboard — OK

## Follow-ups
- Backfill tokens from historical `agent_done` event payloads if needed
- Live refresh of token stat via `usage_updated` SSE on Overview
