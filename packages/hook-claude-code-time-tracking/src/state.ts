import { readFileSync, writeFileSync, existsSync, renameSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface TimeTrackingState {
  sessionId: string;
  initialCommitSha: string | null;
  totalDurationMs: number;
  lastUpdateTime: string;
}

export function getStatePath(cwd: string, sessionId: string): string {
  return join(cwd, `.jigit-session-${sessionId}.json`);
}

export function readState(path: string): TimeTrackingState | null {
  try {
    if (!existsSync(path)) return null;
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data) as TimeTrackingState;
  } catch {
    return null;
  }
}

export function writeState(path: string, state: TimeTrackingState): void {
  try {
    // Atomic write: write to temp file, then rename
    const dir = tmpdir();
    const tempPath = join(dir, `jigit-session-${Date.now()}.json`);
    writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
    renameSync(tempPath, path);
  } catch (err) {
    console.error("[time-tracking] Failed to write state:", err);
  }
}
