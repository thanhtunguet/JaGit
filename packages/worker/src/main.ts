import { createWorker, loadConfig, decrypt, prisma } from "@jigit/shared";
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
  const secrets = JSON.parse(decrypt(JSON.stringify(cred.secrets), cfg.encryptionKey));
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
    const mapping = await prisma.repoMapping.findFirst({
      where: { jiraProjectKey: jobRow.jiraIssueKey?.split("-")[0] ?? "" },
    });
    if (!mapping) throw new Error(`No repo mapping for job ${jobId}`);

    const jiraCred = await getCredential("jira", "default");
    const gitlabCred = await getCredential("gitlab", "default");
    const anthropicCred = await getCredential("anthropic", "default");

    const redisSignals = new RedisSignals(new IORedis(cfg.redisUrl, { maxRetriesPerRequest: null }) as InstanceType<typeof IORedis>);
    redisSignals.listen(jobId);

    const jira = new JiraAdapter({
      baseUrl: jiraCred.meta["baseUrl"] ?? "",
      email: jiraCred.secrets["email"],
      token: jiraCred.secrets["token"],
      maxRetries: cfg.maxRetries,
    });

    const gitlab = new GitlabAdapter({
      baseUrl: gitlabCred.meta["baseUrl"] ?? "",
      token: gitlabCred.secrets["token"],
      maxRetries: cfg.maxRetries,
    });

    const telegramChatId = (
      await getCredential("telegram", "default")
    ).meta["chatId"] ?? "";

    const deps: GraphDeps = {
      jira,
      gitlab,
      git: new GitAdapter(),
      acp: {
        run: async (prompt, onPermission) => {
          const session = new AcpSession({
            command: "npx",
            args: ["@zed-industries/claude-code-acp"],
            env: { ANTHROPIC_API_KEY: anthropicCred.secrets["apiKey"] },
            onUpdate: () => {},
            onPermission,
          });
          await session.start();
          const result = await session.runPrompt(prompt);
          await session.stop();
          return result;
        },
      },
      repoMapping: mapping as any,
      sink: new PrismaJobSink(),
      signals: redisSignals,
      prisma,
      sendTelegram: (text) => telegramBot.sendMessage(telegramChatId, text).then(() => undefined),
    };

    const graph = buildGraph(deps);
    await graph.run({ jobId, jiraIssueKey: jobRow.jiraIssueKey ?? "" });
  },
  cfg.maxConcurrentAgents,
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log(`JiGit worker started (concurrency=${cfg.maxConcurrentAgents})`);
