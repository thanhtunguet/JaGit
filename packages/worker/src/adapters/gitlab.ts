import { withRetry } from "@jigit/shared";
import type { IGitlabAdapter, MrResult } from "./interfaces.js";

export interface GitlabOpts {
  baseUrl: string;
  token: string;
  maxRetries: number;
  fetch?: typeof fetch;
}

export class GitlabAdapter implements IGitlabAdapter {
  private readonly fetch: typeof fetch;
  constructor(private readonly o: GitlabOpts) {
    this.fetch = o.fetch ?? globalThis.fetch;
  }

  cloneUrlWithToken(projectId: string): string {
    const url = new URL(this.o.baseUrl);
    return `${url.protocol}//oauth2:${this.o.token}@${url.host}/${projectId}.git`;
  }

  openMergeRequest(opts: {
    projectId: string; sourceBranch: string; targetBranch: string;
    title: string; description: string;
  }): Promise<MrResult> {
    return withRetry(async () => {
      const r = await this.fetch(
        `${this.o.baseUrl}/api/v4/projects/${encodeURIComponent(opts.projectId)}/merge_requests`,
        {
          method: "POST",
          headers: {
            "PRIVATE-TOKEN": this.o.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source_branch: opts.sourceBranch,
            target_branch: opts.targetBranch,
            title: opts.title,
            description: opts.description,
            remove_source_branch: true,
          }),
        }
      );
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`gitlab ${r.status}${body ? `: ${body}` : ""}`);
      }
      const data = await r.json() as any;
      return { webUrl: data.web_url, iid: data.iid };
    }, { maxRetries: this.o.maxRetries, baseDelayMs: 500 });
  }
}
