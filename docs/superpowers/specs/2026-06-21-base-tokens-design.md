# Base Tokens (BT) — Normalized Cost Unit — Design Spec

**Date:** 2026-06-21
**Status:** Approved (design); ready for implementation plan
**Area:** `packages/api` (pricing, agent-sessions, stats) + `packages/dashboard`

## 1. Problem & Goal

AI usage data spans multiple models (Claude Code, Codex, Copilot) and multiple
token types (input, output, cached-read input, cache-creation input). A raw token
count is misleading because a token of one type/model is far more expensive than
another — summing them treats a cheap cached-read token and an expensive output
token as equal.

We introduce a **Base Token (BT)** — a normalized "currency" for usage:

> **1 BT = the USD price of 1 input token of the base model (`claude-haiku-4-5`).**

Every token of every type, on any model, is converted to BT the way currencies are
converted to a base currency: by its price ratio against the base unit.

### Key identity

For a single session, the dollar cost already weights each token type at its real
per-token rate (see `PricingService.calculateCost`). Therefore:

```
BT(session) = costUsd(session) / baseInputCostPerToken
```

where `baseInputCostPerToken` is `claude-haiku-4-5`'s `inputCostPerToken` from the
`ModelPricing` table.

This is exact and reuses the existing cost pipeline — no new pricing math for the
per-session and per-row case. The per-token-type split (needed for tooltips) is
derived the same way but per category (see §4.2).

## 2. Scope

**In scope:**

- New `BASE_TOKEN_MODEL` constant (`"claude-haiku-4-5"`) and a base-rate resolver
  reusing the existing `ModelPricing` fuzzy lookup.
- `AgentSessionRow.baseTokens` on the list endpoint.
- BT totals (input / output / total) on the aggregate endpoint.
- `totalBaseTokens` on the Overview/stats endpoint (live-session portion only).
- Dashboard: "BT" column in the Live Sessions table; BT tooltips on the Live
  Sessions summary cards (Input / Output / Cost); BT in the Overview "Total tokens
  used" widget.

**Out of scope (YAGNI):**

- Env-configurability of the base model (hardcoded constant; change is a code edit).
- Converting the **CodeBurn (historical CSV)** token totals to BT — those uploads
  carry no per-model USD cost in a form we trust, so they remain raw token counts.
- Persisting BT in the DB. BT is always derived at read time from `costUsd` and the
  current base rate, so a pricing refresh retroactively corrects historical BT.

## 3. Definitions & Edge Cases

- **Base rate** = `ModelPricing` row for `claude-haiku-4-5`, field `inputCostPerToken`,
  resolved with the same exact → case-insensitive → contains fallback used by
  `PricingService.calculateCost`.
- **Base rate unavailable** (pricing fetch failed / cold start / row missing or
  `inputCostPerToken <= 0`): all BT values resolve to `null`. UI renders `—`.
- **Session cost null** (`costUsd == null`, unknown model pricing): that session's
  `baseTokens == null` and it contributes nothing to BT aggregates.
- BT is a **count of base-input-tokens**, displayed as an integer-ish token figure
  via the existing `formatTokens` helper (e.g. `1.2M`). It is unitless beyond
  "equivalent haiku input tokens"; it is **not** a dollar value in the UI.

## 4. Backend Design (`packages/api`)

### 4.1 Base-rate resolver

Add to `PricingService` (keeps all model-pricing logic in one place):

```ts
export const BASE_TOKEN_MODEL = "claude-haiku-4-5";

// Returns claude-haiku-4-5 inputCostPerToken, or null if unavailable / <= 0.
async getBaseTokenRate(): Promise<number | null>

// Pure helper: costUsd -> BT. null in -> null out; rate null/<=0 -> null.
toBaseTokens(costUsd: number | null, baseRate: number | null): number | null
```

`getBaseTokenRate` reuses the existing fuzzy `ModelPricing` lookup. Callers fetch
the rate once per request and pass it into `toBaseTokens` (avoids N queries).

### 4.2 Aggregate per-token-type BT

The aggregate endpoint must expose BT split by **input / output / total** so each
summary card's tooltip can show its own BT. A single session's `costUsd` does not
decompose by type, so the split is computed from per-model token sums:

- Group sessions `by: ["model"]` summing `inputTokens`, `cachedInputTokens`,
  `cacheCreationInputTokens`, `outputTokens` (in addition to the existing cost
  rollups).
- For each model, resolve its `ModelPricing` rates (input, output, cache-read,
  cache-creation) using the same fuzzy lookup.
- Compute per-model **USD by category**:
  - `inputCostUsd  = inputTokens*inputRate + cachedInputTokens*cacheReadRate
                     + cacheCreationInputTokens*cacheCreationRate`
    (cache-read default = 10% of input rate; cache-creation default = 125% of input
    rate — identical defaults to `calculateCost`).
  - `outputCostUsd = outputTokens*outputRate`
- Sum across models, then divide each by the base rate:
  - `baseTokens.input  = sum(inputCostUsd)  / baseRate`
  - `baseTokens.output = sum(outputCostUsd) / baseRate`
  - `baseTokens.total  = baseTokens.input + baseTokens.output`
- Models with no resolvable pricing contribute `0` to these sums (and are already
  counted in `missingCostCount`).
- If `baseRate` is null, `baseTokens` is `null`.

