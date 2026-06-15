import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry.js";

describe("withRetry", () => {
  it("returns immediately on first success", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withRetry(fn, { maxRetries: 3, baseDelayMs: 0 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error("not yet");
      return "ok";
    });
    expect(await withRetry(fn, { maxRetries: 3, baseDelayMs: 0 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after maxRetries + 1 attempts", async () => {
    const fn = vi.fn(async () => { throw new Error("nope"); });
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 0 })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
