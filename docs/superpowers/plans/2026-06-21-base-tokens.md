# Base Tokens (BT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a normalized "Base Token" (BT) cost unit (1 BT = price of 1 input token of `claude-haiku-4-5`) and surface it in the Live Sessions table, summary-card tooltips, and the Overview "Total tokens used" widget.

**Architecture:** BT is derived at read time from each session's `costUsd` divided by the base model's `inputCostPerToken` (resolved from the existing `ModelPricing` table). The backend (`PricingService`, `AgentSessionService`, `StatsService`) computes BT and adds it to API responses; the dashboard only formats and displays it. No DB schema change, no migration.

**Tech Stack:** NestJS + Prisma (api), Vitest (tests), React + Vite + shadcn/ui + Radix Tooltip (dashboard).

**Spec:** `docs/superpowers/specs/2026-06-21-base-tokens-design.md`

---

## File Structure

- `packages/api/src/pricing/pricing.service.ts` — add `BASE_TOKEN_MODEL`, `getBaseTokenRate()`, `toBaseTokens()`. (Task 1)
- `packages/api/src/agent-sessions/agent-sessions.service.ts` — per-row BT in `list()`; per-type BT split in `aggregate()`. (Tasks 2, 3)
- `packages/api/src/stats/stats.service.ts` — `totalBaseTokens` from live-session cost sum. (Task 4)
- `packages/dashboard/src/api/client.ts` — extend `AgentSessionRow`, `AgentSessionAggregateResponse`, overview stats types. (Task 5)
- `packages/dashboard/src/lib/utils.ts` — `formatBaseTokens()`. (Task 5)
- `packages/dashboard/src/components/sessions/LiveSessionsTable.tsx` — "BT" column. (Task 6)
- `packages/dashboard/src/components/sessions/SessionSummaryCards.tsx` — BT tooltips. (Task 7)
- `packages/dashboard/src/pages/Overview.tsx` — BT in "Total Tokens Used" card. (Task 8)

Existing reusable assets confirmed: `components/ui/tooltip.tsx` exists; `@radix-ui/react-tooltip` is installed; `formatTokens` exists in `lib/utils.ts`.

---

### Task 1: Base-rate resolver + `toBaseTokens` on PricingService

**Goal:** Add the base-model constant, a method to resolve `claude-haiku-4-5`'s input cost per token, and a pure converter from USD cost to BT.

**Files:**
- Modify: `packages/api/src/pricing/pricing.service.ts`
- Test: `packages/api/src/pricing/pricing.service.test.ts`

**Acceptance Criteria:**
- [ ] `BASE_TOKEN_MODEL` exported as `"claude-haiku-4-5"`.
- [ ] `getBaseTokenRate()` returns the base model's `inputCostPerToken`, or `null` when missing/`<= 0`, reusing the fuzzy lookup.
- [ ] `toBaseTokens(costUsd, baseRate)` returns `costUsd / baseRate`; `null` when either input is `null` or `baseRate <= 0`.

**Verify:** `pnpm --filter @jagit/api test -- pricing.service` → all pass.

**Steps:**

- [ ] **Step 1: Write failing tests** — append to `packages/api/src/pricing/pricing.service.test.ts` (inside the top-level `describe("PricingService", ...)` block, after the last `it`):

```ts
  it("getBaseTokenRate returns base model inputCostPerToken", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 0.0000008,
      outputCostPerToken: 0.000004,
    });
    const rate = await svc.getBaseTokenRate();
    expect(rate).toBe(0.0000008);
    expect((prisma as any).client.modelPricing.findUnique).toHaveBeenCalledWith({
      where: { model: "claude-haiku-4-5" },
    });
  });

  it("getBaseTokenRate returns null when base model missing", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue(null);
    (prisma as any).client.modelPricing.findFirst.mockResolvedValue(null);
    expect(await svc.getBaseTokenRate()).toBeNull();
  });

  it("getBaseTokenRate returns null when rate is zero or negative", async () => {
    (prisma as any).client.modelPricing.findUnique.mockResolvedValue({
      inputCostPerToken: 0,
      outputCostPerToken: 0.000004,
    });
    expect(await svc.getBaseTokenRate()).toBeNull();
  });

  it("toBaseTokens divides cost by base rate", () => {
    expect(svc.toBaseTokens(0.0008, 0.0000008)).toBe(1000);
  });

  it("toBaseTokens returns null for null cost, null rate, or non-positive rate", () => {
    expect(svc.toBaseTokens(null, 0.0000008)).toBeNull();
    expect(svc.toBaseTokens(0.0008, null)).toBeNull();
    expect(svc.toBaseTokens(0.0008, 0)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jagit/api test -- pricing.service`
