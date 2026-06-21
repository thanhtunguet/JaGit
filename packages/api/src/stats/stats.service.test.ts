import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StatsService, bucketByDay, TERMINAL_STATUSES } from "./stats.service.js";

const mockPrisma = {
  client: {
    job: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    agentSession: {
      aggregate: vi.fn(),
    },
    usageUpload: {
      findMany: vi.fn(),
    },
    approval: {
      count: vi.fn(),
    },
    jobEvent: {
      findMany: vi.fn(),
    },
  },
};

describe("bucketByDay", () => {
  it("groups done jobs into 7 day buckets ending today", () => {
    const today = new Date("2026-06-16T15:00:00Z");
    const buckets = bucketByDay(
      [
        { updatedAt: new Date("2026-06-16T10:00:00Z") },
        { updatedAt: new Date("2026-06-16T12:00:00Z") },
        { updatedAt: new Date("2026-06-14T08:00:00Z") },
      ],
      today,
    );
    expect(buckets).toHaveLength(7);
    expect(buckets[6]).toMatchObject({ day: "Tue", jobs: 2 });
    expect(buckets[4]).toMatchObject({ day: "Sun", jobs: 1 });
    expect(buckets[0].jobs).toBe(0);
  });
});

describe("StatsService.getOverview", () => {
  let svc: StatsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00Z"));
    svc = new StatsService(mockPrisma as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns aggregated overview metrics", async () => {
    mockPrisma.client.job.count
      .mockResolvedValueOnce(3)   // active
      .mockResolvedValueOnce(5)   // done today
      .mockResolvedValueOnce(2);  // done yesterday
    mockPrisma.client.approval.count.mockResolvedValue(1);
    mockPrisma.client.job.groupBy.mockResolvedValue([
      { status: "done", _count: { _all: 10 } },
      { status: "running", _count: { _all: 3 } },
      { status: "failed", _count: { _all: 2 } },
    ]);
    mockPrisma.client.job.findMany.mockResolvedValue([
      { updatedAt: new Date("2026-06-16T10:00:00Z") },
      { updatedAt: new Date("2026-06-15T10:00:00Z") },
    ]);
    mockPrisma.client.agentSession.aggregate.mockResolvedValue({
      _sum: {
        inputTokens: 20_000,
        cachedInputTokens: 0,
        cacheCreationInputTokens: 5_000,
        outputTokens: 50_000,
      },
    });
    mockPrisma.client.usageUpload.findMany.mockResolvedValue([
      {
        data: {
          daily: [
            {
              Date: "2026-06-16",
              "Input Tokens": 30_000,
              "Output Tokens": 20_000,
              "Cache Read Tokens": 0,
              "Cache Write Tokens": 0,
            },
          ],
        },
      },
    ]);
    mockPrisma.client.jobEvent.findMany.mockResolvedValue([
      {
        id: "e1",
        ts: new Date("2026-06-16T11:00:00Z"),
        level: "info",
        type: "step_done",
        message: "Job finished",
        job: { jiraIssueKey: "JAGIT-1" },
      },
    ]);

    const result = await svc.getOverview();

    expect(mockPrisma.client.job.count).toHaveBeenCalledWith({
      where: { status: { notIn: TERMINAL_STATUSES } },
    });
    expect(result.activeJobs).toBe(3);
    expect(result.doneToday).toBe(5);
    expect(result.doneYesterday).toBe(2);
    expect(result.approvalQueue).toBe(1);
    expect(result.totalTokensUsed).toBe(125_000);
    expect(result.throughput).toHaveLength(7);
    expect(result.statusDistribution).toEqual([
      { status: "done", count: 10 },
      { status: "running", count: 3 },
      { status: "failed", count: 2 },
    ]);
    expect(result.recentEvents).toHaveLength(1);
    expect(result.recentEvents[0]).toMatchObject({
      id: "e1",
      level: "info",
      message: "Job finished",
      jiraIssueKey: "JAGIT-1",
    });
  });
});
