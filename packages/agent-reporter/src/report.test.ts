import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportSession } from "./report.js";

const valid = {
  tool: "claude-code" as const,
  sessionId: "sess-1",
  gitUsername: "alice",
  model: "claude-opus-4-7",
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 5,
  costUsd: null,
  toolCallCount: 1,
  startedAt: "2026-06-20T10:00:00.000Z",
};

describe("reportSession", () => {
  beforeEach(() => {
    process.env.JAGIT_BASE_URL = "http://api.test";
    process.env.JAGIT_API_KEY = "secret";
    vi.restoreAllMocks();
  });
  afterEach(() => { delete process.env.JAGIT_BASE_URL; delete process.env.JAGIT_API_KEY; });

  it("POSTs to /api/agent-sessions with x-api-key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await reportSession(valid);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/agent-sessions");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("secret");
    expect(JSON.parse(init.body).sessionId).toBe("sess-1");
  });

  it("does not throw on 4xx and does not retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(reportSession(valid)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx then gives up without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(reportSession(valid, { maxRetries: 2, baseDelayMs: 0 })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("skips and warns when env is missing", async () => {
    delete process.env.JAGIT_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportSession(valid);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });

  it("swallows invalid payloads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(reportSession({ ...valid, inputTokens: -1 } as never)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
