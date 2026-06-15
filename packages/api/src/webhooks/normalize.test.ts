import { describe, it, expect } from "vitest";
import { normalizeJira, normalizeGitlab, dedupeKey } from "./normalize.js";

const jiraEvt = (assigneeId: string) => ({
  webhookEvent: "jira:issue_updated",
  timestamp: 1718000000,
  issue: {
    key: "JIGIT-7",
    fields: {
      project: { key: "JIGIT" },
      issuetype: { name: "Bug" },
      summary: "Fix login bug",
      description: "Steps to reproduce …",
      assignee: { accountId: assigneeId },
    },
  },
});

describe("normalizeJira", () => {
  it("returns a NormalizedTrigger when assignee matches bot", () => {
    const t = normalizeJira(jiraEvt("bot-acc-1"), "bot-acc-1");
    expect(t).toMatchObject({
      source: "jira",
      issueKey: "JIGIT-7",
      projectKey: "JIGIT",
      issueType: "Bug",
      summary: "Fix login bug",
    });
  });

  it("returns null when assignee does not match bot", () => {
    expect(normalizeJira(jiraEvt("someone-else"), "bot-acc-1")).toBeNull();
  });

  it("returns null for unrecognised event types", () => {
    expect(normalizeJira({ webhookEvent: "jira:issue_created" }, "bot-acc-1")).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("is stable for the same trigger", () => {
    const t = normalizeJira(jiraEvt("bot-acc-1"), "bot-acc-1")!;
    expect(dedupeKey(t)).toBe(dedupeKey(t));
  });

  it("differs for different issue keys", () => {
    const t1 = normalizeJira(jiraEvt("bot-acc-1"), "bot-acc-1")!;
    const t2 = { ...t1, issueKey: "JIGIT-8", eventId: "other" };
    expect(dedupeKey(t1)).not.toBe(dedupeKey(t2));
  });
});

describe("normalizeGitlab", () => {
  it("returns null (stub for Phase 2+)", () => {
    expect(normalizeGitlab({}, "bot-user")).toBeNull();
  });
});
