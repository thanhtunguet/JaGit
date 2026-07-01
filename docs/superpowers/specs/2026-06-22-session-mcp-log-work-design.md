# `log-work` Session MCP Tool — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design); ready for implementation plan
**Area:** `packages/api` (session-mcp, pricing) + `packages/shared` (jira-worklog)

## 1. Problem & Goal

`session-mcp` already exposes an `activate-jira` tool that associates an
agent session with a Jira ticket (`AgentSession.jiraTicketId`). There is no
way for the agent itself to trigger a Jira worklog entry mid-session.

A separate, pre-existing mechanism — the Claude Code `Stop` hook
(`packages/hook-claude-code/src/index.ts`) — already auto-logs a worklog when
a session with a `jiraTicketId` and `costUsd` ends, using **wall-clock**
`durationMs` as the logged time and a hardcoded `1 USD = 4,000,000 BT` rate
(independent of `PricingService`, since the hook can't reach the DB's
`ModelPricing` table). That path is unrelated and is **not modified** by this
work.

This spec adds a new **on-demand** tool, `log-work`, that an interactive
agent can call via session-mcp to log work to the session's associated Jira
ticket, where the **logged duration is derived from token cost**, not
wall-clock time:

> **67.5 USD of cost = 8 hours logged.**

## 2. Scope

**In scope:**

- New `SessionMcpService.logWork(sessionId, username)` method.
- New `log-work` tool registered on the session MCP server.
- `USD_PER_WORKDAY` (67.5) and `HOURS_PER_WORKDAY` (8) constants in
  `PricingService`.
- Change `createJiraWorklog`'s return type from `Promise<void>` to
  `Promise<{ success: boolean; reason?: string }>` so callers that care
  (the new tool) can report real success/failure, while the existing
  fire-and-forget caller (Stop hook) is unaffected.

**Out of scope (YAGNI):**

- Touching the Stop hook's auto-worklog path or its hardcoded BT rate. Noted
  as a pre-existing inconsistency with `PricingService.getBaseTokenRate()`,
  not fixed here.
- Configurable USD-per-workday rate (hardcoded constant, like
  `BASE_TOKEN_MODEL`).
- Allowing an explicit `ticketId` override — `log-work` only logs against the
  session's already-`activate-jira`'d ticket.
- Multiple/partial worklog entries, editing/deleting prior worklogs,
  idempotency guards against double-logging the same session.

## 3. Formula

```
hours            = (costUsd / USD_PER_WORKDAY) * HOURS_PER_WORKDAY
timeSpentSeconds = round(hours * 3600)
baseRate         = PricingService.getBaseTokenRate()              // live, claude-haiku-4-5 input rate
baseTokens       = PricingService.toBaseTokens(costUsd, baseRate) // comment text only, not used in hour math
```

`costUsd` is read directly from the resolved `AgentSession` row (already
maintained by the existing reporting pipeline). `baseTokens` is computed only
for the Jira comment text that `createJiraWorklog` formats — it has no
bearing on `timeSpentSeconds`.

## 4. Backend Design (`packages/api`)

### 4.1 `PricingService` constants

```ts
export const USD_PER_WORKDAY = 67.5;
export const HOURS_PER_WORKDAY = 8;
```

Added alongside `BASE_TOKEN_MODEL`. No new methods needed on `PricingService`
beyond the existing `getBaseTokenRate` / `toBaseTokens`.

### 4.2 `SessionMcpService.logWork`

```ts
async logWork(sessionId: string | undefined, username: string):
  Promise<{ success: boolean; ticketId: string; hoursLogged: number; baseTokens: number | null }>
```

- Resolve the session exactly like `activateJira` (optional `sessionId` →
  else most-recently-active session for `username`).
  - Not found → `NotFoundException`.
- `session.jiraTicketId` missing → `BadRequestException`
  ("Session has no associated Jira ticket; call activate-jira first").
- `session.costUsd` missing → `BadRequestException`
  ("Session has no recorded cost; cannot compute work duration").
- `PricingService.getBaseTokenRate()` returns `null` → `BadRequestException`
  ("Base token rate unavailable; cannot compute work duration").
- Otherwise: compute `hours`/`timeSpentSeconds`/`baseTokens` per §3, call
  `createJiraWorklog({ ticketId: session.jiraTicketId, durationMs: timeSpentSeconds * 1000, baseTokens })`,
  and return `{ success: result.success, ticketId, hoursLogged: hours, baseTokens }`.

`PricingService` is injected into `SessionMcpService` (constructor param,
alongside the existing `PrismaService`).

### 4.3 `createJiraWorklog` return-type change (`packages/shared/src/jira-worklog.ts`)

Change signature to:

```ts
export async function createJiraWorklog(opts: CreateWorklogOpts): Promise<{ success: boolean; reason?: string }>
```

