# Telegram report: persist mrUrl, make the message reflect real context

## Problem

Two related defects in the job pipeline's final report:

1. **`Job.mrUrl` is never persisted.** `openMergeRequest` (`packages/worker/src/graph.ts`)
   only sets `mrUrl` on in-memory LangGraph state. The Prisma `Job` model has an `mrUrl`
   column, and the dashboard reads it (`packages/dashboard/src/api/client.ts`), but
   nothing ever writes it — so the dashboard always shows a null MR link even after a
   successful merge request.
2. **The Telegram report text is two hardcoded strings.** `report()` in `graph.ts` picks
   between `"MR: ${mrUrl}"` and `"No changes — no MR opened"` based on `state.mrUrl`
   alone. The text never reflects what the agent actually did (which files, why), and
   on a retry that finds no new local changes (because a prior attempt already pushed
   them) the message can read "no changes" even though work was done — covered by the
   `mrUrl` fix above whenever `mrUrl` ends up being known at the time `report()` runs.
   This in-memory-state-loss-on-retry case is explicitly **out of scope** for this spec.

## Goals

- Persist `mrUrl` to the `Job` row as soon as the MR is opened.
- Make the Telegram report message describe what actually happened, using the coding
  agent's own explanation of its work rather than a fixed template string.

## Non-goals

- Fixing retry's loss of prior run state (`JobsService.retry()` re-running the graph
  from a blank initial state). Happy-path only for this spec.
- Any new LLM call, new MCP tool, or change to ACP session lifecycle.

## Design

### 1. Persist `mrUrl`

In `openMergeRequest` (`graph.ts`), immediately after `gitlab.openMergeRequest`
succeeds, persist the result:

```ts
await prisma.job.update({ where: { id: state.jobId }, data: { mrUrl: mr.webUrl } });
```

This mirrors the existing pattern in `createBranch`, which already persists
`workdir`/`branch` to the `Job` row the same way.

### 2. Capture the agent's own final summary

Add a standing instruction to every agent run (not conditional, unlike
`buildReviewInstruction`), next to it in `packages/shared/src/mcp-servers.ts`:

```ts
/** Instruction appended to every agent prompt so its final message can be relayed as the job's status report. */
export function buildReportInstruction(): string {
  return [
    "End your final message with a concise 2-4 sentence summary of what you changed",
    "and why, written for a non-technical reader — it will be relayed to them directly.",
  ].join(" ");
}
```

`runAgent` appends this unconditionally to the prompt parts (alongside the existing
conditional `buildReviewInstruction()` call).

Add `agentSummary: Annotation<string>()` to `JobStateAnnotation`.

In `runAgent`'s `onOutput` callback, track the agent's trailing, uninterrupted text:

- Maintain a local buffer (array of strings) scoped to the `runAgent` call.
- On `kind === "text"`, push `output.text` onto the buffer.
- On `kind === "tool_use"` or `kind === "tool_result"`, clear the buffer — a tool call
  breaks the streak, so only text emitted *after* the last tool interaction counts as
  the final summary.
- After `acp.run` resolves, the buffer holds the agent's last uninterrupted message (if
  any). Join and trim it; return it as part of the step's partial state:
  `{ agentSummary: buffer.join("").trim() }`.

This requires no protocol changes — `onOutput` already receives these `kind: "text"` /
`kind: "tool_use"` / `kind: "tool_result"` events today (`graph.ts` lines ~155-172).

### 3. Compose the report from real facts

Replace the two-branch hardcoded message in `report()` with:

```ts
const message = state.mrUrl
  ? `✅ ${state.jiraIssueKey} done\n${state.agentSummary}\n\nMR: ${state.mrUrl}`
  : `✅ ${state.jiraIssueKey} done\n${state.agentSummary || "No changes were made."}`;
```

If the agent emitted no trailing text (`agentSummary` is empty) and there's an `mrUrl`,
the message still reads fine (`"✅ KEY done\n\n\nMR: ..."` has an extra blank line but no
broken content) — acceptable for the happy-path scope of this fix; no special-casing
needed.

## Testing

Extend `packages/worker/src/graph.test.ts`:

- In the "runs to done and records mrUrl" test: make the `acp.run` mock's `onOutput`
  callback (3rd positional arg) emit a trailing `{ kind: "text", text: "..." }` chunk
  before resolving, and assert the final Telegram message (via `deps.sendTelegram`)
  contains that text and the MR URL. Also assert `deps.prisma.job.update` was called
  with `{ mrUrl: "https://gitlab/mr/1" }` (the existing `fakeDeps` mock already
  resolves any `job.update` call with `undefined`, so no mock changes are needed).
- In the "skips openMergeRequest ... when there are no changes" test: emit a trailing
  text chunk from the agent (e.g. "No code changes were needed.") and assert it appears
  in the `sendTelegram` message, replacing the literal "No changes" assertion with a
  check that the agent's own text is what's relayed (string match on the agent's
  summary, not the implementation's old wording).

## Out of scope (noted for later)

- Retry seeding initial graph state from the existing `Job` row (`mrUrl`, `branch`) so
  a retry never "forgets" a previously opened MR. Flag if this surfaces again in
  practice.
