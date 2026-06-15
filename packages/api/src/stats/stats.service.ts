import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

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
  constructor(private readonly prisma: PrismaService) {}

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
      recentEvents,
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
        select: { updatedAt: true, costUsd: true },
      }),
      this.prisma.client.jobEvent.findMany({
        orderBy: { ts: "desc" },
        take: 15,
        include: { job: { select: { jiraIssueKey: true } } },
      }),
    ]);

    const avgCostUsd =
      doneJobsWeek.length === 0
        ? 0
        : doneJobsWeek.reduce((sum, j) => sum + j.costUsd, 0) / doneJobsWeek.length;

    return {
      activeJobs,
      doneToday,
      doneYesterday,
      approvalQueue,
      avgCostUsd,
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
