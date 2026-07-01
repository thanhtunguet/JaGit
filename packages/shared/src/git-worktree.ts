import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Best-effort removal of a git worktree directory. */
export async function removeWorktree(worktreePath: string): Promise<void> {
  if (!worktreePath) return;
  try {
    await execFileAsync("git", ["worktree", "remove", "--force", worktreePath]);
  } catch {
    // already removed or path invalid
  }
}
