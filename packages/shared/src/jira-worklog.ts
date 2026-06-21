import { prisma } from "./prisma.js";
import { withRetry } from "./retry.js";

export interface CreateWorklogOpts {
  ticketId: string;
  durationMs: number;
  baseTokens: number;
  comment?: string;
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

export async function createJiraWorklog(opts: CreateWorklogOpts): Promise<void> {
  try {
    const credential = await prisma.credential.findUnique({
      where: { kind_name: { kind: "jira", name: "default" } },
    });

    if (!credential) {
      console.error("[jira-worklog] No Jira credentials found, skipping worklog");
      return;
    }

    const secrets = credential.secrets as { accessToken?: string };
    const meta = credential.meta as { baseUrl?: string };

    if (!secrets.accessToken || !meta.baseUrl) {
      console.error("[jira-worklog] Incomplete Jira credentials, skipping worklog");
      return;
    }

    const timeSpentSeconds = Math.floor(opts.durationMs / 1000);
    const durationStr = formatDuration(opts.durationMs);
    const btStr = formatBT(opts.baseTokens);

    const defaultComment = `AI Logwork for ${opts.ticketId}\nTime Spent: ${durationStr}\nToken Spent: ${btStr} BT`;

    const url = `${meta.baseUrl.replace(/\/+$/, "")}/rest/api/2/issue/${opts.ticketId}/worklog`;

    await withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secrets.accessToken}`,
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
          throw new Error(`Jira API error: ${res.status} ${detail}`);
        }
        console.error(`[jira-worklog] Non-retryable error ${res.status}: ${detail}`);
        return;
      }

      console.log(`[jira-worklog] Created worklog for ${opts.ticketId}`);
    }, { maxRetries: 3, baseDelayMs: 1000 });

  } catch (err) {
    console.error("[jira-worklog] Failed to create worklog:", err instanceof Error ? err.message : err);
  }
}
