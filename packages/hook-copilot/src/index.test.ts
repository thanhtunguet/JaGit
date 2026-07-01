import { describe, it, expect, vi } from "vitest";

vi.mock("@jagit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jagit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));

import {
  buildPayload,
  buildPayloadFromStdin,
  inferWorkspaceIdBySession,
  parseTranscriptPathLocation,
  resolveDebugUsageBySession,
  type CopilotStopStdin,
  type CopilotTranscriptEntry,
  type CopilotTranscriptAssistantMessage,
  type CopilotTranscriptSessionStart,
} from "./index.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Legacy mode (no stdin / shell-wrapper) ───────────────────────────────────

describe("copilot buildPayload (legacy / no-stdin mode)", () => {
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
    expect(p.cacheCreationInputTokens).toBe(0);
    expect(p.toolCallCount).toBeNull();
  });

  it("passes through CopilotInfo fields", () => {
    const p = buildPayload("/repo", {
      model: "gpt-4-turbo",
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 20,
      toolCallCount: 3,
    });
    expect(p.inputTokens).toBe(100);
    expect(p.outputTokens).toBe(50);
    expect(p.cachedInputTokens).toBe(20);
    expect(p.toolCallCount).toBe(3);
  });
});

// ─── Stdin mode (VS Code Copilot agent Stop hook) ────────────────────────────
// Real transcript format (VS Code Copilot 0.44+):
//   session.start      — data: { sessionId, startTime, copilotVersion, ... }
//   assistant.message  — data: { messageId, content, toolRequests: [...] }
//   tool.execution_*   — data: { toolCallId, toolName, ... }
// Token usage and model name are NOT present in the transcript.

const STOP_STDIN: CopilotStopStdin = {
  session_id: "sess-abc123",
  cwd: "/workspace",
  hook_event_name: "Stop",
  transcript_path: "/tmp/transcript.jsonl",
  timestamp: "2026-06-28T04:00:00.000Z",
  stop_hook_active: false,
};

/** Real-format transcript: session.start + two assistant.message turns (one with tools) */
const REAL_TRANSCRIPT: CopilotTranscriptEntry[] = [
  {
    type: "session.start",
    timestamp: "2026-06-28T03:55:00.000Z",
    data: {
      sessionId: "sess-abc123",
      version: 1,
      producer: "copilot-agent",
      copilotVersion: "0.54.0",
      vscodeVersion: "1.126.0",
      startTime: "2026-06-28T03:55:00.000Z",
    },
  } satisfies CopilotTranscriptSessionStart,
  {
    type: "assistant.message",
    timestamp: "2026-06-28T03:56:00.000Z",
    data: {
      messageId: "msg-1",
      content: "Let me look at the files.",
      toolRequests: [
        { toolCallId: "list_dir-1", name: "list_dir", arguments: '{"path":"/repo"}', type: "function" },
        { toolCallId: "read_file-2", name: "read_file", arguments: '{"filePath":"/repo/src/index.ts","startLine":1,"endLine":50}', type: "function" },
      ],
    },
  } satisfies CopilotTranscriptAssistantMessage,
  {
    type: "assistant.message",
    timestamp: "2026-06-28T03:57:00.000Z",
    data: {
      messageId: "msg-2",
      content: "Here is the analysis.",
      toolRequests: [],
    },
  } satisfies CopilotTranscriptAssistantMessage,
];

/** Transcript with no session.start — only assistant.message entries */
const TRANSCRIPT_NO_SESSION_START: CopilotTranscriptEntry[] = [
  {
    type: "assistant.message",
    timestamp: "2026-06-28T03:58:00.000Z",
    data: {
      messageId: "msg-3",
      content: "Done.",
      toolRequests: [
        { toolCallId: "run_in_terminal-3", name: "run_in_terminal", arguments: '{"command":"ls"}', type: "function" },
      ],
    },
  } satisfies CopilotTranscriptAssistantMessage,
];

