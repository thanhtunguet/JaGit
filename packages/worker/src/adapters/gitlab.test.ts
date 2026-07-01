import { describe, it, expect, vi } from "vitest";
import { GitlabAdapter } from "./gitlab.js";

describe("GitlabAdapter", () => {
  it("builds a clone URL with embedded token", () => {
    const a = new GitlabAdapter({ baseUrl: "https://gitlab.example.com",
      token: "glpat-xyz", maxRetries: 0 });
    const url = a.cloneUrlWithToken("42");
    expect(url).toContain("oauth2:glpat-xyz@");
    expect(url).toContain("42");
  });

  it("opens a MR and returns webUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ web_url: "https://gitlab.example.com/ns/repo/-/merge_requests/1", iid: 1 }),
    });
    const a = new GitlabAdapter({ baseUrl: "https://gitlab.example.com",
      token: "t", maxRetries: 0, fetch: fetchMock as any });
    const result = await a.openMergeRequest({
      projectId: "42", sourceBranch: "bugfix/X-1-foo",
      targetBranch: "main", title: "Fix X", description: "desc",
    });
    expect(result.webUrl).toContain("merge_requests/1");
  });

  it("includes the response body in the error when GitLab rejects the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      text: async () => JSON.stringify({ message: { source_branch: ["does not exist"] } }),
    });
    const a = new GitlabAdapter({ baseUrl: "https://gitlab.example.com",
      token: "t", maxRetries: 0, fetch: fetchMock as any });
    await expect(a.openMergeRequest({
      projectId: "42", sourceBranch: "bugfix/X-1-foo",
      targetBranch: "main", title: "Fix X", description: "desc",
    })).rejects.toThrow(/source_branch.*does not exist/);
  });
});