Expected: FAIL — `svc.getBaseTokenRate is not a function` / `svc.toBaseTokens is not a function`.

- [ ] **Step 3: Implement** — in `packages/api/src/pricing/pricing.service.ts`, add the constant above the class (after the `LiteLlmPricingResponse` interface):

```ts
export const BASE_TOKEN_MODEL = "claude-haiku-4-5";
```

Then refactor the model-pricing lookup so it can be reused. Add a private method and the two public methods inside the `PricingService` class (place them after `calculateCost`):

```ts
  private async findPricing(model: string) {
    let pricing = await this.prisma.client.modelPricing.findUnique({
      where: { model },
    });
    if (!pricing) {
      const normalizedModel = model.toLowerCase();
      pricing = await this.prisma.client.modelPricing.findFirst({
        where: { model: { equals: normalizedModel, mode: "insensitive" } },
      });
      if (!pricing) {
        pricing = await this.prisma.client.modelPricing.findFirst({
          where: { model: { contains: normalizedModel, mode: "insensitive" } },
        });
      }
    }
    return pricing;
  }

  async getBaseTokenRate(): Promise<number | null> {
    const pricing = await this.findPricing(BASE_TOKEN_MODEL);
    if (!pricing || pricing.inputCostPerToken <= 0) return null;
    return pricing.inputCostPerToken;
  }

  toBaseTokens(costUsd: number | null, baseRate: number | null): number | null {
    if (costUsd == null || baseRate == null || baseRate <= 0) return null;
    return costUsd / baseRate;
  }
```

Note: leave `calculateCost`'s existing inline lookup as-is to avoid touching its tested behavior; `findPricing` duplicates that logic intentionally for the new path. (The existing `getBaseTokenRate` "missing" test mocks both `findUnique` and `findFirst` returning null, matching this fallback chain.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @jagit/api test -- pricing.service`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/pricing/pricing.service.ts packages/api/src/pricing/pricing.service.test.ts
git commit -m "$(cat <<'EOF'
feat(pricing): add base-token rate resolver and toBaseTokens converter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Per-row `baseTokens` in `AgentSessionService.list()`

**Goal:** Each listed session row carries `baseTokens` (`costUsd / baseRate`, or `null`).

**Files:**
- Modify: `packages/api/src/agent-sessions/agent-sessions.service.ts:74-96`
- Test: `packages/api/src/agent-sessions/agent-sessions.service.test.ts`

**Acceptance Criteria:**
- [ ] `list()` calls `pricing.getBaseTokenRate()` once and adds `baseTokens` to every row.
- [ ] `baseTokens` is `null` when a row's `costUsd` is `null` or the base rate is unavailable.
- [ ] `total` is unchanged.

**Verify:** `pnpm --filter @jagit/api test -- agent-sessions.service` → all pass.

**Steps:**

- [ ] **Step 1: Update the shared test fixture and write a failing test** — in `packages/api/src/agent-sessions/agent-sessions.service.test.ts`:

First extend the `pricing` mock in `beforeEach` so it has the new methods (replace the existing `pricing = { ... }` line):

```ts
    pricing = {
      calculateCost: vi.fn().mockResolvedValue(0.123),
      getBaseTokenRate: vi.fn().mockResolvedValue(0.0000008),
      toBaseTokens: vi.fn((cost: number | null, rate: number | null) =>
        cost == null || rate == null || rate <= 0 ? null : cost / rate),
    } as unknown as PricingService;
```

Then update the existing `findMany` mock to return rows with `costUsd` so BT is computable. In `makePrisma`, change the `findMany` line to:

```ts
        findMany: vi.fn().mockResolvedValue([{ id: "as1", costUsd: 0.0008, user: { username: "alice" } }]),
```

The existing `"list filters by tool"` test asserts `res` deep-equals rows without `baseTokens`; update that assertion to:

```ts
    expect(res.total).toBe(1);
    expect(res.rows).toEqual([
      { id: "as1", costUsd: 0.0008, user: { username: "alice" }, baseTokens: 1000 },
    ]);
```

