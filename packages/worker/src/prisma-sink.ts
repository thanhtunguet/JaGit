import { prisma, publishEvent, jobChannel, loadConfig } from "@jigit/shared";
import type { IJobSink } from "./adapters/interfaces.js";

export class PrismaJobSink implements IJobSink {
  private readonly cfg = loadConfig();

  async setStatus(jobId: string, status: string, error?: string): Promise<void> {
    await prisma.job.update({ where: { id: jobId }, data: { status: status as any, error } });
    await publishEvent(this.cfg.redisUrl, jobChannel(jobId), { type: "status_changed", status, error });
  }

  async startStep(jobId: string, name: string): Promise<string> {
    const step = await prisma.jobStep.create({
      data: { jobId, name, status: "running", startedAt: new Date() },
    });
    return step.id;
  }

  async finishStep(stepId: string, status: "done" | "failed", detail?: object): Promise<void> {
    await prisma.jobStep.update({
      where: { id: stepId },
      data: { status, finishedAt: new Date(), detail: detail ?? {} },
    });
  }

  async addEvent(jobId: string, opts: {
    type: string; message: string; level?: string; payload?: object;
  }): Promise<void> {
    const event = await prisma.jobEvent.create({
      data: {
        jobId,
        type: opts.type,
        message: opts.message,
        level: opts.level ?? "info",
        payload: opts.payload ?? {},
      },
    });
    const cfg = this.cfg;
    await publishEvent(cfg.redisUrl, jobChannel(jobId), {
      type: "event",
      event: { ...event, payload: opts.payload },
    });
  }
}
