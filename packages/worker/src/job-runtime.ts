import type { AcpSession } from "./acp/client.js";
import type { IGitAdapter } from "./adapters/interfaces.js";

export interface JobRuntime {
  acpSession: AcpSession | null;
  workdir: string | null;
  git: IGitAdapter;
}

const runtimes = new Map<string, JobRuntime>();

export function registerRuntime(jobId: string, runtime: JobRuntime): void {
  runtimes.set(jobId, runtime);
}

export function updateRuntime(jobId: string, patch: Partial<JobRuntime>): void {
  const current = runtimes.get(jobId);
  if (!current) return;
  runtimes.set(jobId, { ...current, ...patch });
}

export function clearRuntime(jobId: string): void {
  runtimes.delete(jobId);
}

export async function abortJobAgent(jobId: string): Promise<void> {
  const rt = runtimes.get(jobId);
  if (!rt?.acpSession) return;
  await rt.acpSession.stop();
  rt.acpSession = null;
}

export async function cleanupJobWorktree(jobId: string): Promise<void> {
  const rt = runtimes.get(jobId);
  if (!rt?.workdir) return;
  await rt.git.removeWorktree(rt.workdir);
  rt.workdir = null;
}

export async function cleanupJobRuntime(jobId: string): Promise<void> {
  await abortJobAgent(jobId);
  await cleanupJobWorktree(jobId);
  clearRuntime(jobId);
}
