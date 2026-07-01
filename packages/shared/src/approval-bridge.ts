import { makeRedis, controlChannel } from "./events.js";

export interface WaitForApprovalDecisionOpts {
  redisUrl: string;
  jobId: string;
  approvalId: string;
  timeoutMs: number;
  denyOptionId: string;
}

/**
 * Subscribes to the job control channel and waits for an approval signal
 * matching `approvalId`. On timeout returns `denyOptionId`.
 */
export function waitForApprovalDecision(
  opts: WaitForApprovalDecisionOpts,
): Promise<string> {
  const redis = makeRedis(opts.redisUrl);
  const channel = controlChannel(opts.jobId);

  return new Promise<string>((resolve) => {
    let resolved = false;

    const finish = (optionId: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      redis.quit().catch(() => {});
      resolve(optionId);
    };

    const timer = setTimeout(() => finish(opts.denyOptionId), opts.timeoutMs);

    redis.subscribe(channel).catch(() => finish(opts.denyOptionId));

    redis.on("message", (_ch: string, msg: string) => {
      try {
        const signal = JSON.parse(msg) as {
          type?: string;
          approvalId?: string;
          chosenOptionId?: string;
        };
        if (
          signal.type === "approval" &&
          signal.approvalId === opts.approvalId &&
          signal.chosenOptionId
        ) {
          finish(signal.chosenOptionId);
        }
      } catch {
        /* ignore malformed */
      }
    });
  });
}
