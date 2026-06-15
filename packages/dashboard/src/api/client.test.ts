import { describe, it, expect, vi, beforeEach } from "vitest";
import { listJobs, getJob, controlJob, decideApproval } from "./client.js";

vi.stubGlobal("fetch", vi.fn());

describe("API client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listJobs calls GET /jobs", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listJobs();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/jobs");
  });

  it("getJob calls GET /jobs/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "j1" }) } as any);
    const job = await getJob("j1");
    expect(job.id).toBe("j1");
  });

  it("controlJob calls POST /jobs/:id/:action", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await controlJob("j1", "stop");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/jobs/j1/stop", expect.objectContaining({ method: "POST" }));
  });

  it("decideApproval calls POST /approvals/:id/decide", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await decideApproval("a1", "allow");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/approvals/a1/decide",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ optionId: "allow" }) })
    );
  });
});
