import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { JobsService } from "./jobs.service.js";
import { publishControl, removeWorktree } from "@jigit/shared";

vi.mock("@jigit/shared", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    publishControl: vi.fn().mockResolvedValue(undefined),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    loadConfig: () => ({ redisUrl: "redis://localhost:6379" }),
  };
});

const mockJob = {
  id: "job-1",
  status: "failed",
  jiraIssueKey: "JIGIT-1",
  workdir: "/tmp/worktree",
};

const mockPrisma = {
  client: {
    job: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
};

const mockQueue = {
  add: vi.fn().mockResolvedValue(undefined),
  getJobs: vi.fn().mockResolvedValue([]),
};

describe("JobsService", () => {
  let svc: JobsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new JobsService(mockPrisma as any, mockQueue as any);
  });

  it("retry re-queues a failed job", async () => {
    mockPrisma.client.job.findUnique.mockResolvedValue(mockJob);
    mockPrisma.client.job.update.mockResolvedValue({ ...mockJob, status: "queued" });

    const result = await svc.retry("job-1");

    expect(result).toEqual({ accepted: true, jobId: "job-1" });
    expect(mockPrisma.client.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "queued", error: null },
    });
    expect(mockQueue.add).toHaveBeenCalledWith("run", { jobId: "job-1" });
  });

  it("retry rejects non-failed jobs", async () => {
    mockPrisma.client.job.findUnique.mockResolvedValue({ ...mockJob, status: "running" });
    await expect(svc.retry("job-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("delete removes a terminal job and cleans worktree", async () => {
    mockPrisma.client.job.findUnique.mockResolvedValue({ ...mockJob, status: "done" });

    const result = await svc.deleteJob("job-1");

    expect(result).toEqual({ deleted: true });
    expect(publishControl).not.toHaveBeenCalled();
    expect(removeWorktree).toHaveBeenCalledWith("/tmp/worktree");
    expect(mockPrisma.client.job.delete).toHaveBeenCalledWith({ where: { id: "job-1" } });
  });

  it("delete stops an active job before removing it", async () => {
    mockPrisma.client.job.findUnique.mockResolvedValue({ ...mockJob, status: "running" });

    const result = await svc.deleteJob("job-1");

    expect(result).toEqual({ deleted: true });
    expect(publishControl).toHaveBeenCalledWith("redis://localhost:6379", {
      type: "delete",
      jobId: "job-1",
    });
    expect(mockPrisma.client.job.delete).toHaveBeenCalledWith({ where: { id: "job-1" } });
  });

  it("delete throws when job is missing", async () => {
    mockPrisma.client.job.findUnique.mockResolvedValue(null);
    await expect(svc.deleteJob("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
