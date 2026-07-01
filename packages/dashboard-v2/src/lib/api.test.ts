// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listJobs, getJob, controlJob, retryJob, deleteJob, decideApproval, getOverviewStats,
  listCredentials, createCredential, updateCredential, deleteCredential,
  listPendingApprovals, getStoredToken, setStoredToken, removeStoredToken,
  listMcpServers, createMcpServer, updateMcpServer, deleteMcpServer,
  listRepoMappings, createRepoMapping, updateRepoMapping, deleteRepoMapping,
  listAgentTemplates, createAgentTemplate, updateAgentTemplate, deleteAgentTemplate,
  listUsageUsers, getUserUploads, getLatestUpload, deleteUsageUser,
  listAgentSessions, getAgentSession, formatCredentialName,
} from "@/lib/api.js";

vi.stubGlobal("fetch", vi.fn());

describe("API client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listJobs calls GET /api/jobs", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listJobs();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/jobs");
  });

  it("getOverviewStats calls GET /api/stats/overview", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, json: async () => ({ activeJobs: 0, doneToday: 0, doneYesterday: 0, approvalQueue: 0, totalTokensUsed: 0, throughput: [], statusDistribution: [], recentEvents: [] }),
    } as any);
    await getOverviewStats();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/stats/overview");
  });

  it("getJob calls GET /api/jobs/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "j1" }) } as any);
    const job = await getJob("j1");
    expect(job.id).toBe("j1");
  });

  it("controlJob calls POST /api/jobs/:id/:action", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await controlJob("j1", "stop");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/jobs/j1/stop", expect.objectContaining({ method: "POST" }));
  });

  it("retryJob calls POST /api/jobs/:id/retry", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ accepted: true, jobId: "j1" }) } as any);
    await retryJob("j1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/jobs/j1/retry", expect.objectContaining({ method: "POST" }));
  });

  it("deleteJob calls DELETE /api/jobs/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) } as any);
    await deleteJob("j1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/jobs/j1", expect.objectContaining({ method: "DELETE" }));
  });

  it("decideApproval calls POST /api/approvals/:id/decide", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await decideApproval("a1", "allow");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/approvals/a1/decide",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ optionId: "allow" }) })
    );
  });

  it("listCredentials calls GET /api/credentials", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listCredentials();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/credentials");
  });

  it("createCredential calls POST /api/credentials with JSON body", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "c1" }) } as any);
    await createCredential({ kind: "gitlab", name: "GL", meta: { baseUrl: "https://gl.example.com" }, secrets: { token: "t" } });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/credentials",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("updateCredential calls PATCH /api/credentials/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ updated: true }) } as any);
    await updateCredential("c1", { name: "GL2", meta: {}, secrets: {} });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/credentials/c1");
    expect((init as RequestInit).method).toBe("PATCH");
  });

  it("deleteCredential calls DELETE /api/credentials/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) } as any);
    await deleteCredential("c1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/credentials/c1", expect.objectContaining({ method: "DELETE" }));
  });

  it("listPendingApprovals calls GET /api/approvals", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listPendingApprovals();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/approvals");
  });

  it("listMcpServers calls GET /api/mcp-servers", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listMcpServers();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/mcp-servers");
  });

  it("createMcpServer calls POST /api/mcp-servers", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "m1" }) } as any);
    await createMcpServer({
      name: "test",
      transport: "stdio",
      command: "npx",
      args: [],
      env: {},
      enabled: true,
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/mcp-servers",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("deleteMcpServer calls DELETE /api/mcp-servers/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) } as any);
    await deleteMcpServer("m1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/mcp-servers/m1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends Authorization Bearer header when token is in sessionStorage", async () => {
    setStoredToken("secret-token");
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listJobs();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret-token" });
    setStoredToken(""); // cleanup
  });

  it("getStoredToken / setStoredToken round-trip", () => {
    setStoredToken("abc123");
    expect(getStoredToken()).toBe("abc123");
    setStoredToken("");
  });

  it("listUsageUsers calls GET /api/usage/users", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listUsageUsers();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/usage/users");
  });

  it("getUserUploads calls GET /api/usage/users/:username", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await getUserUploads("alice");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/usage/users/alice");
  });

  it("getLatestUpload calls GET /api/usage/users/:username/latest", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "up1", data: {} }) } as any);
    await getLatestUpload("alice");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/usage/users/alice/latest", expect.anything());
  });

  it("deleteUsageUser calls DELETE /api/usage/users/:username", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) } as any);
    await deleteUsageUser("alice");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/usage/users/alice",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("listAgentSessions builds query string from filters", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ rows: [], total: 0 }) } as any);
    await listAgentSessions({ tool: "claude-code", username: "alice", limit: 50, offset: 0 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("/api/agent-sessions?");
    expect(url).toContain("tool=claude-code");
    expect(url).toContain("username=alice");
    expect(url).toContain("limit=50");
  });

  it("getAgentSession builds /agent-sessions/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "as1" }) } as any);
    const row = await getAgentSession("as1");
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agent-sessions/as1");
    expect(row.id).toBe("as1");
  });

  it("listRepoMappings calls GET /api/repo-mappings", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listRepoMappings();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/repo-mappings");
  });

  it("createRepoMapping calls POST /api/repo-mappings", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "rm1" }) } as any);
    await createRepoMapping({ jiraProjectKey: "ABC", gitlabProjectId: "repo", defaultBaseBranch: "main", branchPrefixRules: {}, agentTemplateId: "at1" });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/repo-mappings", expect.objectContaining({ method: "POST" }));
  });

  it("updateRepoMapping calls PUT /api/repo-mappings/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "rm1" }) } as any);
    await updateRepoMapping("rm1", { jiraProjectKey: "ABC", gitlabProjectId: "repo", defaultBaseBranch: "main", branchPrefixRules: {}, agentTemplateId: "at1" });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/repo-mappings/rm1", expect.objectContaining({ method: "PUT" }));
  });

  it("deleteRepoMapping calls DELETE /api/repo-mappings/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) } as any);
    await deleteRepoMapping("rm1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/repo-mappings/rm1", expect.objectContaining({ method: "DELETE" }));
  });

  it("listAgentTemplates calls GET /api/agent-templates", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listAgentTemplates();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agent-templates");
  });

  it("createAgentTemplate calls POST /api/agent-templates", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "at1" }) } as any);
    await createAgentTemplate({ name: "t1", model: "m1", prompt: "p1" });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/agent-templates", expect.objectContaining({ method: "POST" }));
  });

  it("updateAgentTemplate calls PUT /api/agent-templates/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "at1" }) } as any);
    await updateAgentTemplate("at1", { name: "t1", model: "m1", prompt: "p1" });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/agent-templates/at1", expect.objectContaining({ method: "PUT" }));
  });

  it("deleteAgentTemplate calls DELETE /api/agent-templates/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) } as any);
    await deleteAgentTemplate("at1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/agent-templates/at1", expect.objectContaining({ method: "DELETE" }));
  });

  it("updateMcpServer calls PUT /api/mcp-servers/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "m1" }) } as any);
    await updateMcpServer("m1", { name: "mcp1", transport: "stdio", enabled: true });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/mcp-servers/m1", expect.objectContaining({ method: "PUT" }));
  });

  it("formatCredentialName formats default credential name to its type", () => {
    expect(formatCredentialName({ name: "default", kind: "jira" })).toBe("Jira");
    expect(formatCredentialName({ name: "default", kind: "gitlab" })).toBe("GitLab");
    expect(formatCredentialName({ name: "prod-jira", kind: "jira" })).toBe("Jira (prod-jira)");
  });

  it("getStoredToken / setStoredToken / removeStoredToken round-trip", () => {
    setStoredToken("test-token");
    expect(getStoredToken()).toBe("test-token");
    removeStoredToken();
    expect(getStoredToken()).toBe("");
  });

  it("dispatches jigit:auth-unauthorized event on 401 response", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as any);
    await expect(listJobs()).rejects.toThrow("HTTP 401");
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "jigit:auth-unauthorized" }));
    dispatchSpy.mockRestore();
  });
});


