import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { join } from "node:path";
import { deriveBranchName, publishEvent, approvalsChannel, loadConfig } from "@jigit/shared";
import type { PrismaClient } from "@jigit/shared";
import type { IJiraAdapter, IGitlabAdapter, IGitAdapter, IJobSink, ISignals } from "./adapters/interfaces.js";
import type { RunResult, PermissionRequest } from "./acp/client.js";
import { awaitApproval } from "./approval.js";

export interface GraphDeps {
  jira: IJiraAdapter;
  gitlab: IGitlabAdapter;
  git: IGitAdapter;
  acp: { run(prompt: string, onPermission: (req: PermissionRequest) => Promise<string>, cwd: string): Promise<RunResult> };
  repoMapping: { gitlabProjectId: string; defaultBaseBranch: string; branchPrefixRules: Record<string, string> };
  sink: IJobSink;
  signals: ISignals;
  prisma: PrismaClient;
  sendTelegram(text: string): Promise<void>;
}

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
});

export type JobState = typeof JobStateAnnotation.State;

export function buildGraph(deps: GraphDeps): { run(input: { jobId: string; jiraIssueKey: string }): Promise<JobState> } {
  const { jira, gitlab, git, acp, repoMapping, sink, signals, prisma, sendTelegram } = deps;

  // ── nodes ──────────────────────────────────────────────────────────────────

  async function resolveContext(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "resolveContext");
    const issue = await jira.getIssue(state.jiraIssueKey);
    const branch = deriveBranchName(
      { key: issue.key, type: issue.type, summary: issue.summary },
      repoMapping.branchPrefixRules,
    );
    await sink.addEvent(state.jobId, { type: "context_resolved", message: `Branch: ${branch}` });
    await sink.finishStep(stepId, "done");
    return {
      issueType: issue.type,
      issueSummary: issue.summary,
      issueDescription: issue.description,
      branchName: branch,
    };
  }

  async function cloneRepo(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "cloneRepo");
    const cloneUrl = gitlab.cloneUrlWithToken(repoMapping.gitlabProjectId);
    // Derive a safe directory name from the projectId (last path segment)
    const repoName = repoMapping.gitlabProjectId.split("/").pop() ?? repoMapping.gitlabProjectId;
    const repoDir = await git.ensureRepo(cloneUrl, repoName);
    await sink.addEvent(state.jobId, { type: "repo_cloned", message: `Repo ready at ${repoDir}` });
    await sink.finishStep(stepId, "done");
    return { repoDir };
  }

  async function createBranch(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "createBranch");
    const workdir = await git.createWorktree(state.repoDir, state.branchName);
    await sink.addEvent(state.jobId, { type: "branch_created", message: `Worktree: ${workdir}` });
    await sink.finishStep(stepId, "done");
    return { workdir };
  }

  async function runAgent(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "runAgent");
    const prompt = [
      `Issue: ${state.jiraIssueKey} — ${state.issueSummary}`,
      `Type: ${state.issueType}`,
      `Description: ${state.issueDescription}`,
      `Working directory: ${state.workdir}`,
      `Target branch: ${state.branchName}`,
    ].join("\n");

    const result = await acp.run(prompt, async (req) => {
      // Create an Approval row in Postgres
      const approval = await prisma.approval.create({
        data: {
          jobId: state.jobId,
          kind: "tool_permission",
          prompt: `Allow tool: ${req.toolCall.name}`,
          options: req.options as any,
          status: "pending",
        },
      });

      // Notify dashboard via SSE (job channel)
      await sink.addEvent(state.jobId, {
        type: "approval_requested",
        message: `Approval required: ${req.toolCall.name}`,
        payload: { approvalId: approval.id, options: req.options },
      });

      // Publish to global approvals channel so the Approvals page receives it
      publishEvent(loadConfig().redisUrl, approvalsChannel, {
        type: "approval_requested",
        approvalId: approval.id,
        jobId: state.jobId,
        prompt: `Allow tool: ${req.toolCall.name}`,
        options: req.options,
      }).catch(console.error);

      // Telegram notification is best-effort
      sendTelegram(
        `Approval needed for job ${state.jobId}: allow ${req.toolCall.name}?`
      ).catch(console.error);

      return awaitApproval({
        approvalId: approval.id,
        jobId: state.jobId,
        denyOptionId:
          req.options.find((o) => o.optionId.includes("deny"))?.optionId ?? "deny",
        resolveApproval: async (id, optionId, via) => {
          await prisma.approval.updateMany({
            where: { id, status: "pending" },
            data: {
              status: optionId.startsWith("deny") ? "rejected" : "approved",
              chosenOptionId: optionId,
              decidedVia: via,
              decidedBy: "system",
              decidedAt: new Date(),
            },
          });
        },
      });
    }, state.workdir);

    await sink.addEvent(state.jobId, {
      type: "agent_done",
      message: `Stop: ${result.stopReason}, tokens: ${result.tokensUsed}`,
      payload: result,
    });
    await sink.finishStep(stepId, "done");
    return {};
  }

  async function commitAndPush(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "commitAndPush");
    const hasChanges = await git.hasChanges(state.workdir);
    if (hasChanges) {
      await git.commitAll(state.workdir, `feat: ${state.jiraIssueKey} — ${state.issueSummary}`);
      await git.push(state.workdir, state.branchName);
      await sink.addEvent(state.jobId, { type: "committed_and_pushed", message: `Branch: ${state.branchName}` });
    } else {
      await sink.addEvent(state.jobId, { type: "no_changes", message: "No changes to commit" });
    }
    await sink.finishStep(stepId, "done");
    return {};
  }

  async function openMergeRequest(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "openMergeRequest");
    const mr = await gitlab.openMergeRequest({
      projectId: repoMapping.gitlabProjectId,
      sourceBranch: state.branchName,
      targetBranch: repoMapping.defaultBaseBranch,
      title: `${state.jiraIssueKey}: ${state.issueSummary}`,
      description: `Closes ${state.jiraIssueKey}\n\n${state.issueDescription}`,
    });
    await sink.addEvent(state.jobId, { type: "mr_opened", message: mr.webUrl });
    await sink.finishStep(stepId, "done");
    return { mrUrl: mr.webUrl };
  }

  async function jiraWorklog(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "jiraWorklog");
    await jira.addWorklog(state.jiraIssueKey, `MR opened: ${state.mrUrl}`);
    await sink.finishStep(stepId, "done");
    return {};
  }

  async function report(state: JobState): Promise<Partial<JobState>> {
    const stepId = await sink.startStep(state.jobId, "report");
    await sendTelegram(`✅ ${state.jiraIssueKey} done\nMR: ${state.mrUrl}`);
    await sink.setStatus(state.jobId, "done");
    await sink.finishStep(stepId, "done");
    return { status: "done" };
  }

  async function stop(state: JobState): Promise<Partial<JobState>> {
    await sink.setStatus(state.jobId, "stopped");
    await sink.addEvent(state.jobId, { type: "stopped", message: "Job stopped by signal" });
    return { status: "stopped" };
  }

  // ── conditional edge: stop check ──────────────────────────────────────────

  function stopCheck(state: JobState) {
    return signals.shouldStop(state.jobId) ? "stop" : "continue";
  }

  // ── graph wiring ──────────────────────────────────────────────────────────

  const graph = new StateGraph(JobStateAnnotation)
    .addNode("resolveContext", resolveContext)
    .addNode("cloneRepo", cloneRepo)
    .addNode("createBranch", createBranch)
    .addNode("runAgent", runAgent)
    .addNode("commitAndPush", commitAndPush)
    .addNode("openMergeRequest", openMergeRequest)
    .addNode("jiraWorklog", jiraWorklog)
    .addNode("report", report)
    .addNode("stop", stop)
    .addEdge("__start__", "resolveContext")
    .addEdge("resolveContext", "cloneRepo")
    .addEdge("cloneRepo", "createBranch")
    .addConditionalEdges("createBranch", stopCheck, { stop: "stop", continue: "runAgent" })
    .addEdge("runAgent", "commitAndPush")
    .addEdge("commitAndPush", "openMergeRequest")
    .addEdge("openMergeRequest", "jiraWorklog")
    .addEdge("jiraWorklog", "report")
    .addEdge("report", END)
    .addEdge("stop", END)
    .compile();

  return {
    async run(input: { jobId: string; jiraIssueKey: string }): Promise<JobState> {
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
      return result as JobState;
    },
  };
}
