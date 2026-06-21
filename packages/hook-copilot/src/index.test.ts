import { describe, it, expect, vi } from "vitest";
vi.mock("@jagit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jagit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload } from "./index.js";

describe("copilot buildPayload", () => {
  it("synthesizes a session id and null cost", () => {
    const p = buildPayload("/repo", { model: "gpt-4o" });
    expect(p.tool).toBe("copilot");
    expect(p.sessionId).toMatch(/^copilot-\d+-\d+$/);
    expect(p.costUsd).toBeNull();
    expect(p.gitUsername).toBe("alice");
    expect(p.model).toBe("gpt-4o");
  });

  it("defaults model and tokens", () => {
    const p = buildPayload("/repo");
    expect(p.model).toBe("copilot");
    expect(p.inputTokens).toBe(0);
    expect(p.toolCallCount).toBeNull();
  });
});