- No credential found → `{ success: false, reason: "No Jira credentials found" }` (unchanged `console.error`, no throw).
- Incomplete credential → `{ success: false, reason: "Incomplete Jira credentials" }`.
- Non-retryable HTTP error (4xx) → `{ success: false, reason: "Jira API error: <status> <detail>" }`.
- Retries exhausted on 5xx / network error → caught by outer `catch`, returns `{ success: false, reason: "<error message>" }`.
- 2xx response → `{ success: true }`.

The existing caller in `hook-claude-code/src/index.ts` (Stop hook) ignores
the return value — no behavior change there; it remains fire-and-forget.

### 4.4 MCP tool registration (`session-mcp.server.ts`)

```ts
server.registerTool(
  "log-work",
  {
    description:
      "Log work to the Jira ticket associated with this session, converting token cost to hours (67.5 USD = 8h)",
    inputSchema: {
      sessionId: z
        .string()
        .optional()
        .describe(
          "Agent session ID to log work for. Omit to use the caller's most recently active session."
        ),
    },
  },
  async (args) => {
    // same try/catch shape as activate-jira:
    // - NotFoundException / ConflictException / BadRequestException -> isError: true, err.message
    // - anything else -> logger.error + isError: true, "Internal error"
  },
);
```

Result payload (JSON-stringified in the tool's text content), matching
`logWork`'s return shape: `{ success, ticketId, hoursLogged, baseTokens }`.

### 4.5 Module wiring

`session-mcp.module.ts` must provide/import `PricingService` (from the
`pricing` module) so it can be injected into `SessionMcpService`.

## 5. Testing (TDD)

Write failing tests first, minimal implementation second.

- `pricing.service.test.ts`: assert `USD_PER_WORKDAY` / `HOURS_PER_WORKDAY`
  constant values (simple sanity, no new logic to unit test beyond existing
  `getBaseTokenRate`/`toBaseTokens` coverage).
- `jira-worklog.test.ts`: update existing cases to assert the new return
  value (`{ success: true }` on 2xx, `{ success: false, reason }` on missing
  credential / incomplete credential / API error).
- `session-mcp.service.test.ts` — new `logWork` describe block:
  - happy path: computes correct `hoursLogged` for a known `costUsd`
    (e.g. `costUsd = 33.75` → `hoursLogged = 4`), calls `createJiraWorklog`
    with `durationMs = hoursLogged * 3600 * 1000`, returns `success` from
    the (mocked) helper's result.
  - session not found → `NotFoundException`.
  - session found but no `jiraTicketId` → `BadRequestException`.
  - session found but no `costUsd` → `BadRequestException`.
  - base rate unavailable (`PricingService.getBaseTokenRate` → `null`) →
    `BadRequestException`.
  - `sessionId` omitted → resolves most-recently-active session (mirrors
    existing `activateJira` test).
- `session-mcp.controller.test.ts` (or wherever `log-work` registration is
  exercised) — success envelope and each `BadRequestException`/
  `NotFoundException` mapped to `isError: true` with the right message,
  plus the generic "Internal error" fallback for unexpected exceptions.

Run: `pnpm --filter @jagit/api test`, `pnpm --filter @jagit/shared test`,
then `pnpm -r build`.

## 6. Files Touched (anticipated)

- `packages/api/src/pricing/pricing.service.ts` (+ test) — new constants.
- `packages/shared/src/jira-worklog.ts` (+ test) — return-type change.
- `packages/api/src/session-mcp/session-mcp.service.ts` (+ test) — new
  `logWork` method, inject `PricingService`.
- `packages/api/src/session-mcp/session-mcp.server.ts` (+ test) — new
  `log-work` tool registration.
- `packages/api/src/session-mcp/session-mcp.module.ts` — wire `PricingService`.
- `packages/hook-claude-code/src/index.ts` — no functional change; verify it
  still compiles against the new `createJiraWorklog` return type (it already
  ignores the return value via `await createJiraWorklog({...})` with no
  assignment).

No Prisma schema change, no migration.

## 7. Risks / Open Notes

- `costUsd` can be `null` for sessions whose model pricing is unknown (see
  `PricingService.calculateCost`) — `log-work` correctly refuses in that case
  rather than logging a meaningless duration.
- The Stop hook's hardcoded `1 USD = 4,000,000 BT` rate and this tool's live
  `PricingService` rate can diverge; both are pre-existing/accepted sources
  of BT math (the hook's is informational comment text either way, and the
  hour math here doesn't depend on BT at all — only on `costUsd` directly).
  Worth a future cleanup to unify, not addressed here.
- `log-work` does not guard against being called multiple times for the same
  session (each call posts a new worklog entry to Jira for the then-current
  `costUsd`). Acceptable for now — the agent is expected to call it once per
  logical unit of work; no dedup/idempotency key exists in Jira's worklog API
  that we use here.
