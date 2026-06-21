import { execSync } from "node:child_process";

export function getHeadSha(cwd?: string): string | null {
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return sha;
  } catch {
    return null;
  }
}
