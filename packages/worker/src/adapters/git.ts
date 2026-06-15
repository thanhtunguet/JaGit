import { execa } from "execa";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { IGitAdapter } from "./interfaces.js";

export class GitAdapter implements IGitAdapter {
  private readonly worksRoot: string;

  constructor(worksRoot = "_works") {
    // Resolve relative to cwd so tests can inject a tmp path
    this.worksRoot = worksRoot.startsWith("/")
      ? worksRoot
      : join(process.cwd(), worksRoot);
  }

  /** Clone into _works/<repoName>/ on first call; fetch on subsequent calls. */
  async ensureRepo(url: string, repoName: string): Promise<string> {
    const repoDir = join(this.worksRoot, repoName);
    await mkdir(repoDir, { recursive: true });
    const isGitRepo = await stat(join(repoDir, ".git"))
      .then(() => true)
      .catch(() => false);
    if (isGitRepo) {
      await execa("git", ["fetch", "--all", "--prune"], { cwd: repoDir });
    } else {
      await execa("git", ["clone", "--filter=blob:none", url, repoDir]);
    }
    return repoDir;
  }

  /** Create a worktree at repoDir/.worktrees/<branch> checked out on a new branch. */
  async createWorktree(repoDir: string, branch: string): Promise<string> {
    const wtDir = join(repoDir, ".worktrees", branch);
    await mkdir(join(repoDir, ".worktrees"), { recursive: true });

    // Check if this worktree path is already registered (previous run survived)
    const { stdout: wtList } = await execa("git", ["worktree", "list", "--porcelain"], { cwd: repoDir });
    if (wtList.includes(wtDir)) {
      // Already registered — just return it
      return wtDir;
    }

    // Prune stale worktree records (directory removed but still tracked)
    await execa("git", ["worktree", "prune"], { cwd: repoDir });

    // Check if the branch already exists locally
    const { stdout: branchList } = await execa("git", ["branch", "--list", branch], { cwd: repoDir });
    if (branchList.trim()) {
      // Branch exists — check it out into the new worktree path without re-creating it
      await execa("git", ["worktree", "add", wtDir, branch], { cwd: repoDir });
    } else {
      // New branch — create it from HEAD
      await execa("git", ["worktree", "add", "-b", branch, wtDir, "HEAD"], { cwd: repoDir });
    }
    return wtDir;
  }

  /** Remove the worktree when the job finishes or is abandoned. */
  async removeWorktree(worktreePath: string): Promise<void> {
    await execa("git", ["worktree", "remove", "--force", worktreePath]).catch(() => {
      // best-effort; already removed or path doesn't exist
    });
  }

  async hasChanges(workdir: string): Promise<boolean> {
    const { stdout } = await execa("git", ["status", "--porcelain"], { cwd: workdir });
    return stdout.trim().length > 0;
  }

  async commitAll(workdir: string, message: string): Promise<void> {
    await execa("git", ["add", "-A"], { cwd: workdir });
    await execa("git", ["commit", "-m", message], { cwd: workdir });
  }

  async push(workdir: string, branch: string): Promise<void> {
    await execa("git", ["push", "--set-upstream", "origin", branch], { cwd: workdir });
  }
}
