import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { PricingService } from "../pricing/pricing.service.js";

export const TERMINAL_STATUSES = ["done", "stopped", "failed"] as const;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Bucket done-job timestamps into 7 UTC days ending on `now`. */
export function bucketByDay(
  jobs: { updatedAt: Date }[],
  now = new Date(),
): { day: string; date: string; jobs: number }[] {
  const end = startOfUtcDay(now);
  const buckets: { day: string; date: string; jobs: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = addUtcDays(end, -i);
    const dayEnd = addUtcDays(dayStart, 1);
    const count = jobs.filter(
      (j) => j.updatedAt >= dayStart && j.updatedAt < dayEnd,
    ).length;
    buckets.push({
      day: DAY_NAMES[dayStart.getUTCDay()],
      date: dayStart.toISOString().slice(0, 10),
      jobs: count,
    });
  }

  return buckets;
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async getOverview() {
    const now = new Date();
    const startOfToday = startOfUtcDay(now);
    const startOfYesterday = addUtcDays(startOfToday, -1);
    const sevenDaysAgo = addUtcDays(startOfToday, -6);

    const [
      activeJobs,
      doneToday,
      doneYesterday,
      approvalQueue,
      statusGroups,
      doneJobsWeek,
      agentSessionAggregate,
      latestUploads,
      recentEvents,
      baseRate,
    ] = await Promise.all([
      this.prisma.client.job.count({
        where: { status: { notIn: [...TERMINAL_STATUSES] } },
      }),
      this.prisma.client.job.count({
        where: { status: "done", updatedAt: { gte: startOfToday } },
      }),
      this.prisma.client.job.count({
        where: {
          status: "done",
          updatedAt: { gte: startOfYesterday, lt: startOfToday },
        },
      }),
      this.prisma.client.approval.count({ where: { status: "pending" } }),
      this.prisma.client.job.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.client.job.findMany({
        where: { status: "done", updatedAt: { gte: sevenDaysAgo } },
        select: { updatedAt: true },
      }),
      this.prisma.client.agentSession.aggregate({
        _sum: {
          inputTokens: true,
          cachedInputTokens: true,
          cacheCreationInputTokens: true,
          outputTokens: true,
          costUsd: true,
        },
      }),
      this.prisma.client.usageUpload.findMany({
        distinct: ["userId"],
        orderBy: [{ userId: "asc" }, { uploadedAt: "desc" }],
      }),
      this.prisma.client.jobEvent.findMany({
        orderBy: { ts: "desc" },
        take: 15,
        include: { job: { select: { jiraIssueKey: true } } },
      }),
      this.pricing.getBaseTokenRate(),
    ]);

    const liveTokens =
      (agentSessionAggregate._sum.inputTokens ?? 0) +
      (agentSessionAggregate._sum.cachedInputTokens ?? 0) +
      (agentSessionAggregate._sum.cacheCreationInputTokens ?? 0) +
      (agentSessionAggregate._sum.outputTokens ?? 0);

    let codeburnTokens = 0;
    for (const upload of latestUploads) {
      const data = upload.data as any;
      if (data?.daily && Array.isArray(data.daily)) {
        const uniqueDates = new Map<string, number>();
        for (const row of data.daily) {
          const date = row.Date;
          if (date && !uniqueDates.has(date)) {
            const t =
              (row["Input Tokens"] || 0) +
              (row["Output Tokens"] || 0) +
              (row["Cache Read Tokens"] || 0) +
              (row["Cache Write Tokens"] || 0);
            uniqueDates.set(date, t);
          }
        }
        for (const t of uniqueDates.values()) {
          codeburnTokens += t;
        }
      }
    }

    const totalTokensUsed = liveTokens + codeburnTokens;

    const totalBaseTokens = this.pricing.toBaseTokens(
      agentSessionAggregate._sum.costUsd ?? 0,
      baseRate,
    );

    return {
      activeJobs,
      doneToday,
      doneYesterday,
      approvalQueue,
      totalTokensUsed,
      totalBaseTokens,
      throughput: bucketByDay(doneJobsWeek, now),
      statusDistribution: statusGroups
        .map((g) => ({ status: g.status, count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        ts: e.ts.toISOString(),
        level: e.level,
        type: e.type,
        message: e.message,
        jiraIssueKey: e.job.jiraIssueKey,
      })),
    };
  }
}