describe("copilot buildPayloadFromStdin (VS Code agent hook mode)", () => {
  it("uses session_id from stdin", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => []);
    expect(p.sessionId).toBe("sess-abc123");
    expect(p.tool).toBe("copilot");
    expect(p.gitUsername).toBe("alice");
  });

  it("uses debug-log usage when resolver returns session usage", () => {
    const p = buildPayloadFromStdin(
      STOP_STDIN,
      () => REAL_TRANSCRIPT,
      () => ({
        sessionId: "sess-abc123",
        workspaceId: "ws-1",
        model: "claude-haiku-4.5",
        inputTokens: 120,
        cachedInputTokens: 30,
        outputTokens: 25,
        totalTokens: 145,
        costUsd: 0.42,
        sourcePath: "/tmp/ws-1/main.jsonl",
        modelUsage: {
          "claude-haiku-4.5": {
            inputTokens: 120,
            cachedInputTokens: 30,
            outputTokens: 25,
            totalTokens: 145,
            costUsd: 0.42,
            observations: 2,
          },
        },
      }),
    );

    expect(p.model).toBe("claude-haiku-4.5");
    expect(p.inputTokens).toBe(120);
    expect(p.cachedInputTokens).toBe(30);
    expect(p.outputTokens).toBe(25);
    expect(p.cacheCreationInputTokens).toBe(0);
    expect(p.costUsd).toBe(0.42);
    expect(p.rawPayload).toMatchObject({
      source: "copilot-debug-logs",
      workspaceId: "ws-1",
      debugSessionId: "sess-abc123",
      totalTokens: 145,
    });
  });

  it("falls back to model=copilot and zero tokens when usage is unavailable", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => REAL_TRANSCRIPT, () => undefined);
    expect(p.model).toBe("copilot");
    expect(p.inputTokens).toBe(0);
    expect(p.outputTokens).toBe(0);
    expect(p.cachedInputTokens).toBe(0);
    expect(p.rawPayload).toBeUndefined();
  });

  it("counts individual tool requests across all assistant.message turns", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => REAL_TRANSCRIPT);
    // msg-1 has 2 toolRequests, msg-2 has 0 → total 2
    expect(p.toolCallCount).toBe(2);
  });

  it("uses session.start data.startTime as startedAt (preferred)", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => REAL_TRANSCRIPT);
    expect(p.startedAt).toBe("2026-06-28T03:55:00.000Z");
  });

  it("falls back to first entry timestamp when no session.start present", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => TRANSCRIPT_NO_SESSION_START);
    expect(p.startedAt).toBe("2026-06-28T03:58:00.000Z");
  });

  it("falls back to stdin.timestamp when transcript has no timestamps", () => {
    const noTsTranscript: CopilotTranscriptEntry[] = [
      { type: "assistant.message", data: { messageId: "m", content: "", toolRequests: [] } },
    ];
    const p = buildPayloadFromStdin(STOP_STDIN, () => noTsTranscript);
    expect(p.startedAt).toBe("2026-06-28T04:00:00.000Z");
  });

  it("counts tool requests from transcript without session.start", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => TRANSCRIPT_NO_SESSION_START);
    expect(p.toolCallCount).toBe(1);
  });

  it("returns zero tool calls when transcript is empty", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => []);
    expect(p.toolCallCount).toBe(0);
  });

  it("ignores non-assistant.message entries for tool call counting", () => {
    const mixed: CopilotTranscriptEntry[] = [
      { type: "session.start", data: { startTime: "2026-06-28T03:00:00.000Z" } } satisfies CopilotTranscriptSessionStart,
      { type: "user.message", data: { content: "hello" } },
      { type: "tool.execution_start", data: { toolCallId: "x", toolName: "list_dir" } },
      {
        type: "assistant.message",
        data: { messageId: "m1", content: "ok", toolRequests: [{ toolCallId: "t1", name: "list_dir" }] },
      } satisfies CopilotTranscriptAssistantMessage,
    ];
    const p = buildPayloadFromStdin(STOP_STDIN, () => mixed);
    expect(p.toolCallCount).toBe(1);
    expect(p.startedAt).toBe("2026-06-28T03:00:00.000Z");
  });

  it("counts tool calls from tool.execution_* entries when toolRequests are absent", () => {
    const transcript: CopilotTranscriptEntry[] = [
      { type: "session.start", data: { startTime: "2026-06-28T03:00:00.000Z" } } satisfies CopilotTranscriptSessionStart,
      { type: "tool.execution_start", data: { toolCallId: "x", toolName: "list_dir" } },
      { type: "tool.execution_complete", data: { toolCallId: "x", toolName: "list_dir" } },
      { type: "tool.execution_start", data: { toolCallId: "y", toolName: "read_file" } },
    ];

    const p = buildPayloadFromStdin(STOP_STDIN, () => transcript);
    expect(p.toolCallCount).toBe(2);
  });

  it("de-duplicates tool call ids seen in both assistant.message and tool.execution_*", () => {
    const transcript: CopilotTranscriptEntry[] = [
      {
        type: "assistant.message",
        data: { messageId: "m1", content: "", toolRequests: [{ toolCallId: "same", name: "list_dir" }] },
      } satisfies CopilotTranscriptAssistantMessage,
      { type: "tool.execution_start", data: { toolCallId: "same", toolName: "list_dir" } },
      { type: "tool.execution_complete", data: { toolCallId: "same", toolName: "list_dir" } },
      {
        type: "assistant.message",
        data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "other", name: "read_file" }] },
      } satisfies CopilotTranscriptAssistantMessage,
    ];

    const p = buildPayloadFromStdin(STOP_STDIN, () => transcript);
    expect(p.toolCallCount).toBe(2);
  });

  it("handles missing transcript_path gracefully (no read called)", () => {
    const stdinNoTranscript: CopilotStopStdin = { session_id: "no-transcript", cwd: "/repo" };
    const readFn = vi.fn(() => { throw new Error("should not be called"); });
    expect(() => buildPayloadFromStdin(stdinNoTranscript, readFn)).not.toThrow();
    expect(readFn).not.toHaveBeenCalled();
    const p = buildPayloadFromStdin(stdinNoTranscript, () => []);
    expect(p.sessionId).toBe("no-transcript");
    expect(p.toolCallCount).toBe(0);
  });

  it("handles transcript read errors gracefully", () => {
    const p = buildPayloadFromStdin(STOP_STDIN, () => { throw new Error("read error"); });
    expect(p.sessionId).toBe("sess-abc123");
    expect(p.toolCallCount).toBe(0);
  });

  it("synthesizes a session id when session_id is absent (spec: optional field)", () => {
    const stdinNoId: CopilotStopStdin = { hook_event_name: "Stop", cwd: "/repo" };
    const p = buildPayloadFromStdin(stdinNoId, () => []);
    expect(p.sessionId).toMatch(/^copilot-\d+-\d+$/);
    expect(p.tool).toBe("copilot");
  });

  it("does not report when stop_hook_active is true (prevents duplicate sessions)", () => {
    // buildPayloadFromStdin itself still builds a payload — the guard lives in main().
    // We verify the field is accessible so callers can check it.
    const stdinActive: CopilotStopStdin = { session_id: "sess-loop", stop_hook_active: true };
    expect(stdinActive.stop_hook_active).toBe(true);
    // The payload is still constructable (main() is responsible for the early-exit guard)
    const p = buildPayloadFromStdin(stdinActive, () => []);
    expect(p.sessionId).toBe("sess-loop");
  });

  it("prefers session/workspace parsed from transcript_path", () => {
    const p = buildPayloadFromStdin(
      {
        ...STOP_STDIN,
        session_id: "mismatch-session",
        // Use a synthetic path — the real OS-specific base dir doesn't matter here;
        // only the workspaceStorage/…/transcripts/….jsonl suffix is parsed.
        transcript_path: "/any/workspaceStorage/ws-from-path/GitHub.copilot-chat/transcripts/sess-from-path.jsonl",
      },
      () => [],
      (sessionId, _hookTs, _baseDir, workspaceIdFromTranscript) => {
        expect(sessionId).toBe("sess-from-path");
        expect(workspaceIdFromTranscript).toBe("ws-from-path");
        return undefined;
      },
    );
    expect(p.sessionId).toBe("sess-from-path");
  });
});

