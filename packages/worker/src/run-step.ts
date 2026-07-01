import type { IJobSink } from "./adapters/interfaces.js";

export async function runStep<T>(
  sink: IJobSink,
  jobId: string,
  stepName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const stepId = await sink.startStep(jobId, stepName);
  try {
    const result = await fn();
    await sink.finishStep(stepId, "done");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sink.addEvent(jobId, {
      type: "step_error",
      message: `${stepName} failed: ${message}`,
      level: "error",
      payload: { step: stepName, error: message },
    });
    await sink.finishStep(stepId, "failed", { error: message });
    throw err;
  }
}
