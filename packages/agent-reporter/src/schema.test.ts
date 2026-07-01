import { describe, it, expect } from "vitest";
import { AgentSessionPayloadSchema, AGENT_TOOLS } from "./schema.js";

const valid = {
  tool: "claude-code",
  sessionId: "sess-123",
  gitUsername: "alice@example.com",
  model: "claude-opus-4-7",
  inputTokens: 100,
  cachedInputTokens: 20,
  outputTokens: 50,
  costUsd: 1.23,
  toolCallCount: 4,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("AgentSessionPayloadSchema", () => {
  it("accepts a complete valid payload", () => {
    expect(AgentSessionPayloadSchema.parse(valid)).toMatchObject({ tool: "claude-code" });
  });

  it("allows null costUsd and toolCallCount", () => {
    expect(AgentSessionPayloadSchema.parse({ ...valid, costUsd: null, toolCallCount: null })).toBeTruthy();
  });

  it("rejects negative tokens", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, inputTokens: -1 })).toThrow();
  });

  it("rejects empty sessionId", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, sessionId: "" })).toThrow();
  });

  it("rejects unknown tool", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, tool: "cursor" })).toThrow();
  });

  it("rejects non-datetime startedAt", () => {
    expect(() => AgentSessionPayloadSchema.parse({ ...valid, startedAt: "yesterday" })).toThrow();
  });

  it("exposes AGENT_TOOLS", () => {
    expect(AGENT_TOOLS).toEqual(["claude-code", "codex", "copilot"]);
  });
});
