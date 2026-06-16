import { config } from "dotenv";
import type { IJiraAdapter, IGitlabAdapter, IGitAdapter } from "./adapters/interfaces.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from monorepo root before any config reads
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { createWorker, createQueue, loadConfig, decrypt, prisma, buildAcpMcpServers } from "@jigit/shared";
import { buildGraph } from "./graph.js";
import { JiraAdapter } from "./adapters/jira.js";
import { GitlabAdapter } from "./adapters/gitlab.js";
import { GitAdapter } from "./adapters/git.js";
import { AcpSession } from "./acp/client.js";
import { PrismaJobSink } from "./prisma-sink.js";
import type { GraphDeps } from "./graph.js";
import { Redis as IORedis } from "ioredis";
import TelegramBot from "node-telegram-bot-api";
import {
  registerRuntime,
  updateRuntime,
  cleanupJobRuntime,
  abortJobAgent,
  clearRuntime,
} from "./job-runtime.js";

const cfg = loadConfig();

/** Per-job stop/pause/delete flags driven by Redis control-channel messages */
class RedisSignals {
  private stopped = new Set<string>();
  private paused = new Set<string>();
  private deleted = new Set<string>();

  constructor(
    private redis: InstanceType<typeof IORedis>,
    private readonly jobId: string,
    private readonly onAbort: () => Promise<void>,
  ) {}

  listen() {
    this.redis.subscribe(`control:${this.jobId}`);
    this.redis.on("message", (_ch: string, msg: string) => {
      try {
        const signal = JSON.parse(msg);
        if (signal.jobId !== this.jobId) return;
        if (signal.type === "stop" || signal.type === "delete") {
          this.stopped.add(this.jobId);
          this.onAbort().catch(console.error);
        }
        if (signal.type === "delete") this.deleted.add(this.jobId);
        if (signal.type === "pause") this.paused.add(this.jobId);
        if (signal.type === "resume") this.paused.delete(this.jobId);
      } catch { /* ignore */ }
    });
  }

  shouldStop(jobId: string): boolean { return this.stopped.has(jobId); }
  shouldPause(jobId: string): boolean { return this.paused.has(jobId); }
  shouldDelete(jobId: string): boolean { return this.deleted.has(jobId); }
}

const telegramBot = new TelegramBot(cfg.telegramBotToken);

async function getCredential(kind: string, name: string) {
  const cred = await prisma.credential.findFirst({ where: { kind: kind as any, name } });
  if (!cred) throw new Error(`Credential not found: ${kind}/${name}`);
  const secrets = JSON.parse(decrypt((cred.secrets as { encrypted: string }).encrypted, cfg.encryptionKey));
  return { secrets, meta: cred.meta as Record<string, string> };
}

