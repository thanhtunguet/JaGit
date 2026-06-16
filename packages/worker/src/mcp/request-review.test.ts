import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitForApprovalDecision } from "@jigit/shared";
import { executeRequestReview } from "./request-review.js";

vi.mock("@jigit/shared", () => ({
  waitForApprovalDecision: vi.fn(async () => "approve"),
}));

describe("executeRequestReview", () => {
  beforeEach(() => {
    vi.mocked(waitForApprovalDecision).mockResolvedValue("approve");
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ approvalId: "appr-1" }),
    })) as unknown as typeof fetch;
  });

  it("posts review request and waits for decision", async () => {
    const result = await executeRequestReview({
      jobId: "job-1",
      prompt: "Please review my changes",
      options: [{ optionId: "approve", name: "Approve" }],
      publicBaseUrl: "http://localhost:3000",
      apiToken: "secret",
      redisUrl: "redis://localhost",
      approvalTimeoutMs: 5000,
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/review-requests",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }),
      }),
    );
    expect(result).toEqual({
      chosenOptionId: "approve",
      status: "approved",
    });
  });

  it("throws when API returns error", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "fail",
    })) as unknown as typeof fetch;

    await expect(
      executeRequestReview({
        jobId: "job-1",
        prompt: "x",
        publicBaseUrl: "http://localhost:3000",
        apiToken: "t",
        redisUrl: "redis://x",
        approvalTimeoutMs: 1000,
      }),
    ).rejects.toThrow(/review-requests/);
  });
});
