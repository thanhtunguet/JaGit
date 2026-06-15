import { describe, it, expect, vi } from "vitest";
import { awaitApproval } from "./approval.js";
import EventEmitter from "node:events";

vi.mock("@jigit/shared", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    makeRedis: vi.fn(),
    loadConfig: () => ({ approvalTimeoutMs: 50, redisUrl: "redis://x" }),
  };
});

import { makeRedis } from "@jigit/shared";

describe("awaitApproval", () => {
  it("resolves with the chosen optionId from the control channel", async () => {
    const emitter = new EventEmitter();
    const fakeSub = Object.assign(emitter, {
      subscribe: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(makeRedis).mockReturnValue(fakeSub as any);

    // Simulate a control signal arriving after 10ms
    setTimeout(() => {
      emitter.emit("message", "control:job-1",
        JSON.stringify({ type: "approval", approvalId: "appr-1", chosenOptionId: "allow" })
      );
    }, 10);

    const optionId = await awaitApproval({
      approvalId: "appr-1",
      jobId: "job-1",
      denyOptionId: "deny",
      resolveApproval: vi.fn().mockResolvedValue(undefined),
    });
    expect(optionId).toBe("allow");
  });

  it("auto-rejects on timeout and returns denyOptionId", async () => {
    const emitter = new EventEmitter();
    const fakeSub = Object.assign(emitter, {
      subscribe: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(makeRedis).mockReturnValue(fakeSub as any);

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