const worker = createWorker(
  cfg.redisUrl,
  async (job) => {
    const { jobId } = job.data as { jobId: string };
    const jobRow = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { agentTemplate: true },
    });
    const useFakeAdapters = process.env["JIGIT_FAKE_ADAPTERS"] === "1";

    const mapping = useFakeAdapters
      ? { gitlabProjectId: "fake-project", defaultBaseBranch: "main", branchPrefixRules: {} }
      : await prisma.repoMapping.findFirst({
          where: { jiraProjectKey: jobRow.jiraIssueKey?.split("-")[0] ?? "" },
        });
    if (!mapping) throw new Error(`No repo mapping for job ${jobId}`);

    const redisSignals = new RedisSignals(
      new IORedis(cfg.redisUrl, { maxRetriesPerRequest: null }) as InstanceType<typeof IORedis>,
      jobId,
      async () => { await abortJobAgent(jobId); },
    );
    redisSignals.listen();

    let jira: IJiraAdapter;
    let gitlab: IGitlabAdapter;
    let git: IGitAdapter;
    let acpRun: GraphDeps["acp"]["run"];
    let sendTelegram: GraphDeps["sendTelegram"];

    if (useFakeAdapters) {
      jira = {
        getIssue: async (key) => ({ key, type: "Bug", summary: "E2E test issue", description: "Auto-generated" }),
        addWorklog: async () => {},
      };
      gitlab = {
        cloneUrlWithToken: () => "fake://url",
        openMergeRequest: async () => ({ webUrl: "https://fake-mr/1", iid: 1 }),
      };
      git = {
        ensureRepo: async (_url, repoName) => `_works/${repoName}`,
        createWorktree: async (repoDir, branch) => `${repoDir}/.worktrees/${branch}`,
        removeWorktree: async () => {},
        hasChanges: async () => true,
        commitAll: async () => {},
        push: async () => {},
      };
      acpRun = async (_prompt, _onPerm, _onOutput, _cwd) => ({ stopReason: "end_turn", tokensUsed: 0, costUsd: 0 });
      sendTelegram = async () => {};
      registerRuntime(jobId, { acpSession: null, workdir: null, git });
    } else {
      const jiraCred = await getCredential("jira", "default");
      const gitlabCred = await getCredential("gitlab", "default");
      const anthropicCred = await getCredential("anthropic", "default");
      const telegramChatId = (
        await getCredential("telegram", "default")
      ).meta["chatId"] ?? "";

      jira = new JiraAdapter({
        baseUrl: jiraCred.meta["baseUrl"] ?? "",
        email: jiraCred.secrets["email"],
        token: jiraCred.secrets["token"],
        maxRetries: cfg.maxRetries,
      });
      gitlab = new GitlabAdapter({
        baseUrl: gitlabCred.meta["baseUrl"] ?? "",
        token: gitlabCred.secrets["token"],
        maxRetries: cfg.maxRetries,
      });
      git = new GitAdapter();
      registerRuntime(jobId, { acpSession: null, workdir: null, git });

      const template = jobRow.agentTemplate;
      const mcpIds = Array.isArray(template?.mcpServerIds)
        ? (template.mcpServerIds as string[])
        : [];
      const dbMcpConfigs = mcpIds.length
        ? await prisma.mcpServerConfig.findMany({ where: { id: { in: mcpIds } } })
        : [];
      const jigitServerPath = resolve(__dirname, "mcp", "jigit-server.js");

      acpRun = async (prompt, onPermission, onOutput, cwd) => {
        const mcpServers = await buildAcpMcpServers({
          template: {
            mcpServerIds: mcpIds,
            requireReviewBeforeCommit: template?.requireReviewBeforeCommit ?? false,
          },
          dbConfigs: dbMcpConfigs,
          jobContext: {
            jobId,
            redisUrl: cfg.redisUrl,
            publicBaseUrl: cfg.publicBaseUrl,
            dashboardApiToken: cfg.dashboardApiToken,
            jigitServerPath,
            approvalTimeoutMs: cfg.approvalTimeoutMs,
          },
          resolveCredential: async (kind, name) => {
            const cred = await getCredential(kind, name);
            return cred.secrets;
          },
        });

        const session = new AcpSession({
          command: "npx",
          args: ["@agentclientprotocol/claude-agent-acp"],
          cwd,
          mcpServers,
          env: { ANTHROPIC_API_KEY: anthropicCred.secrets["apiKey"] },
          requestTimeoutMs: cfg.acpRequestTimeoutMs,
          onUpdate: () => {},
          onOutput,
          onPermission,
        });
        updateRuntime(jobId, { acpSession: session, workdir: cwd });
        await session.start();

        const runPromise = session.runPrompt(prompt);
        const abortPromise = new Promise<never>((_, reject) => {
          const timer = setInterval(() => {
            if (redisSignals.shouldPause(jobId)) {
              clearInterval(timer);
              session.stop().catch(() => {});
              reject(new Error("Job paused"));
            } else if (redisSignals.shouldStop(jobId) || redisSignals.shouldDelete(jobId)) {
              clearInterval(timer);
              session.stop().catch(() => {});
              reject(new Error("Job aborted"));
            }
          }, 300);
          runPromise.finally(() => clearInterval(timer));
        });

        try {
          return await Promise.race([runPromise, abortPromise]);
        } finally {
          await session.stop();
          updateRuntime(jobId, { acpSession: null });
        }
      };
      sendTelegram = (text) => telegramBot.sendMessage(telegramChatId, text).then(() => undefined);
    }

    const deps: GraphDeps = {
      jira,
      gitlab,
      git,
      acp: { run: acpRun },
      repoMapping: mapping as any,
      agentTemplate: {
        systemPrompt: jobRow.agentTemplate?.systemPrompt ?? "",
        requireReviewBeforeCommit: jobRow.agentTemplate?.requireReviewBeforeCommit ?? false,
      },
      sink: new PrismaJobSink(),
      signals: redisSignals,
      prisma,
      sendTelegram,
    };

    const graph = buildGraph(deps);
    await deps.sink.setStatus(jobId, "running");
    try {
      await graph.run({ jobId, jiraIssueKey: jobRow.jiraIssueKey ?? "" });
    } catch (err) {
      if (redisSignals.shouldDelete(jobId)) {
        const row = await prisma.job.findUnique({ where: { id: jobId } });
        if (row?.workdir) await git.removeWorktree(row.workdir);
        await cleanupJobRuntime(jobId);
        return;
      }
      if (redisSignals.shouldStop(jobId)) {
        await deps.sink.setStatus(jobId, "stopped");
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Job aborted") {
        await deps.sink.setStatus(jobId, "stopped");
        return;
      }
      if (message === "Job paused" || redisSignals.shouldPause(jobId)) {
        await deps.sink.setStatus(jobId, "paused");
        return;
      }
      await deps.sink.setStatus(jobId, "failed", message);
      const issueKey = jobRow.jiraIssueKey ?? "";
      await Promise.allSettled([
        sendTelegram(`❌ Job failed: ${issueKey || jobId}\n${message}`),
        issueKey
          ? jira.addWorklog(issueKey, `JiGit agent failed:\n${message}`)
          : Promise.resolve(),
      ]);
      throw err;
    } finally {
      if (!redisSignals.shouldDelete(jobId)) {
        clearRuntime(jobId);
      }
    }
  },
  cfg.maxConcurrentAgents,
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

// Re-enqueue any jobs that are stuck in 'queued' status in Postgres but
// missing from the BullMQ Redis queue (e.g. after a crash or Redis flush).
async function recoverStaleJobs(): Promise<void> {
  const stale = await prisma.job.findMany({ where: { status: "queued" } });
  if (stale.length === 0) return;
  const queue = createQueue(cfg.redisUrl);
  for (const job of stale) {
    await queue.add("run", { jobId: job.id });
    console.log(`Recovered stale job ${job.id}`);
  }
  await queue.close();
}

recoverStaleJobs().catch((err) => console.error("Failed to recover stale jobs:", err));

console.log(`JiGit worker started (concurrency=${cfg.maxConcurrentAgents})`);
