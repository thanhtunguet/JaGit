import { describe, it, expect, vi } from "vitest";
import { buildGraph } from "./graph.js";

vi.mock("@jigit/shared", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    publishEvent: vi.fn().mockResolvedValue(undefined),
    loadConfig: () => ({
      redisUrl: "redis://localhost:6379",
      approvalTimeoutMs: 100,
    }),
  };
});

vi.mock("./approval.js", () => ({
  awaitApproval: vi.fn().mockResolvedValue("allow"),
}));

let stepCounter = 0;

const makeSink = () => {
  stepCounter = 0;
  return {
    setStatus: vi.fn().mockResolvedValue(undefined),
    setUsage: vi.fn().mockResolvedValue(undefined),
    startStep: vi.fn().mockImplementation(async () => `step-${++stepCounter}`),
    finishStep: vi.fn().mockResolvedValue(undefined),
    addEvent: vi.fn().mockResolvedValue(undefined),
  };
};

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
    ensureRepo: vi.fn().mockResolvedValue("_works/repo"),
    createWorktree: vi.fn().mockResolvedValue("_works/repo/.worktrees/bugfix/jigit-7-fix-login"),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    hasChanges: vi.fn().mockResolvedValue(true),
    commitAll: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
  },
  acp: {
    run: vi.fn().mockResolvedValue({ stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 }), // (prompt, onPermission, cwd)
  },
  repoMapping: {
    gitlabProjectId: "proj-5",
    defaultBaseBranch: "main",
    branchPrefixRules: { Bug: "bugfix/", Story: "feature/", default: "feature/" },
  },
  sink: makeSink(),
  signals: makeSignals(),
  prisma: {
    job: {
      update: vi.fn().mockResolvedValue(undefined),
    },
    approval: {
      create: vi.fn().mockResolvedValue({ id: "appr-mock-1" }),
      updateMany: vi.fn().mockResolvedValue(undefined),
    },
  },
  sendTelegram: vi.fn().mockResolvedValue(undefined),
});

describe("buildGraph", () => {
  it("runs to done and records mrUrl", async () => {
    const deps = fakeDeps();
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.mrUrl).toBe("https://gitlab/mr/1");
    expect(deps.sink.setUsage).toHaveBeenCalledWith("j-1", 100, 0.05);
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

  it("emits step_error and marks step failed when openMergeRequest throws", async () => {
    const deps = fakeDeps();
    deps.gitlab.openMergeRequest = vi.fn().mockRejectedValue(new Error("gitlab 403"));
    const graph = buildGraph(deps as any);

    await expect(graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" })).rejects.toThrow("gitlab 403");

    expect(deps.sink.addEvent).toHaveBeenCalledWith(
      "j-1",
      expect.objectContaining({
        type: "step_error",
        level: "error",
        message: expect.stringContaining("openMergeRequest"),
      }),
    );
    expect(deps.sink.finishStep).toHaveBeenCalledWith(
      expect.stringMatching(/^step-\d+$/),
      "failed",
      expect.objectContaining({ error: "gitlab 403" }),
    );
    expect(deps.sink.setStatus).not.toHaveBeenCalledWith("j-1", "done");
  });

  it("publishes approval_requested to approvalsChannel when permission is needed", async () => {
    const deps = fakeDeps();
    // Override acp.run to invoke the permission callback once
    deps.acp.run = vi.fn().mockImplementation(
      async (_prompt: string, onPermission: (req: any) => Promise<string>, _cwd: string) => {
        await onPermission({
          toolCall: { name: "bash" },
          options: [{ optionId: "allow", name: "Allow" }, { optionId: "deny", name: "Deny" }],
        });
        return { stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 };
      },
    );
    // awaitApproval will be mocked by faking the control signal inline —
    // but since awaitApproval subscribes to Redis which isn't available, we mock it:
    const graph = buildGraph(deps as any);
    const { publishEvent: mockPublishEvent } = await import("@jigit/shared");

    // awaitApproval will timeout after approvalTimeoutMs (100ms), that's fine
    await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" }).catch(() => {});

    expect(mockPublishEvent).toHaveBeenCalledWith(
      "redis://localhost:6379",
      "approvals",
      expect.objectContaining({ type: "approval_requested", approvalId: "appr-mock-1" }),
    );
  });
});
