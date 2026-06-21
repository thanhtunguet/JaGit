import { describe, it, expect, vi } from "vitest";
vi.mock("@jagit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jagit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload } from "./index.js";

const stdin = { session_id: "sess-9", transcript_path: "/tmp/t.jsonl", cwd: "/repo" };
const transcript = [
  { type: "user", timestamp: "2026-06-20T10:00:00.000Z", message: { role: "user", content: "hi" } },
  { type: "assistant", timestamp: "2026-06-20T10:00:01.000Z", message: { role: "assistant", model: "claude-opus-4-7",
    content: [{ type: "text", text: "ok" }], usage: { input_tokens: 100, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 40 } } },
  { type: "assistant", timestamp: "2026-06-20T10:00:02.000Z", message: { role: "assistant", model: "claude-opus-4-7",
    content: [{ type: "tool_use", name: "Bash", input: {} }], usage: { input_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 60 } } },
];

describe("buildPayload", () => {
  it("sums cumulative usage and derives fields", () => {
    const p = buildPayload(stdin, () => transcript);
    expect(p).toMatchObject({
      tool: "claude-code", sessionId: "sess-9", gitUsername: "alice", model: "claude-opus-4-7",
      inputTokens: 300, cachedInputTokens: 10, cacheCreationInputTokens: 5, outputTokens: 100, costUsd: null, toolCallCount: 1,
      startedAt: "2026-06-20T10:00:00.000Z",
    });
  });

  it("tolerates assistant messages without usage", () => {
    const p = buildPayload(stdin, () => [{ type: "assistant", timestamp: "2026-06-20T10:00:00.000Z", message: { role: "assistant", model: "m", content: [] } }]);
    expect(p.inputTokens).toBe(0);
    expect(p.toolCallCount).toBe(0);
  });
});
