import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraWorklog } from "./jira-worklog.js";

// Mock PrismaService
vi.mock("./prisma.js", () => ({
  prisma: {
    credential: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe("createJiraWorklog", () => {
  const mockCredential = {
    id: "cred-1",
    kind: "jira",
    name: "default",
    secrets: { accessToken: "test-token" },
    meta: { baseUrl: "https://test.atlassian.net" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create worklog with formatted comment", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 201 }));

    await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000, // 2.5 hours
      baseTokens: 2000000,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/2/issue/PROJ-123/worklog",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
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

  it("should handle missing credentials gracefully", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(null);

    // Should not throw
    await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("should handle API errors gracefully", async () => {
    const { prisma } = await import("./prisma.js");
    vi.mocked(prisma.credential.findUnique).mockResolvedValue(mockCredential as any);
    vi.mocked(fetch).mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    // Should not throw
    await createJiraWorklog({
      ticketId: "PROJ-123",
      durationMs: 9000000,
      baseTokens: 2000000,
    });
  });
});
