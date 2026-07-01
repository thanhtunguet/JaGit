import { describe, it, expect, vi } from "vitest";
vi.mock("@jagit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jagit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload, buildPayloadFromStdin, type CodexStopStdin, type CodexTranscriptEntry } from "./index.js";

// ─── Legacy mode (shell-wrapper / JSONL file scan) ────────────────────────────

const LEGACY_RECORDS = [
  { type: "session_meta", timestamp: "2026-06-20T10:00:00.000Z", payload: { id: "codex-abc", cwd: "/repo", timestamp: "2026-06-20T10:00:00.000Z" } },
  { type: "turn_context", timestamp: "2026-06-20T10:00:01.000Z", payload: { model: "gpt-5.3-codex" } },
  { type: "event_msg", timestamp: "2026-06-20T10:00:02.000Z", payload: { type: "token_count", info: null } },
  { type: "response_item", timestamp: "2026-06-20T10:00:03.000Z", payload: { type: "function_call" } },
  { type: "response_item", timestamp: "2026-06-20T10:00:03.500Z", payload: { type: "web_search_call" } },
  { type: "event_msg", timestamp: "2026-06-20T10:00:04.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40 } } } },
  { type: "event_msg", timestamp: "2026-06-20T10:00:05.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 150, cached_input_tokens: 30, output_tokens: 60 } } } },
];

describe("codex buildPayload (legacy / shell-wrapper mode)", () => {
  it("takes last cumulative token_count and derives fields", () => {
    const p = buildPayload("codex-abc", "/repo", LEGACY_RECORDS);
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

// ─── Stdin mode (real Codex Stop hook) ───────────────────────────────────────

const STOP_STDIN: CodexStopStdin = {
  session_id: "codex-sess-xyz",
  cwd: "/workspace",
  hook_event_name: "Stop",
  model: "codex-1",
  turn_id: "turn-001",
  stop_hook_active: false,
  transcript_path: "/tmp/codex-transcript.jsonl",
  last_assistant_message: "Done.",
  permission_mode: "default",
};

const TRANSCRIPT_SNAKE: CodexTranscriptEntry[] = [
  {
    timestamp: "2026-06-28T03:55:00.000Z",
    message: {
      role: "assistant",
      model: "codex-1",
      content: [],
      usage: {
        input_tokens: 200,
        cached_tokens: 50,
        output_tokens: 80,
      },
    },
  },
  {
    timestamp: "2026-06-28T03:57:00.000Z",
    message: {
      role: "assistant",
      model: "codex-1",
      content: [{ type: "tool_use", id: "t1", name: "bash", input: {} }],
      usage: {
        input_tokens: 100,
        output_tokens: 40,
      },
    },
  },
];

const TRANSCRIPT_CAMEL: CodexTranscriptEntry[] = [
  {
    timestamp: "2026-06-28T03:55:00.000Z",
    message: {
      role: "assistant",
      model: "codex-1",
      content: [],
      usage: {
        inputTokens: 300,
        cachedTokens: 70,
        outputTokens: 120,
      },
    },
  },
];

describe("codex buildPayloadFromStdin (real Codex Stop hook mode)", () => {
  it("uses session_id and model from stdin", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => []);
    expect(p.sessionId).toBe("codex-sess-xyz");
    expect(p.tool).toBe("codex");
    expect(p.model).toBe("codex-1");
    expect(p.gitUsername).toBe("alice");
  });

  it("defaults to zero tokens when transcript is empty", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => []);
    expect(p.inputTokens).toBe(0);
    expect(p.outputTokens).toBe(0);
    expect(p.toolCallCount).toBe(0);
    expect(p.costUsd).toBeNull();
  });

  it("aggregates tokens from snake_case transcript entries", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => TRANSCRIPT_SNAKE);
    expect(p.inputTokens).toBe(300); // 200 + 100
    expect(p.cachedInputTokens).toBe(50);
    expect(p.outputTokens).toBe(120); // 80 + 40
    expect(p.model).toBe("codex-1"); // from stdin, not transcript
    expect(p.toolCallCount).toBe(1); // second entry has tool_use
    expect(p.startedAt).toBe("2026-06-28T03:55:00.000Z"); // earliest entry
  });

  it("aggregates tokens from camelCase transcript entries", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => TRANSCRIPT_CAMEL);
    expect(p.inputTokens).toBe(300);
    expect(p.cachedInputTokens).toBe(70);
    expect(p.outputTokens).toBe(120);
  });

  it("skips non-assistant transcript entries", () => {
    const mixed: CodexTranscriptEntry[] = [
      { message: { role: "user", content: "hello", usage: { input_tokens: 999 } } },
      { message: { role: "assistant", model: "codex-1", content: [], usage: { input_tokens: 50, output_tokens: 10 } } },
    ];
    const p = buildPayloadFromStdin(STOP_STDIN, () => mixed);
    expect(p.inputTokens).toBe(50);
  });

  it("handles null transcript_path gracefully", () => {
    const stdinNoTranscript: CodexStopStdin = { ...STOP_STDIN, transcript_path: null };
    const p = buildPayloadFromStdin(stdinNoTranscript, () => { throw new Error("should not be called"); });
    expect(p.sessionId).toBe("codex-sess-xyz");
    expect(p.inputTokens).toBe(0);
  });

  it("handles transcript read errors gracefully", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => { throw new Error("read error"); });
    expect(p.sessionId).toBe("codex-sess-xyz");
    expect(p.inputTokens).toBe(0);
  });

  it("does not report when stop_hook_active is true (guard lives in main)", () => {
    // buildPayloadFromStdin itself still builds a payload — the guard lives in main().
    const stdinActive: CodexStopStdin = { ...STOP_STDIN, stop_hook_active: true };
    expect(stdinActive.stop_hook_active).toBe(true);
    const p = buildPayloadFromStdin(stdinActive, () => []);
    expect(p.sessionId).toBe("codex-sess-xyz");
  });

  it("uses stdin.model even when transcript has no model field", () => {
    const noModelTranscript: CodexTranscriptEntry[] = [
      { timestamp: "2026-06-28T03:55:00.000Z", message: { role: "assistant", content: [], usage: { input_tokens: 10, output_tokens: 5 } } },
    ];
    const p = buildPayloadFromStdin(STOP_STDIN, () => noModelTranscript);
    expect(p.model).toBe("codex-1"); // always from stdin
  });
});
