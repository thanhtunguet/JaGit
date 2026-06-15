import { Queue, Worker, type Processor } from "bullmq";
import { JOB_QUEUE, type JigitJobData } from "./types.js";

const connection = (url: string) => ({ connection: { url } });

/** Creates the BullMQ queue used by the API to enqueue jobs */
export const createQueue = (redisUrl: string) =>
  new Queue<JigitJobData>(JOB_QUEUE, connection(redisUrl));

/** Creates the BullMQ worker consumed by the worker service */
export const createWorker = <T = unknown>(
  redisUrl: string,
  processor: Processor<T>,
  concurrency: number
) =>
  new Worker<T>(JOB_QUEUE, processor, { ...connection(redisUrl), concurrency });

// Re-export for convenience
export type { JigitJobData } from "./types.js";
