import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const execSyncMock = vi.fn();
vi.mock("node:child_process", () => ({ execSync: (...a: unknown[]) => execSyncMock(...a) }));

import { resolveGitUsername } from "./git-username.js";

describe("resolveGitUsername", () => {
  beforeEach(() => { execSyncMock.mockReset(); delete process.env.JAGIT_GIT_USERNAME; });
  afterEach(() => { delete process.env.JAGIT_GIT_USERNAME; });

  it("prefers JAGIT_GIT_USERNAME env", () => {
    process.env.JAGIT_GIT_USERNAME = "env-user";
    expect(resolveGitUsername("/tmp")).toBe("env-user");
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("falls back to git user.name", () => {
    execSyncMock.mockReturnValueOnce("Alice\n");
    expect(resolveGitUsername("/tmp")).toBe("Alice");
  });

  it("falls back to git user.email when name missing", () => {
    execSyncMock.mockImplementationOnce(() => { throw new Error("no name"); });
    execSyncMock.mockReturnValueOnce("alice@example.com\n");
    expect(resolveGitUsername("/tmp")).toBe("alice@example.com");
  });

  it("returns 'unknown' when git fails entirely", () => {
    execSyncMock.mockImplementation(() => { throw new Error("no git"); });
    expect(resolveGitUsername("/tmp")).toBe("unknown");
  });
});
