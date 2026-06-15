import { Redis } from "ioredis";
import type { ControlSignal } from "./types.js";

/** Channel name for live job event streaming (dashboard SSE) */
export const jobChannel = (jobId: string) => `job:${jobId}`;

/** Channel name for worker control signals (stop/pause/resume/approval) */
export const controlChannel = (jobId: string) => `control:${jobId}`;

/** Channel name for global approval events (SSE + worker graph) */
export const approvalsChannel = "approvals";

export function makeRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
}

/** Publish any JSON-serialisable payload to a channel */
export async function publishEvent(url: string, channel: string, data: unknown): Promise<void> {
  const client = makeRedis(url);
  try {
    await client.publish(channel, JSON.stringify(data));
  } finally {
    await client.quit();
  }
}

/** Publish a control signal to the worker monitoring the given job */
export async function publishControl(url: string, signal: ControlSignal): Promise<void> {
  return publishEvent(url, controlChannel(signal.jobId), signal);
}
