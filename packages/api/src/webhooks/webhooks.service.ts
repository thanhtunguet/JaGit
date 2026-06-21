import { Injectable, UnauthorizedException, Inject } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../common/prisma.module.js";
import { QUEUE_TOKEN } from "../common/queue.module.js";
import { normalizeJira, dedupeKey } from "./normalize.js";
import { loadConfig } from "@jagit/shared";
import type { Queue } from "bullmq";

@Injectable()
export class WebhooksService {
  private readonly cfg = loadConfig();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_TOKEN) private readonly queue: Queue,
  ) {}

  async handleJira(hubSignature: string | undefined, rawBody: Buffer, body: any) {
    // Verify Jira's HMAC-SHA256 signature from x-hub-signature header.
    const expected = "sha256=" + createHmac("sha256", this.cfg.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const sigBuf = Buffer.from(hubSignature ?? "");
    const expBuf = Buffer.from(expected);
    const sigValid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
    if (!sigValid) throw new UnauthorizedException();

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