Add a new test after it:

```ts
  it("list sets baseTokens to null when base rate unavailable", async () => {
    (pricing.getBaseTokenRate as any).mockResolvedValue(null);
    const res = await svc.list({ limit: 50, offset: 0 });
    expect(res.rows[0].baseTokens).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jagit/api test -- agent-sessions.service`
Expected: FAIL — rows lack `baseTokens`.

- [ ] **Step 3: Implement** — in `agent-sessions.service.ts`, replace the body of `list()` after the `where` construction. Change the destructured `[rows, total]` block and the return:

```ts
    const baseRate = await this.pricing.getBaseTokenRate();
    const [rows, total] = await Promise.all([
      this.prisma.client.agentSession.findMany({
        where: where as any,
        orderBy: { lastUpdatedAt: "desc" },
        take: filters.limit,
        skip: filters.offset,
        include: { user: { select: { username: true } } },
      }),
      this.prisma.client.agentSession.count({ where: where as any }),
    ]);
    const rowsWithBt = rows.map((r) => ({
      ...r,
      baseTokens: this.pricing.toBaseTokens(r.costUsd, baseRate),
    }));
    return { rows: rowsWithBt, total };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @jagit/api test -- agent-sessions.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/agent-sessions/agent-sessions.service.ts packages/api/src/agent-sessions/agent-sessions.service.test.ts
git commit -m "$(cat <<'EOF'
feat(agent-sessions): add per-row baseTokens to list endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Per-token-type BT split in `AgentSessionService.aggregate()`

**Goal:** The aggregate response includes `baseTokens: { input, output, total } | null`, derived from per-model token sums priced against each model's rates and divided by the base rate.

**Files:**
- Modify: `packages/api/src/agent-sessions/agent-sessions.service.ts:98-180`
- Test: `packages/api/src/agent-sessions/agent-sessions.service.test.ts`

**Acceptance Criteria:**
- [ ] `aggregate()` groups token sums by model, prices input vs output USD per model (using cache-read default 10% and cache-creation default 125% of input rate, matching `calculateCost`), divides by base rate.
- [ ] Returns `baseTokens.total ≈ baseTokens.input + baseTokens.output`.
- [ ] `baseTokens` is `null` when base rate unavailable.
- [ ] Models with no resolvable pricing contribute 0 to the BT sums.

**Verify:** `pnpm --filter @jagit/api test -- agent-sessions.service` → all pass.

**Steps:**

- [ ] **Step 1: Write a failing test** — add to `agent-sessions.service.test.ts`. This test drives a new `groupBy(["model"], _sum tokens)` call and per-model pricing lookups. Add a `findPricing`-style hook to the `pricing` mock and a model-token `groupBy` to the prisma mock.

First, extend the `pricing` mock in `beforeEach` to add `pricingFor` (a helper the implementation will call — see Step 3). Replace the `pricing = { ... }` assignment with:

```ts
    pricing = {
      calculateCost: vi.fn().mockResolvedValue(0.123),
      getBaseTokenRate: vi.fn().mockResolvedValue(0.0000008),
      toBaseTokens: vi.fn((cost: number | null, rate: number | null) =>
        cost == null || rate == null || rate <= 0 ? null : cost / rate),
      getModelRates: vi.fn(async (model: string) =>
        model === "known"
          ? { inputCostPerToken: 0.000001, outputCostPerToken: 0.000005, cacheReadInputTokenCost: null, cacheCreationInputTokenCost: null }
          : null),
    } as unknown as PricingService;
