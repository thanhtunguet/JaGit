import { describe, it, expect, vi } from "vitest";
import { awaitApproval } from "./approval.js";
import { waitForApprovalDecision } from "@jagit/shared";

vi.mock("@jagit/shared", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    waitForApprovalDecision: vi.fn(),
    loadConfig: () => ({ approvalTimeoutMs: 50, redisUrl: "redis://x" }),
  };
});

describe("awaitApproval", () => {
  it("resolves with the chosen optionId from the control channel", async () => {
    vi.mocked(waitForApprovalDecision).mockResolvedValue("allow");

    const optionId = await awaitApproval({
      approvalId: "appr-1",
      jobId: "job-1",
      denyOptionId: "deny",
      resolveApproval: vi.fn().mockResolvedValue(undefined),
    });
    expect(optionId).toBe("allow");
  });

  it("auto-rejects on timeout and returns denyOptionId", async () => {
    vi.mocked(waitForApprovalDecision).mockResolvedValue("deny");

    const resolve = vi.fn().mockResolvedValue(undefined);
    const optionId = await awaitApproval({
      approvalId: "appr-2",
      jobId: "job-1",
      denyOptionId: "deny",
      resolveApproval: resolve,
    });

    expect(optionId).toBe("deny");
    expect(resolve).toHaveBeenCalledWith("appr-2", "deny", "system");
  });
});
