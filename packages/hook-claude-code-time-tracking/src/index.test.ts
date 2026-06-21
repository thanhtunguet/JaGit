import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPayload } from "./index.js";
import * as state from "./state.js";
import * as git from "./git.js";

vi.mock("./state.js", () => ({
  readState: vi.fn(),
  writeState: vi.fn(),
  getStatePath: (cwd: string, sessionId: string) => `${cwd}/.jigit-session-${sessionId}.json`,
}));

vi.mock("./git.js", () => ({
  getHeadSha: vi.fn(),
}));

vi.mock("@jigit/agent-reporter", () => ({
  reportSession: vi.fn(),
}));

describe("buildPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize state on first call", async () => {
    vi.mocked(state.readState).mockReturnValue(null);
    vi.mocked(git.getHeadSha).mockReturnValue("abc123");
    vi.mocked(state.writeState).mockImplementation(() => {});

    const stdin = {
      session_id: "test-session-1",
      timestamp: "2026-06-21T10:00:00Z",
      cwd: "/tmp/test",
    };

    const result = await buildPayload(stdin);

    expect(result.sessionId).toBe("test-session-1");
    expect(result.initialCommitSha).toBe("abc123");
    expect(result.totalDurationMs).toBe(0);
    expect(state.writeState).toHaveBeenCalledWith(
      "/tmp/test/.jigit-session-test-session-1.json",
      expect.objectContaining({
        sessionId: "test-session-1",
        initialCommitSha: "abc123",
        totalDurationMs: 0,
      })
    );
  });

  it("should accumulate duration on subsequent calls", async () => {
    vi.mocked(state.readState).mockReturnValue({
      sessionId: "test-session-1",
      initialCommitSha: "abc123",
      totalDurationMs: 3600000,
      lastUpdateTime: "2026-06-21T10:00:00Z",
    });
    vi.mocked(state.writeState).mockImplementation(() => {});

    const stdin = {
      session_id: "test-session-1",
      timestamp: "2026-06-21T11:00:00Z",
      cwd: "/tmp/test",
    };

    const result = await buildPayload(stdin);

    expect(result.totalDurationMs).toBe(7200000); // 2 hours total
  });

  it("should handle missing cwd", async () => {
    vi.mocked(state.readState).mockReturnValue(null);
    vi.mocked(git.getHeadSha).mockImplementation(() => {
      throw new Error("Not a git repository");
    });

    const stdin = {
      session_id: "test-session-2",
      timestamp: "2026-06-21T10:00:00Z",
    };

    const result = await buildPayload(stdin);

    expect(result.initialCommitSha).toBeNull();
  });
});
