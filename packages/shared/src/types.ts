import { z } from "zod";

/** The BullMQ queue name — single constant used everywhere */
export const JOB_QUEUE = "jigit-jobs";

/** Payload pushed onto the BullMQ queue when a job is created */
export const JigitJobDataSchema = z.object({ jobId: z.string() });
export type JigitJobData = z.infer<typeof JigitJobDataSchema>;

/** Control signals published to Redis controlChannel(jobId) */
export type ControlSignalType = "stop" | "pause" | "resume" | "approval" | "delete";

export interface ControlSignal {
  type: ControlSignalType;
  jobId: string;
  approvalId?: string;
  chosenOptionId?: string;
}
