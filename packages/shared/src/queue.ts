import { Queue, Worker, type Processor } from "bullmq";
import { JOB_QUEUE, type JagitJobData } from "./types.js";

const connection = (url: string) => ({ connection: { url } });

/** Creates the BullMQ queue used by the API to enqueue jobs */
export const createQueue = (redisUrl: string) => {
  const queue = new Queue<JagitJobData>(JOB_QUEUE, connection(redisUrl));
  queue.on("error", (err) => {
    console.error("BullMQ Queue error:", err.message);
  });
  return queue;
};

/** Creates the BullMQ worker consumed by the worker service */
export const createWorker = <T = unknown>(
  redisUrl: string,
  processor: Processor<T>,
  concurrency: number
) => {
  const worker = new Worker<T>(JOB_QUEUE, processor, { ...connection(redisUrl), concurrency });
  worker.on("error", (err) => {
    console.error("BullMQ Worker error:", err.message);
  });
  return worker;
};

// Re-export for convenience
export type { JagitJobData } from "./types.js";
