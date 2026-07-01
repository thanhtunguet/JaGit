# Telegram MR Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `Job.mrUrl` when a merge request is opened, and make the Telegram job-report message reflect the coding agent's own explanation of its work instead of two hardcoded strings.

**Architecture:** Three small, independent changes to `packages/worker/src/graph.ts` (plus one new exported helper in `packages/shared/src/mcp-servers.ts`): (1) persist `mrUrl` to the `Job` row in `openMergeRequest`, (2) add a standing "summarize your work" instruction appended to every agent prompt, (3) capture the agent's trailing text output as `state.agentSummary` and use it (plus the real `mrUrl`/`hasChanges` facts) to compose the final Telegram message in `report()`.

**Tech Stack:** TypeScript, LangGraph.js (`StateGraph`/`Annotation`), Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-telegram-mr-report-design.md`

---

### Task 1: Persist `mrUrl` when the merge request is opened

**Goal:** `Job.mrUrl` in the database reflects the real MR URL as soon as `openMergeRequest` succeeds, instead of staying null forever.

**Files:**
- Modify: `packages/worker/src/graph.ts:200-212` (the `openMergeRequest` node)
- Test: `packages/worker/src/graph.test.ts:85-92` (the "runs to done and records mrUrl" test)

**Acceptance Criteria:**
- [ ] After a successful `gitlab.openMergeRequest` call, `prisma.job.update` is called with `{ where: { id: state.jobId }, data: { mrUrl: <the returned webUrl> } }`.
- [ ] The existing "runs to done and records mrUrl" test asserts this call happened.

**Verify:** `pnpm --filter @jigit/worker test -- graph.test.ts` → all tests pass, including the new assertion.

**Steps:**

- [ ] **Step 1: Extend the existing test to assert the persistence call**

In `packages/worker/src/graph.test.ts`, the test currently reads:

```ts
  it("runs to done and records mrUrl", async () => {
    const deps = fakeDeps();
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.mrUrl).toBe("https://gitlab/mr/1");
    expect(deps.sink.setUsage).toHaveBeenCalledWith("j-1", 100, 0.05);
    expect(deps.sink.setStatus).toHaveBeenCalledWith("j-1", "done");
  });
