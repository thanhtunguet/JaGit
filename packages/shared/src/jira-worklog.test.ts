import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraWorklog } from "./jira-worklog.js";
import { encrypt } from "./crypto.js";

// Mock PrismaService
vi.mock("./prisma.js", () => ({
  prisma: {
    credential: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock config so loadConfig() doesn't require real env vars in tests
vi.mock("./config.js", () => ({
  loadConfig: vi.fn(() => ({ encryptionKey: TEST_ENCRYPTION_KEY })),
}));

// Mock fetch
global.fetch = vi.fn();

// 32-byte key, base64-encoded, matching @jagit/shared's crypto.ts expectations
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

describe("createJiraWorklog", () => {
  // Real credential.secrets are stored as an encrypted JSON blob (see packages/shared/src/credentials.ts
  // and the worker's decrypt-on-read pattern in packages/worker/src/main.ts), never as plaintext keys.
  const mockCredential = {
    id: "cred-1",
    kind: "jira",
    name: "default",
    secrets: { encrypted: encrypt(JSON.stringify({ email: "bot@example.com", token: "test-token" }), TEST_ENCRYPTION_KEY) },
    meta: { baseUrl: "https://test.atlassian.net" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create worklog with formatted comment and return success:true", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 201 }));

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000, // 2.5 hours
      baseTokens: 2000000,
    });

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/2/issue/PROJ-123/worklog",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("bot@example.com:test-token").toString("base64")}`,
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining("AI Logwork for PROJ-123"),
      })
    );

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.timeSpentSeconds).toBe(9000);
    expect(body.comment).toContain("2h 30m");
    expect(body.comment).toContain("2,000,000 BT");
  });

  it("should clamp sub-minute durations to 60 seconds (Jira rejects timeSpentSeconds that round to 0 minutes)", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 201 }));

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 21483, // 21 seconds — below Jira's 1-minute loggable minimum
      baseTokens: 50000,
    });

    expect(result).toEqual({ success: true });
    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.timeSpentSeconds).toBe(60);
  });

  it("should return success:false with a reason when credentials are missing", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(null);

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result).toEqual({ success: false, reason: "No Jira credentials found" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should return success:false with a reason when the encrypted secrets blob is missing", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue({
      ...mockCredential,
      secrets: {},
    } as any);

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result).toEqual({ success: false, reason: "Incomplete Jira credentials" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should return success:false with a reason when the decrypted secrets have no token", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue({
      ...mockCredential,
      secrets: { encrypted: encrypt(JSON.stringify({ email: "bot@example.com" }), TEST_ENCRYPTION_KEY) },
    } as any);

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result).toEqual({ success: false, reason: "Incomplete Jira credentials" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("should return success:false with a reason on a non-retryable API error", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain("401");
  });

  it("should return success:false with a reason when retries are exhausted", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("Server Error", { status: 500 }));

    const result = await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
  }, 10000);
});
