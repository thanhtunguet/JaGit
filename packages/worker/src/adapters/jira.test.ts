import { describe, it, expect, vi } from "vitest";
import { JiraAdapter } from "./jira.js";

describe("JiraAdapter", () => {
  const makeFetch = (body: unknown, ok = true) =>
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });

  it("fetches an issue from the correct REST path", async () => {
    const fetchMock = makeFetch({ key: "JIGIT-7", fields: {
      issuetype: { name: "Bug" }, summary: "Fix login", description: "details" } });
    const a = new JiraAdapter({
      baseUrl: "https://jira.example.com",
      email: "bot@example.com",
      token: "token-123",
      maxRetries: 0,
      fetch: fetchMock as any,
    });
    const issue = await a.getIssue("JIGIT-7");
    expect(issue.key).toBe("JIGIT-7");
    expect(issue.type).toBe("Bug");
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/api/3/issue/JIGIT-7");
    expect((opts.headers as Record<string, string>)?.["Authorization"]).toMatch(/^Basic /);
  });

  it("throws on non-ok response", async () => {
    const fetchMock = makeFetch({}, false);
    const a = new JiraAdapter({ baseUrl: "https://j", email: "e", token: "t",
      maxRetries: 0, fetch: fetchMock as any });
    await expect(a.getIssue("X-1")).rejects.toThrow("jira 500");
  });
});
