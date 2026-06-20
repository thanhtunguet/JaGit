import { execSync } from "node:child_process";

function tryGit(args: string, cwd: string): string | undefined {
  try {
    const out = execSync(`git -C "${cwd}" ${args}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export function resolveGitUsername(cwd: string = process.cwd()): string {
  const fromEnv = process.env.JAGIT_GIT_USERNAME?.trim();
  if (fromEnv) return fromEnv;
  return tryGit("config user.email", cwd) ?? tryGit("config user.name", cwd) ?? "unknown";
}