```

Add the aggregate test (after the existing aggregate-related tests, or near the end of the `describe`):

```ts
  it("aggregate returns per-type baseTokens split", async () => {
    const p = (prisma as any).client.agentSession;
    p.groupBy = vi.fn(async ({ by }: any) => {
      if (by[0] === "userId") return [{ userId: "u1", _sum: { costUsd: 0.5 } }];
      if (by[0] === "model") {
        if (Array.isArray(by) && by.includes("model") && (arguments as any)) { /* noop */ }
        return [
          { model: "known", _sum: { inputTokens: 1000, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 2000 } },
        ];
      }
      if (by[0] === "tool") return [{ tool: "claude_code", _sum: { costUsd: 0.5 } }];
      return [];
    });
    p.aggregate = vi.fn().mockResolvedValue({
      _sum: { inputTokens: 1000, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 2000, costUsd: 0.5 },
    });
    p.count = vi.fn().mockResolvedValue(0);
    (prisma as any).client.user.findMany = vi.fn().mockResolvedValue([{ id: "u1", username: "alice" }]);

    const res = await svc.aggregate({});
    // input USD = 1000 * 0.000001 = 0.001 -> /0.0000008 = 1250
    // output USD = 2000 * 0.000005 = 0.01 -> /0.0000008 = 12500
    expect(res.baseTokens).not.toBeNull();
    expect(res.baseTokens!.input).toBeCloseTo(1250, 5);
    expect(res.baseTokens!.output).toBeCloseTo(12500, 5);
    expect(res.baseTokens!.total).toBeCloseTo(res.baseTokens!.input + res.baseTokens!.output, 5);
  });

  it("aggregate returns null baseTokens when base rate unavailable", async () => {
    (pricing.getBaseTokenRate as any).mockResolvedValue(null);
    const p = (prisma as any).client.agentSession;
    p.groupBy = vi.fn(async ({ by }: any) => {
      if (by[0] === "model") return [{ model: "known", _sum: { inputTokens: 1000, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 2000 } }];
      return [];
    });
    p.aggregate = vi.fn().mockResolvedValue({ _sum: { inputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 0, costUsd: 0 } });
    p.count = vi.fn().mockResolvedValue(0);
    (prisma as any).client.user.findMany = vi.fn().mockResolvedValue([]);
    const res = await svc.aggregate({});
    expect(res.baseTokens).toBeNull();
  });
```

Note: the messy `arguments` line above is illustrative only — delete it; the real branch only needs to distinguish `by[0] === "model"` from the cost group-bys. Since both the cost rollup and the token rollup group by `model`, the implementation MUST request them as one combined `groupBy` (see Step 3) so there is a single `by[0] === "model"` call returning both `_sum.costUsd` and `_sum` token fields. Adjust the mock to return cost+tokens together:

```ts
      if (by[0] === "model") {
        return [
          { model: "known", _sum: { costUsd: 0.5, inputTokens: 1000, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 2000 } },
        ];
      }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jagit/api test -- agent-sessions.service`
Expected: FAIL — `res.baseTokens` undefined; `getModelRates` not used.

- [ ] **Step 3: Implement.** Two parts.

(a) Add a reusable rates resolver to `PricingService` (in `pricing.service.ts`, after `getBaseTokenRate`) so the aggregate can price per model without duplicating the fuzzy lookup:

```ts
  async getModelRates(model: string): Promise<{
    inputCostPerToken: number;
    outputCostPerToken: number;
    cacheReadInputTokenCost: number | null;
    cacheCreationInputTokenCost: number | null;
  } | null> {
    const p = await this.findPricing(model);
    if (!p) return null;
    return {
      inputCostPerToken: p.inputCostPerToken,
      outputCostPerToken: p.outputCostPerToken,
      cacheReadInputTokenCost: p.cacheReadInputTokenCost ?? null,
      cacheCreationInputTokenCost: p.cacheCreationInputTokenCost ?? null,
    };
  }
```

(b) In `agent-sessions.service.ts` `aggregate()`: merge the token sums into the existing `by: ["model"]` cost group-by (add `_sum` token fields to it) and compute the BT split. Modify the `byModelRaw` groupBy to also sum tokens:

```ts
      this.prisma.client.agentSession.groupBy({
        by: ["model"],
        _sum: {
          costUsd: true,
          inputTokens: true,
          cachedInputTokens: true,
          cacheCreationInputTokens: true,
          outputTokens: true,
        },
        where: where as any,
      }),
