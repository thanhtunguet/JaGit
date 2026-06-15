import { config } from "dotenv";
import type { IJiraAdapter, IGitlabAdapter, IGitAdapter } from "./adapters/interfaces.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from monorepo root before any config reads
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { createWorker, createQueue, loadConfig, decrypt, prisma } from "@jigit/shared";
import { buildGraph } from "./graph.js";
import { JiraAdapter } from "./adapters/jira.js";
import { GitlabAdapter } from "./adapters/gitlab.js";
import { GitAdapter } from "./adapters/git.js";
import { AcpSession } from "./acp/client.js";
import { PrismaJobSink } from "./prisma-sink.js";
import type { GraphDeps } from "./graph.js";
import { Redis as IORedis } from "ioredis";
import TelegramBot from "node-telegram-bot-api";

const cfg = loadConfig();

/** Per-job stop/pause flags driven by Redis control-channel messages */
class RedisSignals {
  private stopped = new Set<string>();
  private paused = new Set<string>();

  constructor(private redis: InstanceType<typeof IORedis>) {}

  listen(jobId: string) {
    this.redis.subscribe(`control:${jobId}`);
    this.redis.on("message", (_ch: string, msg: string) => {
      try {
        const signal = JSON.parse(msg);
        if (signal.jobId !== jobId) return;
        if (signal.type === "stop") this.stopped.add(jobId);
        if (signal.type === "pause") this.paused.add(jobId);
        if (signal.type === "resume") this.paused.delete(jobId);
      } catch { /* ignore */ }
    });
  }

  shouldStop(jobId: string): boolean { return this.stopped.has(jobId); }
  shouldPause(jobId: string): boolean { return this.paused.has(jobId); }
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

    const redisSignals = new RedisSignals(new IORedis(cfg.redisUrl, { maxRetriesPerRequest: null }) as InstanceType<typeof IORedis>);
    redisSignals.listen(jobId);

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
      acpRun = async (prompt, onPermission, onOutput, cwd) => {
        const session = new AcpSession({
          command: "npx",
          args: ["@agentclientprotocol/claude-agent-acp"],
          cwd,
          env: { ANTHROPIC_API_KEY: anthropicCred.secrets["apiKey"] },
          onUpdate: () => {},
          onOutput,
          onPermission,
        });
        await session.start();
        const result = await session.runPrompt(prompt);
        await session.stop();
        return result;
      };
      sendTelegram = (text) => telegramBot.sendMessage(telegramChatId, text).then(() => undefined);
    }

    const deps: GraphDeps = {
      jira,
      gitlab,
      git,
      acp: { run: acpRun },
      repoMapping: mapping as any,
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
      const message = err instanceof Error ? err.message : String(err);
      await deps.sink.setStatus(jobId, "failed", message);
      throw err;
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
