import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitForApprovalDecision } from "./approval-bridge.js";

const subscribeHandlers: Array<(ch: string, msg: string) => void> = [];
const mockRedis = {
  subscribe: vi.fn(async () => {}),
  on: vi.fn((event: string, handler: (ch: string, msg: string) => void) => {
    if (event === "message") subscribeHandlers.push(handler);
  }),
  quit: vi.fn(async () => {}),
};

vi.mock("./events.js", () => ({
  makeRedis: () => mockRedis,
  controlChannel: (jobId: string) => `control:${jobId}`,
}));

describe("waitForApprovalDecision", () => {
  beforeEach(() => {
    subscribeHandlers.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("resolves when matching approval signal arrives", async () => {
    const promise = waitForApprovalDecision({
      redisUrl: "redis://x",
      jobId: "job-1",
      approvalId: "appr-1",
      timeoutMs: 5000,
      denyOptionId: "reject",
    });

    const handler = subscribeHandlers[0]!;
    handler("control:job-1", JSON.stringify({
      type: "approval",
      approvalId: "appr-1",
      chosenOptionId: "approve",
    }));

    await expect(promise).resolves.toBe("approve");
    expect(mockRedis.quit).toHaveBeenCalled();
  });

  it("returns denyOptionId on timeout", async () => {
    const promise = waitForApprovalDecision({
      redisUrl: "redis://x",
      jobId: "job-1",
      approvalId: "appr-2",
      timeoutMs: 100,
      denyOptionId: "reject",
    });

    vi.advanceTimersByTime(150);
    await expect(promise).resolves.toBe("reject");
  });
});
