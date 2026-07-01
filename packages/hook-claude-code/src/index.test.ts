import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@jagit/agent-reporter", async (orig) => ({
  ...(await orig<typeof import("@jagit/agent-reporter")>()),
  resolveGitUsername: () => "alice",
}));
import { buildPayload } from "./index.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
  };
});

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

import { execSync } from "node:child_process";
import * as fs from "node:fs";

// Mock execSync for git operations
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
  ...actual,
  execSync: vi.fn(),
}});

describe("buildPayload with time tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include time tracking data when state file exists", async () => {
    // Mock file system
    const mockStateFile = JSON.stringify({
      sessionId: "test-session-1",
      initialCommitSha: "abc123",
      totalDurationMs: 3600000,
      lastUpdateTime: "2026-06-21T10:00:00Z",
    });

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes("git diff")) {
        return "10\t5\tfile1.ts\n20\t10\tfile2.ts\n";
      }
      return "";
    });

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockImplementation((path: any) => {
      if (path.includes(".jigit-session-")) {
        return mockStateFile;
      }
      return JSON.stringify([
        { type: "user", timestamp: "2026-06-21T10:00:00Z", message: { role: "user" } },
        { type: "assistant", timestamp: "2026-06-21T10:01:00Z", message: { role: "assistant", model: "claude-3-5-sonnet-20241022", usage: { input_tokens: 1000, output_tokens: 500 } } },
      ]);
    });

    const stdin = {
      session_id: "test-session-1",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/tmp/repo",
    };

    const payload = buildPayload(stdin);

    expect(payload.durationMs).toBe(3600000);
    expect(payload.initialCommitSha).toBe("abc123");
    expect(payload.linesAdded).toBe(30);
    expect(payload.linesRemoved).toBe(15);
  });

  it("should handle missing state file", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      return JSON.stringify([
        { type: "user", timestamp: "2026-06-21T10:00:00Z", message: { role: "user" } },
        { type: "assistant", timestamp: "2026-06-21T10:01:00Z", message: { role: "assistant", model: "claude-3-5-sonnet-20241022", usage: { input_tokens: 1000, output_tokens: 500 } } },
      ]);
    });

    const stdin = {
      session_id: "test-session-2",
      transcript_path: "/tmp/transcript.jsonl",
      cwd: "/tmp/repo",
    };

    const payload = buildPayload(stdin);

    expect(payload.durationMs).toBeUndefined();
    expect(payload.linesAdded).toBeUndefined();
  });
});

import { calculateBaseTokens, parseGitDiff } from "./index.js";

describe("calculateBaseTokens", () => {
  it("should convert costUsd to base tokens", () => {
    const result = calculateBaseTokens(0.50);
    expect(result).toBeCloseTo(2000000, -4); // ~2M BT
  });

  it("should return null for null costUsd", () => {
    const result = calculateBaseTokens(null);
    expect(result).toBeNull();
  });
});

describe("parseGitDiff", () => {
  it("should parse git diff --numstat output", () => {
    const output = "10\t5\tfile1.ts\n20\t10\tfile2.ts\n";
    const result = parseGitDiff(output);
    expect(result.linesAdded).toBe(30);
    expect(result.linesRemoved).toBe(15);
  });

  it("should handle binary files", () => {
    const output = "-\t-\tbinary.png\n10\t5\tfile.ts\n";
    const result = parseGitDiff(output);
    expect(result.linesAdded).toBe(10);
    expect(result.linesRemoved).toBe(5);
  });
});