```

Add an assertion for the new persistence call (the `fakeDeps()` mock's `prisma.job.update` already resolves to `undefined` for any call, so no mock changes are needed):

```ts
  it("runs to done and records mrUrl", async () => {
    const deps = fakeDeps();
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.mrUrl).toBe("https://gitlab/mr/1");
    expect(deps.sink.setUsage).toHaveBeenCalledWith("j-1", 100, 0.05);
    expect(deps.sink.setStatus).toHaveBeenCalledWith("j-1", "done");
    expect(deps.prisma.job.update).toHaveBeenCalledWith({
      where: { id: "j-1" },
      data: { mrUrl: "https://gitlab/mr/1" },
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @jigit/worker test -- graph.test.ts -t "runs to done and records mrUrl"`
Expected: FAIL — `expect(deps.prisma.job.update).toHaveBeenCalledWith(...)` does not match any recorded call (the call with `mrUrl` was never made; `job.update` was only called once, from `createBranch`, with `{ workdir, branch }`).

- [ ] **Step 3: Persist `mrUrl` in `openMergeRequest`**

In `packages/worker/src/graph.ts`, the `openMergeRequest` node currently reads:

```ts
  async function openMergeRequest(state: JobState): Promise<Partial<JobState>> {
    return runStep(sink, state.jobId, "openMergeRequest", async () => {
      const mr = await gitlab.openMergeRequest({
        projectId: repoMapping.gitlabProjectId,
        sourceBranch: state.branchName,
        targetBranch: repoMapping.defaultBaseBranch,
        title: `${state.jiraIssueKey}: ${state.issueSummary}`,
        description: `Closes ${state.jiraIssueKey}\n\n${state.issueDescription}`,
      });
      await sink.addEvent(state.jobId, { type: "mr_opened", message: mr.webUrl });
      return { mrUrl: mr.webUrl };
    });
  }
```

Add the persistence call right after the MR is created, mirroring the existing pattern in `createBranch` (which persists `workdir`/`branch` to the `Job` row the same way):

```ts
  async function openMergeRequest(state: JobState): Promise<Partial<JobState>> {
    return runStep(sink, state.jobId, "openMergeRequest", async () => {
      const mr = await gitlab.openMergeRequest({
        projectId: repoMapping.gitlabProjectId,
        sourceBranch: state.branchName,
        targetBranch: repoMapping.defaultBaseBranch,
        title: `${state.jiraIssueKey}: ${state.issueSummary}`,
        description: `Closes ${state.jiraIssueKey}\n\n${state.issueDescription}`,
      });
      await prisma.job.update({ where: { id: state.jobId }, data: { mrUrl: mr.webUrl } });
      await sink.addEvent(state.jobId, { type: "mr_opened", message: mr.webUrl });
      return { mrUrl: mr.webUrl };
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jigit/worker test -- graph.test.ts`
Expected: PASS — all tests in `graph.test.ts` pass, including the new assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/graph.ts packages/worker/src/graph.test.ts
git commit -m "feat(worker): persist mrUrl to Job row when merge request opens"
```

---

### Task 2: Add `buildReportInstruction` and wire it into the agent prompt

**Goal:** Every agent run is instructed to end its final message with a concise summary of what it changed, so that summary can later be relayed as the job's status report.

**Files:**
- Modify: `packages/shared/src/mcp-servers.ts` (add new exported function after `buildReviewInstruction`)
- Test: `packages/shared/src/mcp-servers.test.ts` (add a new `describe` block)
- Modify: `packages/worker/src/graph.ts:140-148` (the `runAgent` prompt-parts array)

**Acceptance Criteria:**
- [ ] `buildReportInstruction()` is exported from `packages/shared/src/mcp-servers.ts` and re-exported from `@jigit/shared` (via the existing `export * from "./mcp-servers.js"` in `packages/shared/src/index.ts` — no changes needed there).
- [ ] `runAgent`'s prompt includes the instruction's text on every run, unconditionally (unlike `buildReviewInstruction`, which is conditional on `agentTemplate.requireReviewBeforeCommit`).

**Verify:** `pnpm --filter @jigit/shared test -- mcp-servers.test.ts` → new test passes. `pnpm --filter @jigit/worker build` → compiles clean.

**Steps:**

- [ ] **Step 1: Write the failing test for `buildReportInstruction`**

In `packages/shared/src/mcp-servers.test.ts`, add a new import and `describe` block:

```ts
import { buildAcpMcpServers, isAcpMcpServerHttp, buildReportInstruction } from "./mcp-servers.js";
```

```ts
describe("buildReportInstruction", () => {
  it("instructs the agent to summarize its work for a non-technical reader", () => {
    const instruction = buildReportInstruction();
    expect(instruction).toContain("summary");
    expect(instruction).toContain("non-technical");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @jigit/shared test -- mcp-servers.test.ts -t "buildReportInstruction"`
Expected: FAIL with a TypeScript/import error — `buildReportInstruction` is not exported from `./mcp-servers.js`.

- [ ] **Step 3: Add `buildReportInstruction` to `mcp-servers.ts`**

In `packages/shared/src/mcp-servers.ts`, the file currently ends with:

```ts
/** Instruction appended to agent prompt when review before commit is required. */
export function buildReviewInstruction(): string {
  return [
    "Before you finish your work, you MUST call the MCP tool `jigit_request_review`",
    "with a summary of your changes and wait for human approval.",
    "Do not consider the task complete until review is approved.",
  ].join(" ");
}
```

Add a new function after it:

```ts

/** Instruction appended to every agent prompt so its final message can be relayed as the job's status report. */
export function buildReportInstruction(): string {
  return [
    "End your final message with a concise 2-4 sentence summary of what you changed",
    "and why, written for a non-technical reader — it will be relayed to them directly.",
  ].join(" ");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jigit/shared test -- mcp-servers.test.ts`
Expected: PASS — all tests in `mcp-servers.test.ts` pass.

- [ ] **Step 5: Wire the instruction into `runAgent`'s prompt unconditionally**

In `packages/worker/src/graph.ts`, the import line currently reads:

```ts
import { deriveBranchName, publishEvent, approvalsChannel, loadConfig, buildReviewInstruction } from "@jigit/shared";
```

Add `buildReportInstruction` to the import:

```ts
import { deriveBranchName, publishEvent, approvalsChannel, loadConfig, buildReviewInstruction, buildReportInstruction } from "@jigit/shared";
```

The `runAgent` node currently builds its prompt like this:

```ts
      const parts = [
        agentTemplate.systemPrompt,
        agentTemplate.requireReviewBeforeCommit ? buildReviewInstruction() : "",
        `Issue: ${state.jiraIssueKey} — ${state.issueSummary}`,
        `Type: ${state.issueType}`,
        `Description: ${state.issueDescription}`,
        `Working directory: ${state.workdir}`,
        `Target branch: ${state.branchName}`,
      ].filter(Boolean);
```

Add `buildReportInstruction()` unconditionally, right after `buildReviewInstruction()`:

```ts
      const parts = [
        agentTemplate.systemPrompt,
        agentTemplate.requireReviewBeforeCommit ? buildReviewInstruction() : "",
        buildReportInstruction(),
        `Issue: ${state.jiraIssueKey} — ${state.issueSummary}`,
        `Type: ${state.issueType}`,
        `Description: ${state.issueDescription}`,
        `Working directory: ${state.workdir}`,
        `Target branch: ${state.branchName}`,
      ].filter(Boolean);
```

- [ ] **Step 6: Verify the worker package still builds and its existing tests still pass**

Run: `pnpm --filter @jigit/worker build && pnpm --filter @jigit/worker test -- graph.test.ts`
Expected: build succeeds; all tests in `graph.test.ts` still pass (no test currently asserts on prompt contents, so none should break).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/mcp-servers.ts packages/shared/src/mcp-servers.test.ts packages/worker/src/graph.ts
git commit -m "feat(shared,worker): add buildReportInstruction and append it to every agent prompt"
```

---

### Task 3: Capture the agent's final summary and compose the Telegram report from it

**Goal:** The `report` step's Telegram message is built from the agent's own trailing text output and the real `mrUrl`/`hasChanges` facts, replacing the two hardcoded strings.

**Files:**
- Modify: `packages/worker/src/graph.ts` (`JobStateAnnotation`, the `runAgent` node's `onOutput` callback, the `report` node)
- Test: `packages/worker/src/graph.test.ts` (the "runs to done and records mrUrl" and "skips openMergeRequest and jiraWorklog when there are no changes" tests)

**Acceptance Criteria:**
- [ ] `JobStateAnnotation` has a new `agentSummary: Annotation<string>()` field.
- [ ] `runAgent` returns `{ agentSummary }` populated from the agent's last uninterrupted run of `kind: "text"` output chunks (a `tool_use`/`tool_result` chunk resets the buffer).
- [ ] `report()` builds the Telegram message from `state.agentSummary` and `state.mrUrl` per the spec's template strings, falling back to `"No changes were made."` only when `agentSummary` is empty and there's no `mrUrl`.
- [ ] Both updated tests pass, and the assertions check the agent's own text appears in the message (not the old hardcoded wording).

**Verify:** `pnpm --filter @jigit/worker test -- graph.test.ts` → all tests pass.

**Steps:**

- [ ] **Step 1: Write the failing test for the "runs to done" case**

In `packages/worker/src/graph.test.ts`, the `acp.run` mock in `fakeDeps()` currently reads:

```ts
  acp: {
    run: vi.fn().mockResolvedValue({ stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 }), // (prompt, onPermission, cwd)
  },
```

Change it to a `mockImplementation` that invokes the `onOutput` callback (3rd positional argument) with a trailing text chunk before resolving, so every test that doesn't override `acp.run` exercises the new capture logic:

```ts
  acp: {
    run: vi.fn().mockImplementation(
      async (_prompt: string, _onPermission: any, onOutput: (o: any) => void) => {
        onOutput({ kind: "text", text: "Fixed the login bug by validating the session token." });
        return { stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 };
      },
    ),
  },
```

Then update the "runs to done and records mrUrl" test (already extended in Task 1) to assert the composed Telegram message:

```ts
  it("runs to done and records mrUrl", async () => {
    const deps = fakeDeps();
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.mrUrl).toBe("https://gitlab/mr/1");
    expect(final.agentSummary).toBe("Fixed the login bug by validating the session token.");
    expect(deps.sink.setUsage).toHaveBeenCalledWith("j-1", 100, 0.05);
    expect(deps.sink.setStatus).toHaveBeenCalledWith("j-1", "done");
    expect(deps.prisma.job.update).toHaveBeenCalledWith({
      where: { id: "j-1" },
      data: { mrUrl: "https://gitlab/mr/1" },
    });
    expect(deps.sendTelegram).toHaveBeenCalledWith(
      expect.stringContaining("Fixed the login bug by validating the session token."),
    );
    expect(deps.sendTelegram).toHaveBeenCalledWith(
      expect.stringContaining("https://gitlab/mr/1"),
    );
  });
```

Also update the permission-callback test later in the file (it overrides `acp.run` itself, see Step 1b below).

- [ ] **Step 1b: Update the permission-request test's `acp.run` override to match the new 3-argument callback shape**

The "publishes approval_requested to approvalsChannel when permission is needed" test currently overrides `acp.run` like this:

```ts
    deps.acp.run = vi.fn().mockImplementation(
      async (_prompt: string, onPermission: (req: any) => Promise<string>, _cwd: string) => {
        await onPermission({
          toolCall: { name: "bash" },
          options: [{ optionId: "allow", name: "Allow" }, { optionId: "deny", name: "Deny" }],
        });
        return { stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 };
      },
    );
```

This test's signature comment (`_cwd` as the 3rd arg) was already stale before this task — the real `acp.run` signature is `(prompt, onPermission, onOutput, cwd)` (see `GraphDeps.acp.run` in `graph.ts:14`). Leave this test's behavior as-is (it doesn't call the 3rd arg, so no `onOutput` invocation happens and `agentSummary` stays empty) — it only asserts on `publishEvent`, which is unaffected. No change needed here; this step exists to confirm during implementation that the test still passes unmodified.

- [ ] **Step 2: Write the failing test for the "no changes" case**

The "skips openMergeRequest and jiraWorklog when there are no changes" test currently reads:

```ts
  it("skips openMergeRequest and jiraWorklog when there are no changes", async () => {
    const deps = fakeDeps();
    deps.git.hasChanges = vi.fn().mockResolvedValue(false);
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });

    expect(final.status).toBe("done");
    expect(final.mrUrl).toBeFalsy();
    expect(deps.git.commitAll).not.toHaveBeenCalled();
    expect(deps.git.push).not.toHaveBeenCalled();
    expect(deps.gitlab.openMergeRequest).not.toHaveBeenCalled();
    expect(deps.jira.addWorklog).not.toHaveBeenCalled();
    expect(deps.sendTelegram).toHaveBeenCalledWith(expect.stringContaining("No changes"));
  });
```

Override `acp.run` in this test to emit a different trailing summary, and replace the last assertion to check for the agent's own words instead of the old hardcoded wording:

```ts
  it("skips openMergeRequest and jiraWorklog when there are no changes", async () => {
    const deps = fakeDeps();
    deps.git.hasChanges = vi.fn().mockResolvedValue(false);
    deps.acp.run = vi.fn().mockImplementation(
      async (_prompt: string, _onPermission: any, onOutput: (o: any) => void) => {
        onOutput({ kind: "text", text: "No code changes were needed — the behavior already matched the issue." });
        return { stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 };
      },
    );
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });

    expect(final.status).toBe("done");
    expect(final.mrUrl).toBeFalsy();
    expect(final.agentSummary).toBe("No code changes were needed — the behavior already matched the issue.");
    expect(deps.git.commitAll).not.toHaveBeenCalled();
    expect(deps.git.push).not.toHaveBeenCalled();
    expect(deps.gitlab.openMergeRequest).not.toHaveBeenCalled();
    expect(deps.jira.addWorklog).not.toHaveBeenCalled();
    expect(deps.sendTelegram).toHaveBeenCalledWith(
      expect.stringContaining("No code changes were needed — the behavior already matched the issue."),
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @jigit/worker test -- graph.test.ts`
Expected: FAIL — `final.agentSummary` is `undefined` (no such state field yet), and the `sendTelegram` assertions don't match the still-hardcoded messages.

- [ ] **Step 4: Add `agentSummary` to `JobStateAnnotation`**

In `packages/worker/src/graph.ts`, `JobStateAnnotation` currently reads:

```ts
const JobStateAnnotation = Annotation.Root({
  jobId: Annotation<string>(),
  jiraIssueKey: Annotation<string>(),
  issueType: Annotation<string>(),
  issueSummary: Annotation<string>(),
  issueDescription: Annotation<string>(),
  branchName: Annotation<string>(),
  /** Bare repo dir: _works/<repoName>/ */
  repoDir: Annotation<string>(),
  /** Worktree path: repoDir/.worktrees/<branch> — this is where the agent works */
  workdir: Annotation<string>(),
  mrUrl: Annotation<string>(),
  status: Annotation<string>(),
  hasChanges: Annotation<boolean>(),
});
```

Add the new field after `mrUrl`:

```ts
const JobStateAnnotation = Annotation.Root({
  jobId: Annotation<string>(),
  jiraIssueKey: Annotation<string>(),
  issueType: Annotation<string>(),
  issueSummary: Annotation<string>(),
  issueDescription: Annotation<string>(),
  branchName: Annotation<string>(),
  /** Bare repo dir: _works/<repoName>/ */
  repoDir: Annotation<string>(),
  /** Worktree path: repoDir/.worktrees/<branch> — this is where the agent works */
  workdir: Annotation<string>(),
  mrUrl: Annotation<string>(),
  /** Agent's last uninterrupted text output — relayed as the Telegram report body. */
  agentSummary: Annotation<string>(),
  status: Annotation<string>(),
  hasChanges: Annotation<boolean>(),
});
```

Also add `agentSummary: ""` to the initial state object passed to `graph.invoke` in the `run` method at the bottom of the file, which currently reads:

```ts
      const result = await graph.invoke({
        jobId: input.jobId,
        jiraIssueKey: input.jiraIssueKey,
        issueType: "",
        issueSummary: "",
        issueDescription: "",
        branchName: "",
        repoDir: "",
        workdir: "",
        mrUrl: "",
        status: "running",
      });
```

becomes:

```ts
      const result = await graph.invoke({
        jobId: input.jobId,
        jiraIssueKey: input.jiraIssueKey,
        issueType: "",
        issueSummary: "",
        issueDescription: "",
        branchName: "",
        repoDir: "",
        workdir: "",
        mrUrl: "",
        agentSummary: "",
        status: "running",
      });
```

- [ ] **Step 5: Capture trailing text output in `runAgent`**

In `packages/worker/src/graph.ts`, the `runAgent` node currently reads:

```ts
  async function runAgent(state: JobState): Promise<Partial<JobState>> {
    return runStep(sink, state.jobId, "runAgent", async () => {
      const parts = [
        agentTemplate.systemPrompt,
        agentTemplate.requireReviewBeforeCommit ? buildReviewInstruction() : "",
        buildReportInstruction(),
        `Issue: ${state.jiraIssueKey} — ${state.issueSummary}`,
        `Type: ${state.issueType}`,
        `Description: ${state.issueDescription}`,
        `Working directory: ${state.workdir}`,
        `Target branch: ${state.branchName}`,
      ].filter(Boolean);

      const prompt = parts.join("\n\n");

      const result = await acp.run(
        prompt,
        (req) => requestToolApproval(state, req),
        (output) => {
          let message = "";
          if (output.kind === "text" && output.text) message = output.text;
          else if (output.kind === "tool_use" && output.toolCall) message = `→ ${output.toolCall.name}`;
          else if (output.kind === "tool_result" && output.toolResult) {
            message = output.toolResult.error
              ? `✗ ${output.toolResult.error}`
              : `✓ ${String(output.toolResult.output).slice(0, 200)}`;
          }
          if (message) {
            sink.addEvent(state.jobId, {
              type: "agent_output",
              message,
              level: output.kind === "tool_result" && output.toolResult?.error ? "error" : "info",
              payload: { kind: output.kind },
            }).catch(console.error);
          }
        },
        state.workdir,
      );

      await sink.addEvent(state.jobId, {
        type: "agent_done",
        message: `Stop: ${result.stopReason}, tokens: ${result.tokensUsed}`,
        payload: result,
      });
      await sink.setUsage(state.jobId, result.tokensUsed, result.costUsd);
      return {};
    });
  }
```

Add a `summaryBuffer` array scoped to the call, push/clear it inside the `onOutput` callback, and return it as `agentSummary`:

```ts
  async function runAgent(state: JobState): Promise<Partial<JobState>> {
    return runStep(sink, state.jobId, "runAgent", async () => {
      const parts = [
        agentTemplate.systemPrompt,
        agentTemplate.requireReviewBeforeCommit ? buildReviewInstruction() : "",
        buildReportInstruction(),
        `Issue: ${state.jiraIssueKey} — ${state.issueSummary}`,
        `Type: ${state.issueType}`,
        `Description: ${state.issueDescription}`,
        `Working directory: ${state.workdir}`,
        `Target branch: ${state.branchName}`,
      ].filter(Boolean);

      const prompt = parts.join("\n\n");
      const summaryBuffer: string[] = [];

      const result = await acp.run(
        prompt,
        (req) => requestToolApproval(state, req),
        (output) => {
          if (output.kind === "text" && output.text) {
            summaryBuffer.push(output.text);
          } else if (output.kind === "tool_use" || output.kind === "tool_result") {
            summaryBuffer.length = 0;
          }

          let message = "";
          if (output.kind === "text" && output.text) message = output.text;
          else if (output.kind === "tool_use" && output.toolCall) message = `→ ${output.toolCall.name}`;
          else if (output.kind === "tool_result" && output.toolResult) {
            message = output.toolResult.error
              ? `✗ ${output.toolResult.error}`
              : `✓ ${String(output.toolResult.output).slice(0, 200)}`;
          }
          if (message) {
            sink.addEvent(state.jobId, {
              type: "agent_output",
              message,
              level: output.kind === "tool_result" && output.toolResult?.error ? "error" : "info",
              payload: { kind: output.kind },
            }).catch(console.error);
          }
        },
        state.workdir,
      );

      await sink.addEvent(state.jobId, {
        type: "agent_done",
        message: `Stop: ${result.stopReason}, tokens: ${result.tokensUsed}`,
        payload: result,
      });
      await sink.setUsage(state.jobId, result.tokensUsed, result.costUsd);
      return { agentSummary: summaryBuffer.join("").trim() };
    });
  }
```

- [ ] **Step 6: Compose the report message from real facts**

In `packages/worker/src/graph.ts`, the `report` node currently reads:

```ts
  async function report(state: JobState): Promise<Partial<JobState>> {
    return runStep(sink, state.jobId, "report", async () => {
      const message = state.mrUrl
        ? `✅ ${state.jiraIssueKey} done\nMR: ${state.mrUrl}`
        : `✅ ${state.jiraIssueKey} done\nNo changes — no MR opened`;
      await sendTelegram(message);
      await sink.setStatus(state.jobId, "done");
      return { status: "done" };
    });
  }
```

Replace the message construction:

```ts
  async function report(state: JobState): Promise<Partial<JobState>> {
    return runStep(sink, state.jobId, "report", async () => {
      const message = state.mrUrl
        ? `✅ ${state.jiraIssueKey} done\n${state.agentSummary}\n\nMR: ${state.mrUrl}`
        : `✅ ${state.jiraIssueKey} done\n${state.agentSummary || "No changes were made."}`;
      await sendTelegram(message);
      await sink.setStatus(state.jobId, "done");
      return { status: "done" };
    });
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @jigit/worker test -- graph.test.ts`
Expected: PASS — all tests in `graph.test.ts` pass, including both updated tests and the unmodified permission-request test.

- [ ] **Step 8: Run the full worker test suite and build**

Run: `pnpm --filter @jigit/worker test && pnpm --filter @jigit/worker build`
Expected: all tests pass; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add packages/worker/src/graph.ts packages/worker/src/graph.test.ts
git commit -m "feat(worker): compose Telegram report from the agent's own summary"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers spec section "1. Persist mrUrl". Tasks 2+3 cover spec section "2. Capture the agent's own final summary" and "3. Compose the report from real facts". The spec's explicit non-goals (retry state seeding, new LLM call, new MCP tool, ACP session lifecycle changes) have no corresponding task, as intended.
- **Type consistency:** `agentSummary` is named identically across `JobStateAnnotation` (Task 3 Step 4), the `runAgent` return value (Task 3 Step 5), the `report` node (Task 3 Step 6), and all test assertions (Task 3 Steps 1-2).
- **Test mock shape:** Task 3 Step 1 changes the shared `fakeDeps().acp.run` mock from `mockResolvedValue` to a `mockImplementation` that calls the 3rd positional arg (`onOutput`). This affects every test that doesn't override `acp.run` — confirmed safe in Step 1b (the permission-request test overrides `acp.run` itself) and Step 7 (full suite re-run).