```

Then, after `const totalCostUsd = ...`, add the BT computation and include it in the return:

```ts
    const baseRate = await this.pricing.getBaseTokenRate();
    let baseTokens: { input: number; output: number; total: number } | null = null;
    if (baseRate != null) {
      let inputUsd = 0;
      let outputUsd = 0;
      for (const m of byModelRaw) {
        const rates = await this.pricing.getModelRates(m.model);
        if (!rates) continue;
        const inTok = m._sum.inputTokens ?? 0;
        const cachedTok = m._sum.cachedInputTokens ?? 0;
        const cacheCreateTok = m._sum.cacheCreationInputTokens ?? 0;
        const outTok = m._sum.outputTokens ?? 0;
        const cacheReadCost = rates.cacheReadInputTokenCost ?? rates.inputCostPerToken * 0.1;
        const cacheCreateCost = rates.cacheCreationInputTokenCost ?? rates.inputCostPerToken * 1.25;
        inputUsd += inTok * rates.inputCostPerToken + cachedTok * cacheReadCost + cacheCreateTok * cacheCreateCost;
        outputUsd += outTok * rates.outputCostPerToken;
      }
      const input = inputUsd / baseRate;
      const output = outputUsd / baseRate;
      baseTokens = { input, output, total: input + output };
    }

    return { byUser, byModel, byTool, totalTokens, totalCostUsd, missingCostCount, baseTokens };
```

Note: `byModel` (the cost list returned to the client) still uses `m._sum.costUsd`; this change only adds token fields to the same query. The `.filter((m) => m.costUsd > 0)` on `byModel` is unaffected — it reads the mapped `costUsd`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @jagit/api test -- agent-sessions.service pricing.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/pricing/pricing.service.ts packages/api/src/agent-sessions/agent-sessions.service.ts packages/api/src/agent-sessions/agent-sessions.service.test.ts
git commit -m "$(cat <<'EOF'
feat(agent-sessions): add per-type baseTokens split to aggregate endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `totalBaseTokens` in `StatsService.getOverview()`

**Goal:** Overview response exposes `totalBaseTokens` (live-session cost ÷ base rate; `null` when unavailable). `totalTokensUsed` stays unchanged.

**Files:**
- Modify: `packages/api/src/stats/stats.service.ts`
- Test: `packages/api/src/stats/stats.service.test.ts`

**Acceptance Criteria:**
- [ ] `StatsService` constructor accepts `PricingService` (added to DI).
- [ ] `getOverview()` sums `costUsd` in the live `agentSession.aggregate` call and converts via `pricing.toBaseTokens(costSum, baseRate)`.
- [ ] `totalBaseTokens` is `null` when base rate unavailable; `totalTokensUsed` unchanged.

**Verify:** `pnpm --filter @jagit/api test -- stats.service` → all pass.

**Steps:**

- [ ] **Step 1: Update test fixture + write failing assertions** — in `stats.service.test.ts`:

Add a pricing mock and pass it to the service. Replace the `svc = new StatsService(mockPrisma as any);` line in `beforeEach` with:

```ts
    pricing = {
      getBaseTokenRate: vi.fn().mockResolvedValue(0.0000008),
      toBaseTokens: vi.fn((cost: number | null, rate: number | null) =>
        cost == null || rate == null || rate <= 0 ? null : cost / rate),
    } as any;
    svc = new StatsService(mockPrisma as any, pricing);
```

Declare `let pricing: any;` next to `let svc: StatsService;`.

Add `costUsd` to the existing `agentSession.aggregate` mock `_sum` (so the cost sum exists):

```ts
    mockPrisma.client.agentSession.aggregate.mockResolvedValue({
      _sum: {
        inputTokens: 20_000,
        cachedInputTokens: 0,
        cacheCreationInputTokens: 5_000,
        outputTokens: 50_000,
        costUsd: 0.0008,
      },
    });
```

Add assertions after the existing `totalTokensUsed` assertion:

```ts
    expect(result.totalTokensUsed).toBe(125_000); // unchanged
    expect(result.totalBaseTokens).toBe(1000);    // 0.0008 / 0.0000008
