import { createHash } from "node:crypto";

export interface NormalizedTrigger {
  source: "jira" | "gitlab";
  issueKey: string;
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  eventId: string;
}

export function normalizeJira(body: any, botAccountId: string): NormalizedTrigger | null {
  if (body?.webhookEvent !== "jira:issue_updated") return null;
  const fields = body?.issue?.fields;
  if (!fields) return null;
  if (fields?.assignee?.accountId !== botAccountId) return null;

  return {
    source: "jira",
    issueKey: body.issue.key as string,
    projectKey: fields.project?.key as string,
    issueType: fields.issuetype?.name ?? "Task",
    summary: fields.summary ?? "",
    description: fields.description ?? "",
    eventId: String(body.timestamp ?? body.issue.key),
  };
}

/** Phase 2+ — GitLab MR/comment triggers */
export function normalizeGitlab(_body: any, _botUser: string): NormalizedTrigger | null {
  return null;
}

export function dedupeKey(t: NormalizedTrigger): string {
  return createHash("sha1")
    .update(`${t.source}:${t.issueKey}:${t.eventId}`)
    .digest("hex");
}
