import { z } from "zod";

/** The BullMQ queue name — single constant used everywhere */
export const JOB_QUEUE = "jagit-jobs";

/** Payload pushed onto the BullMQ queue when a job is created */
export const JagitJobDataSchema = z.object({ jobId: z.string() });
export type JagitJobData = z.infer<typeof JagitJobDataSchema>;

/** Control signals published to Redis controlChannel(jobId) */
export type ControlSignalType = "stop" | "pause" | "resume" | "approval" | "delete";

export interface ControlSignal {
  type: ControlSignalType;
  jobId: string;
  approvalId?: string;
  chosenOptionId?: string;
}
