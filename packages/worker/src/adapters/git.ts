import { execa } from "execa";
import type { IGitAdapter } from "./interfaces.js";

export class GitAdapter implements IGitAdapter {
  async clone(url: string, workdir: string): Promise<void> {
    await execa("git", ["clone", "--depth=1", url, workdir]);
  }

  async createBranch(workdir: string, branch: string): Promise<void> {
    await execa("git", ["checkout", "-b", branch], { cwd: workdir });
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
