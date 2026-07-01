// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { createRouter, createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree.gen";
import { setStoredToken, removeStoredToken } from "@/lib/api";

vi.stubGlobal("fetch", vi.fn());

describe("Jobs & JobDetail Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStoredToken("test-token");
  });

  afterEach(() => {
    cleanup();
    removeStoredToken();
  });

  const renderWithRouter = async (initialUrl: string) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const history = createMemoryHistory({ initialEntries: [initialUrl] });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    });
    await router.load();
    return render(<RouterProvider router={router} />);
  };

  it("renders live list of jobs from API and handles action buttons", async () => {
    const fakeJobs = [
      {
        id: "job-live-1",
        source: "jira",
        jiraIssueKey: "REAL-999",
        branch: "feature/real-999",
        mrUrl: "https://gitlab.com/mr/999",
        status: "active",
        tokensUsed: 1200,
        costUsd: 0.04,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === "/api/jobs" && (!init || !init.method || init.method === "GET")) {
        return { ok: true, json: async () => fakeJobs } as any;
      }
      if (url === "/api/jobs/job-live-1/pause" && init?.method === "POST") {
        return { ok: true, json: async () => ({}) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    await renderWithRouter("/jobs");

    await waitFor(() => {
      expect(screen.getByText("REAL-999")).toBeDefined();
    });

    const pauseBtn = screen.getByRole("button", { name: "Pause" });
    fireEvent.click(pauseBtn);

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/jobs/job-live-1/pause",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("renders job detail from API and handles approval decision", async () => {
    const fakeJobDetail = {
      id: "job-live-2",
      source: "gitlab",
      jiraIssueKey: "REAL-888",
      branch: "fix/real-888",
      mrUrl: null,
      status: "blocked",
      tokensUsed: 5000,
      costUsd: 0.15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        { id: "s1", name: "clone", status: "done", detail: {}, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() },
      ],
      events: [
        { id: "e1", ts: new Date().toISOString(), level: "agent", type: "tool_call", message: "Running bash", payload: {} },
      ],
      approvals: [
        {
          id: "appr-1",
          kind: "bash",
          prompt: "Allow running rm -rf /tmp/test?",
          options: [{ optionId: "allow", name: "Approve Run" }, { optionId: "deny", name: "Deny" }],
          status: "pending",
        },
      ],
    };

    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === "/api/jobs/job-live-2" && (!init || !init.method || init.method === "GET")) {
        return { ok: true, json: async () => fakeJobDetail } as any;
      }
      if (url === "/api/approvals/appr-1/decide" && init?.method === "POST") {
        return { ok: true, json: async () => ({}) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    await renderWithRouter("/jobs/job-live-2");

    await waitFor(() => {
      expect(screen.getByText("REAL-888")).toBeDefined();
      expect(screen.getByText("Allow running rm -rf /tmp/test?")).toBeDefined();
    });

    const approveBtn = screen.getByRole("button", { name: "Approve Run" });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/approvals/appr-1/decide",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ optionId: "allow" }),
        })
      );
    });
  });
});
