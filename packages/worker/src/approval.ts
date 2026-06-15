import { makeRedis, controlChannel, loadConfig } from "@jigit/shared";

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
  const redis = makeRedis(cfg.redisUrl);
  const channel = controlChannel(opts.jobId);
  await redis.subscribe(channel);

  return new Promise<string>((resolve) => {
    let resolved = false;

    const timer = setTimeout(async () => {
      if (resolved) return;
      resolved = true;
      await opts.resolveApproval(opts.approvalId, opts.denyOptionId, "system");
      await redis.quit();
      resolve(opts.denyOptionId);
    }, cfg.approvalTimeoutMs);

    redis.on("message", async (_ch: string, msg: string) => {
      try {
        const signal = JSON.parse(msg);
        if (
          signal.type === "approval" &&
          signal.approvalId === opts.approvalId &&
          !resolved
        ) {
          resolved = true;
          clearTimeout(timer);
          await redis.quit();
          resolve(signal.chosenOptionId as string);
        }
      } catch { /* ignore */ }
    });
  });
}
