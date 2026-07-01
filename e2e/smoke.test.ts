import { describe, it, expect } from "vitest";

/**
 * E2E smoke test: POST a synthetic Jira webhook and poll until the job
 * reaches `opening_mr` or `done` within 30 seconds.
 *
 * Requires:
 *   - API running on http://localhost:3000 (or E2E_API_URL)
 *   - Worker running with JIGIT_FAKE_ADAPTERS=1
 *   - DATABASE_URL, REDIS_URL set
 */

const API = process.env["E2E_API_URL"] ?? "http://localhost:3000";
const SECRET = process.env["API_WEBHOOK_SECRET"] ?? "dev-secret";
const BOT_ID = process.env["JIRA_BOT_ACCOUNT_ID"] ?? "bot-account-1";

const TERMINAL_STATUSES = new Set(["done", "opening_mr", "stopped", "failed"]);

async function pollJob(jobId: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/jobs/${jobId}`);
    if (res.ok) {
      const job = (await res.json()) as { status: string };
      if (TERMINAL_STATUSES.has(job.status)) return job.status;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Job ${jobId} did not reach a terminal status within ${timeoutMs}ms`);
}

describe.skipIf(!process.env["DATABASE_URL"])("E2E smoke", () => {
  let jobId: string;

  it("health check passes", async () => {
    const res = await fetch(`${API}/health`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("Jira webhook creates a job", async () => {
    const payload = {
      webhookEvent: "jira:issue_updated",
      timestamp: Date.now(),
      issue: {
        key: `E2E-${Date.now()}`,
        fields: {
          project: { key: "E2E" },
          issuetype: { name: "Bug" },
          summary: "E2E smoke test issue",
          description: "Created by E2E smoke test",
          assignee: { accountId: BOT_ID },
        },
      },
    };

    const res = await fetch(`${API}/webhooks/jira`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-jigit-secret": SECRET },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBeTruthy();
    jobId = body.jobId;
  });

  it("job progresses to opening_mr or done", async () => {
    const status = await pollJob(jobId);
    expect(["opening_mr", "done"]).toContain(status);
  }, 35_000);
});
