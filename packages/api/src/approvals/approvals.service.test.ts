import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalsService } from "./approvals.service.js";
import { publishEvent } from "@jigit/shared";

// Mock the PrismaService and Redis publisher
vi.mock("@jigit/shared", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    publishControl: vi.fn().mockResolvedValue(undefined),
    publishEvent: vi.fn().mockResolvedValue(undefined),
    loadConfig: () => ({
      redisUrl: "redis://localhost:6379",
      approvalTimeoutMs: 100,
    }),
  };
});

const pendingApproval = {
  id: "appr-1",
  jobId: "job-1",
  status: "pending",
  options: [{ optionId: "allow", name: "Allow" }, { optionId: "deny", name: "Deny" }],
};

const mockPrisma = {
  client: {
    approval: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ ...pendingApproval, status: "approved" }),
    },
  },
};

describe("ApprovalsService.decide", () => {
  let svc: ApprovalsService;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ApprovalsService(mockPrisma as any);
  });

  it("resolves a pending approval", async () => {
    mockPrisma.client.approval.findUnique.mockResolvedValue(pendingApproval);
    const result = await svc.decide("appr-1", "allow", "telegram", "user-1");
    expect(result).toMatchObject({ decided: true });
  });

  it("is idempotent (already-decided returns alreadyDecided)", async () => {
    mockPrisma.client.approval.findUnique.mockResolvedValue({
      ...pendingApproval, status: "approved" });
    const result = await svc.decide("appr-1", "allow", "telegram");
    expect(result).toMatchObject({ alreadyDecided: true });
  });

  it("publishes a resolved event to approvalsChannel after deciding", async () => {
    mockPrisma.client.approval.findUnique.mockResolvedValue(pendingApproval);
    await svc.decide("appr-1", "allow", "dashboard", "user-1");
    const { publishEvent: mockPublishEvent } = await import("@jigit/shared");
    expect(mockPublishEvent).toHaveBeenCalledWith(
      expect.any(String),
      "approvals",
      expect.objectContaining({ type: "resolved", approvalId: "appr-1" }),
    );
  });
});

describe("ApprovalsService.listPending", () => {
  let svc: ApprovalsService;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ApprovalsService(mockPrisma as any);
  });

  it("returns pending approvals with job info", async () => {
    mockPrisma.client.approval.findMany.mockResolvedValue([
      { id: "appr-1", jobId: "job-1", status: "pending", prompt: "Allow?", options: [], createdAt: new Date("2026-01-01"), job: { id: "job-1", jiraIssueKey: "ABC-1" } },
    ]);
    const result = await svc.listPending();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "appr-1", jobId: "job-1" });
  });
});
