import { describe, it, expect } from "vitest";
import { normalizeJira, normalizeGitlab, dedupeKey } from "./normalize.js";

const issueFields = (assigneeId: string | null) => ({
  project: { key: "JAGIT" },
  issuetype: { name: "Bug" },
  summary: "Fix login bug",
  description: "Steps to reproduce …",
  assignee: assigneeId ? { accountId: assigneeId } : null,
});

const jiraUpdated = (assigneeId: string) => ({
  webhookEvent: "jira:issue_updated",
  timestamp: 1718000000,
  issue: { key: "JAGIT-7", fields: issueFields(assigneeId) },
});

const jiraCreated = (assigneeId: string) => ({
  webhookEvent: "jira:issue_created",
  timestamp: 1718000001,
  issue: { key: "JAGIT-8", fields: issueFields(assigneeId) },
});

const commentEvt = (commentBody: string, event = "comment_updated") => ({
  webhookEvent: event,
  timestamp: 1718000002,
  comment: { id: "42", body: commentBody },
  issue: { key: "JAGIT-7", fields: issueFields(null) },
});

describe("normalizeJira", () => {
  describe("issue_assigned trigger", () => {
    it("returns trigger for jira:issue_updated when assignee matches bot", () => {
      const t = normalizeJira(jiraUpdated("bot-acc-1"), "bot-acc-1");
      expect(t).toMatchObject({
        source: "jira",
        triggerType: "issue_assigned",
        issueKey: "JAGIT-7",
        projectKey: "JAGIT",
        issueType: "Bug",
        summary: "Fix login bug",
        commentBody: "",
      });
    });

    it("returns trigger for jira:issue_created when assignee matches bot", () => {
      const t = normalizeJira(jiraCreated("bot-acc-1"), "bot-acc-1");
      expect(t).toMatchObject({
        source: "jira",
        triggerType: "issue_assigned",
        issueKey: "JAGIT-8",
      });
    });

    it("returns null when assignee does not match bot", () => {
      expect(normalizeJira(jiraUpdated("someone-else"), "bot-acc-1")).toBeNull();
    });

    it("returns null when issue has no assignee", () => {
      const body = { ...jiraUpdated("bot-acc-1"), issue: { key: "JAGIT-7", fields: issueFields(null) } };
      expect(normalizeJira(body, "bot-acc-1")).toBeNull();
    });
  });

  describe("comment_mention trigger", () => {
    it("returns trigger for comment_updated when bot is mentioned", () => {
      const t = normalizeJira(commentEvt("Hey [~accountid:bot-acc-1] fix this"), "bot-acc-1");
      expect(t).toMatchObject({
        source: "jira",
        triggerType: "comment_mention",
        issueKey: "JAGIT-7",
        commentBody: "Hey [~accountid:bot-acc-1] fix this",
      });
    });

    it("returns trigger for comment_created when bot is mentioned", () => {
      const t = normalizeJira(commentEvt("please [~accountid:bot-acc-1] do it", "comment_created"), "bot-acc-1");
      expect(t).toMatchObject({ triggerType: "comment_mention" });
    });

    it("returns null when bot is not mentioned in comment", () => {
      expect(normalizeJira(commentEvt("Hey @someone else"), "bot-acc-1")).toBeNull();
    });

    it("returns null when comment body is missing", () => {
      const body = { webhookEvent: "comment_updated", comment: { id: "1" }, issue: { key: "X", fields: {} } };
      expect(normalizeJira(body, "bot-acc-1")).toBeNull();
    });
  });

  it("returns null for unrecognised event types", () => {
    expect(normalizeJira({ webhookEvent: "jira:issue_deleted" }, "bot-acc-1")).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("is stable for the same trigger", () => {
    const t = normalizeJira(jiraUpdated("bot-acc-1"), "bot-acc-1")!;
    expect(dedupeKey(t)).toBe(dedupeKey(t));
  });

  it("differs for different issue keys", () => {
    const t1 = normalizeJira(jiraUpdated("bot-acc-1"), "bot-acc-1")!;
    const t2 = { ...t1, issueKey: "JAGIT-8", eventId: "other" };
    expect(dedupeKey(t1)).not.toBe(dedupeKey(t2));
  });
});

describe("normalizeGitlab", () => {
  it("returns null (stub for Phase 2+)", () => {
    expect(normalizeGitlab({}, "bot-user")).toBeNull();
  });
});