```

Add a second test in the `describe`:

```ts
  it("totalBaseTokens is null when base rate unavailable", async () => {
    pricing.getBaseTokenRate.mockResolvedValue(null);
    mockPrisma.client.job.count.mockResolvedValue(0);
    mockPrisma.client.approval.count.mockResolvedValue(0);
    mockPrisma.client.job.groupBy.mockResolvedValue([]);
    mockPrisma.client.job.findMany.mockResolvedValue([]);
    mockPrisma.client.agentSession.aggregate.mockResolvedValue({
      _sum: { inputTokens: 0, cachedInputTokens: 0, cacheCreationInputTokens: 0, outputTokens: 0, costUsd: 0.0008 },
    });
    mockPrisma.client.usageUpload.findMany.mockResolvedValue([]);
    mockPrisma.client.jobEvent.findMany.mockResolvedValue([]);
    const result = await svc.getOverview();
    expect(result.totalBaseTokens).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @jagit/api test -- stats.service`
Expected: FAIL — `StatsService` constructor takes 1 arg / `totalBaseTokens` undefined.

- [ ] **Step 3: Implement** — in `stats.service.ts`:

Add the import at the top:

```ts
import { PricingService } from "../pricing/pricing.service.js";
```

Update the constructor:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}
```

Add `costUsd: true` to the `agentSession.aggregate` `_sum` block inside `getOverview()`:

```ts
      this.prisma.client.agentSession.aggregate({
        _sum: {
          inputTokens: true,
          cachedInputTokens: true,
          cacheCreationInputTokens: true,
          outputTokens: true,
          costUsd: true,
        },
      }),
```

After `const totalTokensUsed = liveTokens + codeburnTokens;`, add:

```ts
    const baseRate = await this.pricing.getBaseTokenRate();
    const totalBaseTokens = this.pricing.toBaseTokens(
      agentSessionAggregate._sum.costUsd ?? 0,
      baseRate,
    );
```

Add `totalBaseTokens` to the returned object (next to `totalTokensUsed`):

```ts
      totalTokensUsed,
      totalBaseTokens,
```

- [ ] **Step 4: Verify DI wiring.** Confirm `StatsModule` imports `PricingModule` (or that `PricingService` is provided/exported where `StatsService` is declared). Inspect the module:

Run: `sed -n '1,40p' packages/api/src/stats/stats.module.ts`

If `PricingService` is not available to `StatsModule`, add `imports: [PricingModule]` (import from `../pricing/pricing.module.js`) and ensure `PricingModule` exports `PricingService`. Check `packages/api/src/pricing/pricing.module.ts` exports it (the agent-sessions module already consumes `PricingService`, so mirror that wiring).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @jagit/api test -- stats.service`
Expected: PASS.

- [ ] **Step 6: Build the API to confirm DI resolves**

Run: `pnpm --filter @jagit/api build`
Expected: success, no Nest DI/type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/stats/stats.service.ts packages/api/src/stats/stats.service.test.ts packages/api/src/stats/stats.module.ts
git commit -m "$(cat <<'EOF'
feat(stats): expose totalBaseTokens for live sessions in overview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Dashboard types + `formatBaseTokens` helper

**Goal:** Extend client types with the new BT fields and add a display helper.

**Files:**
- Modify: `packages/dashboard/src/api/client.ts`
- Modify: `packages/dashboard/src/lib/utils.ts`

**Acceptance Criteria:**
- [ ] `AgentSessionRow` has `baseTokens: number | null`.
- [ ] `AgentSessionAggregateResponse` has `baseTokens: { input: number; output: number; total: number } | null`.
- [ ] The overview stats type has `totalBaseTokens: number | null`.
- [ ] `formatBaseTokens(bt: number | null): string` returns `"—"` for null, else `formatTokens(bt)`.

**Verify:** `pnpm --filter @jagit/dashboard build` → success.

**Steps:**

- [ ] **Step 1: Add `formatBaseTokens`** to `packages/dashboard/src/lib/utils.ts` (after `formatTokens`):

```ts
export function formatBaseTokens(bt: number | null): string {
  if (bt == null) return "—";
  return formatTokens(bt);
}
```

- [ ] **Step 2: Extend `AgentSessionRow`** in `packages/dashboard/src/api/client.ts` — add the field inside the interface (after `toolCallCount`):

```ts
  baseTokens: number | null;
```

- [ ] **Step 3: Extend `AgentSessionAggregateResponse`** — add after `missingCostCount: number;`:

```ts
  baseTokens: { input: number; output: number; total: number } | null;
```

- [ ] **Step 4: Extend the overview stats interface** — find the interface containing `totalTokensUsed: number;` (around `client.ts:93`) and add:

```ts
  totalBaseTokens: number | null;
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @jagit/dashboard build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/api/client.ts packages/dashboard/src/lib/utils.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): add baseTokens types and formatBaseTokens helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: "BT" column in the Live Sessions table

**Goal:** Add a right-aligned "BT" column after "Output".

**Files:**
- Modify: `packages/dashboard/src/components/sessions/LiveSessionsTable.tsx`

**Acceptance Criteria:**
- [ ] New `<TableHead className="text-right">BT</TableHead>` between Output and Cost.
- [ ] New cell renders `formatBaseTokens(row.baseTokens)`.
- [ ] Empty-state `colSpan` updated from 10 to 11.

**Verify:** `pnpm --filter @jagit/dashboard build` → success.

**Steps:**

- [ ] **Step 1: Import the helper** — update the import in `LiveSessionsTable.tsx`. Add at top:

```ts
import { formatBaseTokens } from "@/lib/utils";
```

- [ ] **Step 2: Add the header** — after the Output `<TableHead>` (`<TableHead className="text-right">Output</TableHead>`), insert:

```tsx
              <TableHead className="text-right">BT</TableHead>
```

- [ ] **Step 3: Add the cell** — after the Output cell (`<TableCell className="text-right">{row.outputTokens.toLocaleString()}</TableCell>`), insert:

```tsx
                  <TableCell className="text-right">{formatBaseTokens(row.baseTokens)}</TableCell>
```

- [ ] **Step 4: Update empty-state colSpan** — change `colSpan={10}` to `colSpan={11}`.

- [ ] **Step 5: Build**

Run: `pnpm --filter @jagit/dashboard build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/sessions/LiveSessionsTable.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add BT column to live sessions table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: BT tooltips on Live Sessions summary cards

**Goal:** Hovering the Input / Output / Cost cards shows a tooltip with the token breakdown and the card's Base Tokens equivalent.

**Files:**
- Modify: `packages/dashboard/src/components/sessions/SessionSummaryCards.tsx`

**Acceptance Criteria:**
- [ ] Input card tooltip: "New input: N · Cached: M (X%) · Base Tokens: BT_input".
- [ ] Output card tooltip: "Output: N · Base Tokens: BT_output".
- [ ] Cost card tooltip: "Input: N · Output: M · Base Tokens: BT_total".
- [ ] BT values use `aggData.baseTokens` (`—` when null). The "Sessions (total)" card has no tooltip.

**Verify:** `pnpm --filter @jagit/dashboard build` → success.

**Steps:**

- [ ] **Step 1: Rewrite the component** to attach an optional `tooltip` string per stat and wrap card values in a Radix tooltip. Replace the entire contents of `SessionSummaryCards.tsx` with:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatTokens, formatBaseTokens } from "@/lib/utils";
import type { AgentSessionAggregateResponse } from "@/api/client.js";

interface Props {
  total: number;
  aggData: AgentSessionAggregateResponse | null;
}

export function SessionSummaryCards({ total, aggData }: Props) {
  const totalInputTokens = aggData
    ? aggData.totalTokens.newInput + aggData.totalTokens.cachedInput
    : 0;
  const cachedPercentage =
    totalInputTokens > 0 && aggData
      ? Math.round((aggData.totalTokens.cachedInput / totalInputTokens) * 100)
      : 0;

  const outputTokens = aggData ? aggData.totalTokens.output : 0;
  const cost = aggData ? aggData.totalCostUsd : 0;
  const missingCostCount = aggData ? aggData.missingCostCount : 0;
  const bt = aggData ? aggData.baseTokens : null;

  const stats: Array<{ label: string; value: string; sub: string | null; tooltip: string | null }> = [
    {
      label: "Sessions (total)",
      value: total.toLocaleString(),
      sub: null,
      tooltip: null,
    },
    {
      label: "Input tokens (total)",
      value:
        cachedPercentage > 0
          ? `${formatTokens(totalInputTokens)} (${cachedPercentage}%)`
          : `${formatTokens(totalInputTokens)}`,
      sub: null,
      tooltip: aggData
        ? `New input: ${formatTokens(aggData.totalTokens.newInput)} · Cached: ${formatTokens(aggData.totalTokens.cachedInput)} (${cachedPercentage}%) · Base Tokens: ${formatBaseTokens(bt ? bt.input : null)}`
        : null,
    },
    {
      label: "Output tokens (total)",
      value: formatTokens(outputTokens),
      sub: null,
      tooltip: aggData
        ? `Output: ${formatTokens(outputTokens)} · Base Tokens: ${formatBaseTokens(bt ? bt.output : null)}`
        : null,
    },
    {
      label: "Cost (total)",
      value: `$${cost.toFixed(2)}`,
      sub: missingCostCount > 0 ? `${missingCostCount} missing cost` : null,
      tooltip: aggData
        ? `Input: ${formatTokens(totalInputTokens)} · Output: ${formatTokens(outputTokens)} · Base Tokens: ${formatBaseTokens(bt ? bt.total : null)}`
        : null,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {s.tooltip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-2xl font-bold cursor-help w-fit">{s.value}</div>
                  </TooltipTrigger>
                  <TooltipContent>{s.tooltip}</TooltipContent>
                </Tooltip>
              ) : (
                <div className="text-2xl font-bold">{s.value}</div>
              )}
              {s.sub && (
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Build**

Run: `pnpm --filter @jagit/dashboard build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/sessions/SessionSummaryCards.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add base-token tooltips to session summary cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: BT in the Overview "Total Tokens Used" card

**Goal:** Show live-session Base Tokens as the headline figure with a "BT" suffix, raw token count as the sub-line.

**Files:**
- Modify: `packages/dashboard/src/pages/Overview.tsx:172-177`

**Acceptance Criteria:**
- [ ] Card value renders `${formatBaseTokens(stats.totalBaseTokens)} BT` (or `—` when null, without a stray "BT" — see note).
- [ ] Description references the raw token total via `formatTokens(stats.totalTokensUsed)`.

**Verify:** `pnpm --filter @jagit/dashboard build` → success.

**Steps:**

- [ ] **Step 1: Ensure helper import** — confirm `Overview.tsx` imports `formatBaseTokens`. It already imports `formatTokens` from `@/lib/utils`; extend that import:

```ts
import { formatTokens, formatBaseTokens } from "@/lib/utils";
```

(If the existing import is `import { formatTokens } from "@/lib/utils";`, replace it with the line above.)

- [ ] **Step 2: Update the StatCard** — replace the "Total Tokens Used" `<StatCard>` block (lines ~172-177) with:

```tsx
            <StatCard
              title="Total Tokens Used"
              value={
                stats.totalBaseTokens == null
                  ? "—"
                  : `${formatBaseTokens(stats.totalBaseTokens)} BT`
              }
              icon={Hash}
              description={`${formatTokens(stats.totalTokensUsed)} tokens · live BT`}
            />
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @jagit/dashboard build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/pages/Overview.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): show live-session base tokens in overview total card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full build + test sweep

**Goal:** Confirm the whole monorepo builds and the api test suite is green (modulo the 2 known-unrelated `webhooks.controller.test.ts` 401 failures noted in CLAUDE.md).

**Files:** none (verification only).

**Acceptance Criteria:**
- [ ] `pnpm -r build` succeeds.
- [ ] `pnpm --filter @jagit/api test` passes except the 2 pre-existing `webhooks.controller.test.ts` failures.

**Verify:** commands below.

**Steps:**

- [ ] **Step 1: Build everything**

Run: `pnpm -r build`
Expected: all packages build, no type errors.

- [ ] **Step 2: Run API tests**

Run: `pnpm --filter @jagit/api test`
Expected: PASS except the 2 known `webhooks.controller.test.ts` 401 failures.

- [ ] **Step 3: If green, no commit needed.** If any new failure appears, fix it in the owning task's files and amend that task's commit with a new follow-up commit (never `--no-verify`).

---

## Self-Review Notes

- **Spec coverage:** §4.1 → Task 1; §4.3 → Task 2; §4.2 → Task 3; §4.4 → Task 4; §5 → Task 5; §6.1 → Task 5; §6.2 → Task 6; §6.3 → Task 7; §6.4 → Task 8. All spec sections mapped.
- **Type consistency:** `baseTokens` row field is `number | null` (Tasks 2, 5); aggregate `baseTokens` is `{input,output,total} | null` (Tasks 3, 5, 7); overview `totalBaseTokens` is `number | null` (Tasks 4, 5, 8). `getBaseTokenRate`, `toBaseTokens`, `getModelRates` signatures consistent across Tasks 1–4.
- **Known caveat:** Task 3's test snippet contains an intentionally-deleted `arguments` line; Step 1 explicitly instructs deleting it and merging the model cost+token group-by into one call, which Step 3 implements. The combined `by: ["model"]` query returns both `_sum.costUsd` (for `byModel`) and `_sum` token fields (for BT) in a single round-trip.
