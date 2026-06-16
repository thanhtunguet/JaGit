import { loadConfig, waitForApprovalDecision } from "@jigit/shared";

export interface AwaitApprovalOpts {
  approvalId: string;
  jobId: string;
  denyOptionId: string;
  resolveApproval: (id: string, optionId: string, via: string) => Promise<void>;
}

/**
 * Subscribes to the job's control channel and waits for an approval signal
 * matching `approvalId`. On timeout, auto-rejects and returns `denyOptionId`.
 */
export async function awaitApproval(opts: AwaitApprovalOpts): Promise<string> {
  const cfg = loadConfig();
  const chosen = await waitForApprovalDecision({
    redisUrl: cfg.redisUrl,
    jobId: opts.jobId,
    approvalId: opts.approvalId,
    timeoutMs: cfg.approvalTimeoutMs,
    denyOptionId: opts.denyOptionId,
  });

  if (chosen === opts.denyOptionId) {
    await opts.resolveApproval(opts.approvalId, opts.denyOptionId, "system");
  }

  return chosen;
}
