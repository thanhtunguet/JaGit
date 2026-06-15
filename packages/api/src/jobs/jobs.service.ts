import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { publishControl, loadConfig } from "@jigit/shared";

@Injectable()
export class JobsService {
  private readonly cfg = loadConfig();

  constructor(private readonly prisma: PrismaService) {}

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
}
