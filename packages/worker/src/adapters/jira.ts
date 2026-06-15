import { withRetry } from "@jigit/shared";
import type { IJiraAdapter, IssueData } from "./interfaces.js";

export interface JiraOpts {
  baseUrl: string;
  email: string;
  token: string;
  maxRetries: number;
  fetch?: typeof fetch;
}

export class JiraAdapter implements IJiraAdapter {
  private readonly fetch: typeof fetch;
  constructor(private readonly o: JiraOpts) {
    this.fetch = o.fetch ?? globalThis.fetch;
  }

  private auth() {
    return "Basic " + Buffer.from(`${this.o.email}:${this.o.token}`).toString("base64");
  }

  getIssue(key: string): Promise<IssueData> {
    return withRetry(async () => {
      const r = await this.fetch(`${this.o.baseUrl}/rest/api/3/issue/${key}`, {
        headers: { Authorization: this.auth(), Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`jira ${r.status}`);
      const data = await r.json() as any;
      return {
        key: data.key,
        type: data.fields?.issuetype?.name ?? "Task",
        summary: data.fields?.summary ?? "",
        description: data.fields?.description ?? "",
      };
    }, { maxRetries: this.o.maxRetries, baseDelayMs: 500 });
  }

  addWorklog(key: string, text: string): Promise<void> {
    return withRetry(async () => {
      const r = await this.fetch(`${this.o.baseUrl}/rest/api/3/issue/${key}/comment`, {
        method: "POST",
        headers: {
          Authorization: this.auth(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          body: {
            type: "doc", version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          },
        }),
      });
      if (!r.ok) throw new Error(`jira ${r.status}`);
    }, { maxRetries: this.o.maxRetries, baseDelayMs: 500 }).then(() => undefined);
  }
}
