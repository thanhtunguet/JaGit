import { createHash } from "node:crypto";

export interface NormalizedTrigger {
  source: "jira" | "gitlab";
  triggerType: "issue_assigned" | "comment_mention";
  issueKey: string;
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  /** For comment triggers: the raw comment body; otherwise empty string. */
  commentBody: string;
  eventId: string;
}

export function normalizeJira(body: any, botAccountId: string): NormalizedTrigger | null {
  const event: string = body?.webhookEvent ?? "";

  // Issue assigned to bot (created or updated)
  if (event === "jira:issue_created" || event === "jira:issue_updated") {
    const fields = body?.issue?.fields;
    if (!fields) return null;
    if (fields?.assignee?.accountId !== botAccountId) return null;

    return {
      source: "jira",
      triggerType: "issue_assigned",
      issueKey: body.issue.key as string,
      projectKey: fields.project?.key as string,
      issueType: fields.issuetype?.name ?? "Task",
      summary: fields.summary ?? "",
      description: fields.description ?? "",
      commentBody: "",
      eventId: String(body.timestamp ?? body.issue.key),
    };
  }

  // Comment that @mentions the bot — [~accountid:<id>]
  if (event === "comment_created" || event === "comment_updated") {
    const comment = body?.comment;
    const issue = body?.issue;
    if (!comment || !issue) return null;
    const mentionTag = `[~accountid:${botAccountId}]`;
    if (!(comment.body as string)?.includes(mentionTag)) return null;

    const fields = issue.fields;
    return {
      source: "jira",
      triggerType: "comment_mention",
      issueKey: issue.key as string,
      projectKey: fields?.project?.key as string,
      issueType: fields?.issuetype?.name ?? "Task",
      summary: fields?.summary ?? "",
      description: fields?.description ?? "",
      commentBody: comment.body as string,
      eventId: String(body.timestamp ?? comment.id),
    };
  }

  return null;
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
