import { describe, it, expect, vi } from "vitest";
import { buildGraph } from "./graph.js";

const makeSink = () => ({
  setStatus: vi.fn().mockResolvedValue(undefined),
  startStep: vi.fn().mockResolvedValue("step-id-1"),
  finishStep: vi.fn().mockResolvedValue(undefined),
  addEvent: vi.fn().mockResolvedValue(undefined),
});

const makeSignals = (stop = false) => ({
  shouldStop: vi.fn().mockReturnValue(stop),
  shouldPause: vi.fn().mockReturnValue(false),
});

const fakeDeps = () => ({
  jira: {
    getIssue: vi.fn().mockResolvedValue({
      key: "JIGIT-7", type: "Bug", summary: "Fix login", description: "desc",
    }),
    addWorklog: vi.fn().mockResolvedValue(undefined),
  },
  gitlab: {
    cloneUrlWithToken: vi.fn().mockReturnValue("https://token@gitlab/repo.git"),
    openMergeRequest: vi.fn().mockResolvedValue({ webUrl: "https://gitlab/mr/1", iid: 1 }),
  },
  git: {
    clone: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    hasChanges: vi.fn().mockResolvedValue(true),
    commitAll: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
  },
  acp: {
    run: vi.fn().mockResolvedValue({ stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 }),
  },
  repoMapping: {
    gitlabProjectId: "proj-5",
    defaultBaseBranch: "main",
    branchPrefixRules: { Bug: "bugfix/", Story: "feature/", default: "feature/" },
  },
  sink: makeSink(),
  signals: makeSignals(),
  sendTelegram: vi.fn().mockResolvedValue(undefined),
});

describe("buildGraph", () => {
  it("runs to done and records mrUrl", async () => {
    const deps = fakeDeps();
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.mrUrl).toBe("https://gitlab/mr/1");
    expect(deps.sink.setStatus).toHaveBeenCalledWith("j-1", "done");
  });

  it("halts with status=stopped when stop signal fires before runAgent", async () => {
    const deps = fakeDeps();
    deps.signals.shouldStop = vi.fn().mockReturnValue(true);
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.status).toBe("stopped");
    expect(deps.acp.run).not.toHaveBeenCalled();
  });
});