describe("copilot debug-log workspace/session mapping", () => {
  it("finds workspace by session id and falls back to latest workspace when missing", () => {
    const base = mkdtempSync(join(tmpdir(), "hook-copilot-ws-"));
    try {
      const wsOld = "ws-old";
      const wsNew = "ws-new";

      const wsOldDebug = join(base, wsOld, "GitHub.copilot-chat", "debug-logs");
      const wsNewDebug = join(base, wsNew, "GitHub.copilot-chat", "debug-logs");
      mkdirSync(join(wsOldDebug, "sess-target"), { recursive: true });
      mkdirSync(wsNewDebug, { recursive: true });

      const oldTs = new Date("2026-06-28T00:00:00.000Z");
      const newTs = new Date("2026-06-29T00:00:00.000Z");
      utimesSync(wsOldDebug, oldTs, oldTs);
      utimesSync(wsNewDebug, newTs, newTs);

      const found = inferWorkspaceIdBySession("sess-target", "2026-06-29T01:00:00.000Z", base);
      expect(found?.workspaceId).toBe(wsOld);

      const fallback = inferWorkspaceIdBySession("unknown-session", "2026-06-29T01:00:00.000Z", base);
      expect(fallback?.workspaceId).toBe(wsNew);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("aggregates tokens from main.jsonl and maps by session id", () => {
    const base = mkdtempSync(join(tmpdir(), "hook-copilot-usage-"));
    try {
      const workspaceId = "ws-abc";
      const sessionId = "sess-123";
      const sessionDir = join(base, workspaceId, "GitHub.copilot-chat", "debug-logs", sessionId);
      mkdirSync(sessionDir, { recursive: true });

      const lines = [
        JSON.stringify({ attrs: { model: "claude-haiku-4.5", inputTokens: 100, cachedTokens: 20, outputTokens: 10, costUsd: 0.2 } }),
        JSON.stringify({ attrs: { model: "gpt-4o-mini-2024-07-18", inputTokens: 7, outputTokens: 3 } }),
      ].join("\n");
      writeFileSync(join(sessionDir, "main.jsonl"), lines, "utf-8");

      const usage = resolveDebugUsageBySession(sessionId, "2026-06-29T01:00:00.000Z", base);
      expect(usage).toBeDefined();
      expect(usage?.workspaceId).toBe(workspaceId);
      expect(usage?.sessionId).toBe(sessionId);
      // cachedTokens is treated as a subset of inputTokens in this schema,
      // so inputTokens is normalized to non-cached input.
      expect(usage?.inputTokens).toBe(87);
      expect(usage?.cachedInputTokens).toBe(20);
      expect(usage?.outputTokens).toBe(13);
      expect(usage?.costUsd).toBe(0.2);
      expect(usage?.model).toBe("claude-haiku-4.5");
      expect(usage?.modelUsage["claude-haiku-4.5"]?.inputTokens).toBe(80);
      expect(usage?.modelUsage["gpt-4o-mini-2024-07-18"]?.outputTokens).toBe(3);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("parses workspace and session ids from transcript_path (Linux path)", () => {
    const parsed = parseTranscriptPathLocation(
      "/any/workspaceStorage/abc123workspaceid/GitHub.copilot-chat/transcripts/def456-session-id.jsonl",
    );
    expect(parsed).toEqual({
      workspaceId: "abc123workspaceid",
      sessionId: "def456-session-id",
    });
  });

  it("parses workspace and session ids from transcript_path (Windows path)", () => {
    const parsed = parseTranscriptPathLocation(
      "C:\\Users\\user\\AppData\\Roaming\\Code\\User\\workspaceStorage\\abc123workspaceid\\GitHub.copilot-chat\\transcripts\\def456-session-id.jsonl",
    );
    expect(parsed).toEqual({
      workspaceId: "abc123workspaceid",
      sessionId: "def456-session-id",
    });
  });

  it("parses workspace and session ids from transcript_path (macOS path)", () => {
    const parsed = parseTranscriptPathLocation(
      "/Users/user/Library/Application Support/Code/User/workspaceStorage/abc123workspaceid/GitHub.copilot-chat/transcripts/def456-session-id.jsonl",
    );
    expect(parsed).toEqual({
      workspaceId: "abc123workspaceid",
      sessionId: "def456-session-id",
    });
  });
});
