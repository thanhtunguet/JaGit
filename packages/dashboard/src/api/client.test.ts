// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listJobs, getJob, controlJob, retryJob, deleteJob, decideApproval, getOverviewStats,
  listCredentials, createCredential, updateCredential, deleteCredential,
  listPendingApprovals, getStoredToken, setStoredToken,
} from "./client.js";

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
      ok: true,
      json: async () => ({ activeJobs: 0, doneToday: 0, doneYesterday: 0, approvalQueue: 0, totalTokensUsed: 0, throughput: [], statusDistribution: [], recentEvents: [] }),
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
});
