#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jigit/agent-reporter";

interface StopStdin { session_id: string; transcript_path: string; cwd?: string }
interface TranscriptEntry {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
}

function readTranscript(path: string): TranscriptEntry[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => { try { return JSON.parse(l) as TranscriptEntry; } catch { return {} as TranscriptEntry; } });
}

function hasToolUse(content: unknown): boolean {
  return Array.isArray(content) && content.some((b) => (b as { type?: string })?.type === "tool_use");
}

export function buildPayload(
  stdin: StopStdin,
  read: (path: string) => TranscriptEntry[] = readTranscript,
): AgentSessionPayload {
  const entries = read(stdin.transcript_path);
  let inputTokens = 0, cachedInputTokens = 0, outputTokens = 0, toolCallCount = 0;
  let model = "unknown";

  for (const e of entries) {
    if (e.message?.role !== "assistant") continue;
    if (e.message.model) model = e.message.model;
    if (hasToolUse(e.message.content)) toolCallCount += 1;
    const u = e.message.usage;
    if (u) {
      inputTokens += u.input_tokens ?? 0;
      cachedInputTokens += (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      outputTokens += u.output_tokens ?? 0;
    }
  }

  const startedAt = entries.find((e) => e.timestamp)?.timestamp ?? new Date().toISOString();

  return {
    tool: "claude-code",
    sessionId: stdin.session_id,
    gitUsername: resolveGitUsername(stdin.cwd),
    model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costUsd: null,
    toolCallCount,
    startedAt,
  };
}

async function main(): Promise<void> {
  try {
    const raw = readFileSync(0, "utf-8");
    const stdin = JSON.parse(raw) as StopStdin;
    await reportSession(buildPayload(stdin));
  } catch (err) {
    console.error("[hook-claude-code]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
