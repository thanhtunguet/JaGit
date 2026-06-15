import { Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { QUEUE_TOKEN } from "../common/queue.module.js";
import { normalizeJira, dedupeKey } from "./normalize.js";
import { loadConfig } from "@jigit/shared";
import type { Queue } from "bullmq";

@Injectable()
export class WebhooksService {
  private readonly cfg = loadConfig();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_TOKEN) private readonly queue: Queue,
  ) {}

  async handleJira(secret: string, body: any) {
    if (secret !== this.cfg.webhookSecret) throw new UnauthorizedException();

    // Resolve the bot's Jira account ID from the stored Jira credential.
    const jiraCred = await this.prisma.client.credential.findFirst({
      where: { kind: "jira" },
    });
    const botAccountId: string = (jiraCred?.meta as any)?.botAccountId ?? "";

    const trigger = normalizeJira(body, botAccountId);
    if (!trigger) return { ignored: true };

    const key = dedupeKey(trigger);
    const existing = await this.prisma.client.job.findUnique({ where: { dedupeKey: key } });
    if (existing) return { duplicate: true };

    const job = await this.prisma.client.job.create({
      data: {
        source: "jira",
        jiraIssueKey: trigger.issueKey,
        dedupeKey: key,
        checkpointThreadId: key,
      },
    });

    await this.queue.add("run", { jobId: job.id });
    return { jobId: job.id };
  }
}
