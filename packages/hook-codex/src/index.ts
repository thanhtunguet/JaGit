#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jigit/agent-reporter";

export interface CodexRecord {
  type?: string;
  timestamp?: string;
  payload?: {
    id?: string;
    cwd?: string;
    timestamp?: string;
    model?: string;
    type?: string;
    info?: {
      total_token_usage?: {
        input_tokens?: number;
        cached_input_tokens?: number;
        output_tokens?: number;
      };
    } | null;
  };
}

const TOOL_CALL_SUBTYPES = new Set(["function_call", "custom_tool_call", "web_search_call"]);

export function buildPayload(
  sessionId: string,
  cwd: string | undefined,
  records: CodexRecord[],
): AgentSessionPayload {
  let model = "unknown";
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let toolCallCount = 0;

  for (const r of records) {
    if (r.type === "turn_context" && r.payload?.model) {
      model = r.payload.model;
    }
    if (r.type === "event_msg" && r.payload?.type === "token_count" && r.payload.info) {
      const usage = r.payload.info.total_token_usage;
      if (usage) {
        inputTokens = usage.input_tokens ?? 0;
        cachedInputTokens = usage.cached_input_tokens ?? 0;
        outputTokens = usage.output_tokens ?? 0;
      }
    }
    if (r.type === "response_item" && r.payload?.type && TOOL_CALL_SUBTYPES.has(r.payload.type)) {
      toolCallCount += 1;
    }
  }

  const sessionMeta = records.find((r) => r.type === "session_meta");
  const startedAt = records.find((r) => r.timestamp)?.timestamp ?? sessionMeta?.payload?.timestamp ?? new Date().toISOString();

  return {
    tool: "codex",
    sessionId,
    gitUsername: resolveGitUsername(cwd),
    model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costUsd: null,
    toolCallCount,
    startedAt,
  };
}

function readJsonl(path: string): CodexRecord[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as CodexRecord;
      } catch {
        return {} as CodexRecord;
      }
    });
}

function findLatestSessionFile(root: string): string | undefined {
  let latestPath: string | undefined;
  let latestMtime = -Infinity;

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".jsonl") && stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latestPath = fullPath;
      }
    }
  }

  walk(root);
  return latestPath;
}

function parseArgs(argv: string[]): { file?: string } {
  const fileIdx = argv.indexOf("--file");
  if (fileIdx !== -1 && argv[fileIdx + 1]) {
    return { file: argv[fileIdx + 1] };
  }
  return {};
}

async function main(): Promise<void> {
  try {
    const { file } = parseArgs(process.argv.slice(2));
    const filePath = file ?? findLatestSessionFile(join(homedir(), ".codex", "sessions"));
    if (!filePath) return;

    const records = readJsonl(filePath);
    const sessionMeta = records.find((r) => r.type === "session_meta");
    const sessionId = sessionMeta?.payload?.id ?? filePath;
    const cwd = sessionMeta?.payload?.cwd;

    await reportSession(buildPayload(sessionId, cwd, records));
  } catch (err) {
    console.error("[hook-codex]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
