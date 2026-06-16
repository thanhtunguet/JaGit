import { withRetry } from "@jigit/shared";
import type { IJiraAdapter, IssueData } from "./interfaces.js";

export interface JiraOpts {
  baseUrl: string;
  email: string;
  token: string;
  maxRetries: number;
  fetch?: typeof fetch;
}

const ADF_BLOCK_TYPES = new Set([
  "paragraph", "heading", "codeBlock", "blockquote", "listItem", "rule", "panel", "table", "tableRow",
]);

/** Walks an Atlassian Document Format node tree, concatenating text content. */
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  let out = n.type === "text" ? n.text ?? "" : n.type === "hardBreak" ? "\n" : "";
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += adfToText(child);
  }
  if (n.type && ADF_BLOCK_TYPES.has(n.type)) out += "\n\n";
  return out;
}

/** Jira Cloud (`/rest/api/3`) returns `description` as ADF, not plain text. */
function descriptionToText(description: unknown): string {
  if (description == null) return "";
  if (typeof description === "string") return description;
  return adfToText(description).replace(/\n{3,}/g, "\n\n").trim();
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
        description: descriptionToText(data.fields?.description),
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