> Note: `baseTokens.total` derived this way is consistent with
> `totalCostUsd / baseRate` up to models that lack pricing (those drop out of both).

**Aggregate response addition:**

```ts
baseTokens: { input: number; output: number; total: number } | null
```

### 4.3 List endpoint per-row BT

`AgentSessionService.list()` fetches the base rate once and maps each row to add
`baseTokens = toBaseTokens(row.costUsd, baseRate)`.

**Row response addition:** `baseTokens: number | null`.

### 4.4 Overview BT (`StatsService.getOverview`)

The live-session aggregate already sums tokens. Add a `costUsd` sum to that same
`agentSession.aggregate` call (it currently sums only token fields) and convert:

```
liveBaseTokens = toBaseTokens(liveSessionCostSum, baseRate)   // null if rate null
```

CodeBurn CSV tokens are **not** converted. Expose a new field
`totalBaseTokens: number | null` = `liveBaseTokens` (null when base rate
unavailable). Keep the existing `totalTokensUsed` unchanged for back-compat.

## 5. Shared Types / API Client (`packages/dashboard/src/api/client.ts`)

```ts
interface AgentSessionRow { /* ...existing... */ baseTokens: number | null; }

interface AgentSessionAggregateResponse {
  /* ...existing... */
  baseTokens: { input: number; output: number; total: number } | null;
}

// Overview response
totalBaseTokens: number | null;
```

## 6. Frontend Design (`packages/dashboard`)

### 6.1 BT helper

Add `formatBaseTokens(bt: number | null): string` in `src/lib/utils.ts` —
`bt == null ? "—" : formatTokens(bt)`.

### 6.2 Live Sessions table — "BT" column

`LiveSessionsTable.tsx`: add a right-aligned **"BT"** header after "Output" (before
"Cost"), rendering `formatBaseTokens(row.baseTokens)`. Update the empty-state
`colSpan` (10 → 11).

### 6.3 Live Sessions summary cards — tooltips

`SessionSummaryCards.tsx`: wrap the **Input**, **Output**, and **Cost** card values
in a shadcn `Tooltip` (add `components/ui/tooltip` if not present). Tooltip content:

- **Input tokens** card → "New input: N · Cached: M (X%) · Base Tokens: BT_input"
- **Output tokens** card → "Output: N · Base Tokens: BT_output"
- **Cost (total)** card → "Input: N · Output: M · Base Tokens: BT_total"

BT comes from `aggData.baseTokens` (`—` when null). The "Sessions (total)" card
gets no tooltip.

### 6.4 Overview "Total tokens used" widget

Change the "Total tokens used" widget to show **`formatBaseTokens(totalBaseTokens)`**
as the headline figure with a "BT" suffix/label (e.g. `1.2M BT`), and `—` when null.
A sub-line keeps the raw `totalTokensUsed` count for reference
(e.g. "N tokens · live BT only"). The CodeBurn CSV portion stays a raw token count
and is not converted. Data contract: `totalBaseTokens: number | null`.

## 7. Testing (TDD)

Write failing tests first, minimal implementation second.

- `pricing.service.test.ts`: `getBaseTokenRate` (hit, fuzzy hit, missing → null,
  zero/negative rate → null); `toBaseTokens` (normal, null cost → null, null rate →
  null).
- `agent-sessions.service.test.ts`:
  - `list` populates `baseTokens` per row, `null` when `costUsd` null or base rate
    null.
  - `aggregate` returns `baseTokens.{input,output,total}` from a multi-model fixture;
    `total ≈ input + output`; `null` when base rate unavailable; models without
    pricing contribute 0.
- `stats.service.test.ts`: `totalBaseTokens` converts only the live-session cost sum;
  `null` when base rate unavailable; `totalTokensUsed` unchanged.

Run: `pnpm --filter @jagit/api test`, then `pnpm -r build`. Dashboard components are
build-verified (no `@testing-library/react` yet — consistent with current repo
state).

## 8. Files Touched (anticipated)

- `packages/api/src/pricing/pricing.service.ts` (+ test) — base rate + `toBaseTokens`.
- `packages/api/src/agent-sessions/agent-sessions.service.ts` (+ test) — row BT,
  aggregate BT split.
- `packages/api/src/stats/stats.service.ts` (+ test) — `totalBaseTokens`.
- `packages/dashboard/src/api/client.ts` — types.
- `packages/dashboard/src/lib/utils.ts` — `formatBaseTokens`.
- `packages/dashboard/src/components/sessions/LiveSessionsTable.tsx` — BT column.
- `packages/dashboard/src/components/sessions/SessionSummaryCards.tsx` — tooltips.
- `packages/dashboard/src/components/ui/tooltip.tsx` — add if missing.
- Overview page/widget consuming `totalBaseTokens`.

No Prisma schema change, no migration (BT is derived at read time).

## 9. Risks / Open Notes

- BT accuracy depends on `ModelPricing` being populated (daily LiteLLM cron). On a
  cold DB, BT shows `—` until the first successful fetch — acceptable and explicit.
- The aggregate per-type split re-resolves each distinct model's pricing per
  request. Model cardinality is low; if it ever isn't, cache the rate map. Not
  optimized now (YAGNI).
- `claude-haiku-4-5` must exist in LiteLLM's pricing JSON under a resolvable id; the
  fuzzy `contains` lookup covers provider-prefixed variants
  (e.g. `anthropic/claude-haiku-4-5`).
