#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jagit/agent-reporter";

export interface CopilotInfo {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  toolCallCount?: number | null;
}

export function buildPayload(cwd: string | undefined, info?: CopilotInfo): AgentSessionPayload {
  return {
    tool: "copilot",
    sessionId: `copilot-${Date.now()}-${process.pid}`,
    gitUsername: resolveGitUsername(cwd),
    model: info?.model ?? "copilot",
    inputTokens: info?.inputTokens ?? 0,
    cachedInputTokens: info?.cachedInputTokens ?? 0,
    outputTokens: info?.outputTokens ?? 0,
    costUsd: null,
    toolCallCount: info?.toolCallCount ?? null,
    startedAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  try {
    await reportSession(buildPayload(process.cwd()));
  } catch (err) {
    console.error("[hook-copilot]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

const isMain = import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) void main();
