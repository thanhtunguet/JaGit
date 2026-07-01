import { prisma } from "./prisma.js";
import { withRetry } from "./retry.js";
import { decrypt } from "./crypto.js";
import { loadConfig } from "./config.js";

export interface CreateWorklogOpts {
  ticketId: string;
  durationMs: number;
  baseTokens: number;
  comment?: string;
}

export interface CreateWorklogResult {
  success: boolean;
  reason?: string;
}

function formatJiraApiError(status: number, detail: string): string {
  return `Jira API error: ${status} ${detail}`;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

function formatBT(bt: number): string {
  return bt.toLocaleString("en-US");
}

// Jira's worklog API rejects timeSpentSeconds values that round to 0 minutes under the
// project's time-tracking format with "Worklog must not be null" / "must indicate time spent".
const MIN_JIRA_WORKLOG_SECONDS = 60;

export async function createJiraWorklog(opts: CreateWorklogOpts): Promise<CreateWorklogResult> {
  try {
    const credential = await prisma.credential.findUnique({
      where: { kind_name: { kind: "jira", name: "default" } },
    });

    if (!credential) {
      console.error("[jira-worklog] No Jira credentials found, skipping worklog");
      return { success: false, reason: "No Jira credentials found" };
    }

    const meta = credential.meta as { baseUrl?: string };
    const encrypted = (credential.secrets as { encrypted?: string }).encrypted;

    if (!encrypted || !meta.baseUrl) {
      console.error("[jira-worklog] Incomplete Jira credentials, skipping worklog");
      return { success: false, reason: "Incomplete Jira credentials" };
    }

    const { encryptionKey } = loadConfig();
    const secrets = JSON.parse(decrypt(encrypted, encryptionKey)) as { email?: string; token?: string };

    if (!secrets.email || !secrets.token) {
      console.error("[jira-worklog] Incomplete Jira credentials, skipping worklog");
      return { success: false, reason: "Incomplete Jira credentials" };
    }

    // Jira Cloud API tokens authenticate via HTTP Basic auth (email:token), not Bearer —
    // Bearer is reserved for OAuth/Connect-app sessions and Jira rejects it with
    // "Failed to parse Connect Session Auth Token".
    const basicAuth = Buffer.from(`${secrets.email}:${secrets.token}`).toString("base64");

    const timeSpentSeconds = Math.max(Math.floor(opts.durationMs / 1000), MIN_JIRA_WORKLOG_SECONDS);
    const durationStr = formatDuration(opts.durationMs);
    const btStr = formatBT(opts.baseTokens);

    const defaultComment = `AI Logwork for ${opts.ticketId}\nTime Spent: ${durationStr}\nToken Spent: ${btStr} BT`;

    const url = `${meta.baseUrl.replace(/\/+$/, "")}/rest/api/2/issue/${opts.ticketId}/worklog`;

    return await withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeSpentSeconds,
          comment: opts.comment ?? defaultComment,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (res.status >= 500) {
          throw new Error(formatJiraApiError(res.status, detail));
        }
        const reason = formatJiraApiError(res.status, detail);
        console.error(`[jira-worklog] Non-retryable error ${res.status}: ${detail}`);
        return { success: false, reason };
      }

      console.log(`[jira-worklog] Created worklog for ${opts.ticketId}`);
      return { success: true };
    }, { maxRetries: 3, baseDelayMs: 1000 });

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[jira-worklog] Failed to create worklog:", reason);
    return { success: false, reason };
  }
}
