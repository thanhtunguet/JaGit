import { withRetry } from "@jagit/shared";
import { AgentSessionPayloadSchema, type AgentSessionPayload } from "./schema.js";

export interface ReportOpts {
  maxRetries?: number;
  baseDelayMs?: number;
}

class RetryableError extends Error {}

export async function reportSession(payload: AgentSessionPayload, opts: ReportOpts = {}): Promise<void> {
  try {
    const parsed = AgentSessionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[agent-reporter] invalid payload, skipping:", parsed.error.message);
      return;
    }

    const baseUrl = process.env.JAGIT_BASE_URL?.trim();
    const apiKey = process.env.JAGIT_API_KEY?.trim();
    if (!baseUrl || !apiKey) {
      console.error("[agent-reporter] JAGIT_BASE_URL and JAGIT_API_KEY required; skipping report");
      return;
    }

    const url = `${baseUrl.replace(/\/+$/, "")}/api/agent-sessions`;
    const maxRetries = opts.maxRetries ?? 3;
    const baseDelayMs = opts.baseDelayMs ?? 500;

    await withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) return;
      const detail = await res.text().catch(() => "");
      if (res.status >= 500) throw new RetryableError(`${res.status} ${detail}`);
      console.error(`[agent-reporter] non-retryable ${res.status}: ${detail}`);
    }, { maxRetries, baseDelayMs });
  } catch (err) {
    console.error("[agent-reporter] report failed:", err instanceof Error ? err.message : err);
  }
}
