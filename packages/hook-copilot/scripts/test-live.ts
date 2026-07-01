#!/usr/bin/env tsx
/**
 * Live integration test for hook-copilot.
 *
 * Runs against real VS Code Copilot Chat debug-log data on disk — no temp
 * directories, no mocks. All variable inputs are taken from command-line
 * arguments so nothing is hard-coded.
 *
 * Usage:
 *   pnpm --filter @jagit/hook-copilot test:live \
 *     --session-id  <sessionId>   \
 *     --workspace-id <workspaceId> \
 *     [--base-dir   <path>]        \
 *     [--timestamp  <iso8601>]
 *
 * Options:
 *   --session-id    Required. The Copilot Chat session ID (UUID found in the
 *                   transcript filename or debug-logs directory name).
 *   --workspace-id  Optional. The workspaceStorage folder name. When omitted,
 *                   the code auto-discovers the workspace that contains the
 *                   given session directory.
 *   --base-dir      Optional. Override the root workspaceStorage directory.
 *                   Defaults to the platform-appropriate path for the current OS.
 *   --timestamp     Optional. ISO 8601 hook timestamp used to rank workspaces by
 *                   recency when auto-discovering. Defaults to now.
 *
 * Exit codes:
 *   0  — success (usage resolved and printed)
 *   1  — missing required args or resolution failure
 */

import { resolveDebugUsageBySession, platformWorkspaceStorageResolver } from "../src/index.js";

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

function usage(): void {
  console.error(`
Usage:
  pnpm --filter @jagit/hook-copilot test:live \\
    --session-id  <sessionId>    \\
    [--workspace-id <workspaceId>] \\
    [--base-dir   <path>]          \\
    [--timestamp  <iso8601>]

  --session-id    Required. Copilot Chat session ID (UUID).
  --workspace-id  Optional. workspaceStorage folder name (auto-discovered if omitted).
  --base-dir      Optional. Override the platform workspaceStorage root.
  --timestamp     Optional. ISO 8601 hook timestamp for recency ranking (default: now).
`.trim());
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

const sessionId = args["session-id"];
if (!sessionId) {
  console.error("Error: --session-id is required.\n");
  usage();
  process.exit(1);
}

const workspaceId = args["workspace-id"]; // optional
const baseDir = args["base-dir"] ?? platformWorkspaceStorageResolver().resolve();
const timestamp = args["timestamp"] ?? new Date().toISOString();

console.log("─── hook-copilot live test ───────────────────────────────────────");
console.log(`  session-id   : ${sessionId}`);
console.log(`  workspace-id : ${workspaceId ?? "(auto-discover)"}`);
console.log(`  base-dir     : ${baseDir}`);
console.log(`  timestamp    : ${timestamp}`);
console.log("──────────────────────────────────────────────────────────────────");

const usage_ = resolveDebugUsageBySession(sessionId, timestamp, baseDir, workspaceId);

if (!usage_) {
  console.error(
    `\nFailed to resolve debug usage.\n` +
    `  Make sure VS Code Copilot Chat has been used in this session and the\n` +
    `  debug-log directory exists at:\n` +
    `  ${baseDir}/<workspaceId>/GitHub.copilot-chat/debug-logs/${sessionId}/main.jsonl\n`,
  );
  process.exit(1);
}

console.log("\nResolved usage:");
console.log(JSON.stringify(usage_, null, 2));

// ─── Per-model breakdown ──────────────────────────────────────────────────────

console.log("\nPer-model breakdown:");
for (const [model, bucket] of Object.entries(usage_.modelUsage)) {
  console.log(
    `  ${model.padEnd(40)} input=${bucket.inputTokens}  cached=${bucket.cachedInputTokens}  output=${bucket.outputTokens}  total=${bucket.totalTokens}  obs=${bucket.observations}`,
  );
}

console.log("\nDone.");
