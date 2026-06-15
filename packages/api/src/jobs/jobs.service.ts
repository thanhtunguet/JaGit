import { BadRequestException, Injectable, NotFoundException, Inject } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { QUEUE_TOKEN } from "../common/queue.module.js";
import { publishControl, loadConfig, removeWorktree } from "@jigit/shared";
import type { Queue } from "bullmq";

const ACTIVE_STATUSES = new Set([
  "queued",
  "cloning",
  "running",
  "awaiting_approval",
  "pushing",
  "opening_mr",
  "reporting",
  "paused",
]);

@Injectable()
export class JobsService {
  private readonly cfg = loadConfig();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_TOKEN) private readonly queue: Queue,
  ) {}

  async listJobs() {
    return this.prisma.client.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getJob(id: string) {
    const job = await this.prisma.client.job.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { ts: "asc" }, take: 500 },
        approvals: { where: { status: "pending" } },
      },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async control(id: string, action: "stop" | "pause" | "resume") {
    const job = await this.prisma.client.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    await publishControl(this.cfg.redisUrl, { type: action, jobId: id });
    return { accepted: true, action };
  }

  async retry(id: string) {
    const job = await this.prisma.client.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    if (job.status !== "failed") {
      throw new BadRequestException(`Only failed jobs can be retried (status: ${job.status})`);
    }

    await this.prisma.client.job.update({
      where: { id },
      data: { status: "queued", error: null },
    });
    await this.queue.add("run", { jobId: id });
    return { accepted: true, jobId: id };
  }

  async deleteJob(id: string) {
    const job = await this.prisma.client.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);

    if (ACTIVE_STATUSES.has(job.status)) {
      await publishControl(this.cfg.redisUrl, { type: "delete", jobId: id });
      await this.waitForQueueJob(id, 15_000);
    }

    if (job.workdir) {
      await removeWorktree(job.workdir);
    }

    await this.removeFromQueue(id);
    await this.prisma.client.job.delete({ where: { id } });
    return { deleted: true };
  }

  private async removeFromQueue(jobId: string): Promise<void> {
    const jobs = await this.queue.getJobs(["waiting", "delayed", "active"]);
    await Promise.all(
      jobs
        .filter((j) => (j.data as { jobId?: string }).jobId === jobId)
        .map((j) => j.remove()),
    );
  }

  private async waitForQueueJob(jobId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const jobs = await this.queue.getJobs(["active", "waiting", "delayed"]);
      const stillQueued = jobs.some((j) => (j.data as { jobId?: string }).jobId === jobId);
      if (!stillQueued) return;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
