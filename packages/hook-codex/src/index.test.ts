import { describe, it, expect, vi } from "vitest";
vi.mock("@jagit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jagit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload } from "./index.js";

const records = [
  { type: "session_meta", timestamp: "2026-06-20T10:00:00.000Z", payload: { id: "codex-abc", cwd: "/repo", timestamp: "2026-06-20T10:00:00.000Z" } },
  { type: "turn_context", timestamp: "2026-06-20T10:00:01.000Z", payload: { model: "gpt-5.3-codex" } },
  { type: "event_msg", timestamp: "2026-06-20T10:00:02.000Z", payload: { type: "token_count", info: null } },
  { type: "response_item", timestamp: "2026-06-20T10:00:03.000Z", payload: { type: "function_call" } },
  { type: "response_item", timestamp: "2026-06-20T10:00:03.500Z", payload: { type: "web_search_call" } },
  { type: "event_msg", timestamp: "2026-06-20T10:00:04.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40 } } } },
  { type: "event_msg", timestamp: "2026-06-20T10:00:05.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 150, cached_input_tokens: 30, output_tokens: 60 } } } },
];

describe("codex buildPayload", () => {
  it("takes last cumulative token_count and derives fields", () => {
    const p = buildPayload("codex-abc", "/repo", records);
    expect(p).toMatchObject({
      tool: "codex", sessionId: "codex-abc", gitUsername: "alice", model: "gpt-5.3-codex",
      inputTokens: 150, cachedInputTokens: 30, outputTokens: 60, costUsd: null, toolCallCount: 2,
      startedAt: "2026-06-20T10:00:00.000Z",
    });
  });

  it("defaults gracefully on a sparse session", () => {
    const p = buildPayload("s2", "/repo", [{ type: "session_meta", timestamp: "2026-06-20T09:00:00.000Z", payload: { id: "s2" } }]);
    expect(p.inputTokens).toBe(0);
    expect(p.model).toBe("unknown");
    expect(p.toolCallCount).toBe(0);
  });
});
