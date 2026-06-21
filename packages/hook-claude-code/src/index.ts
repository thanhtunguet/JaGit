#!/usr/bin/env node
import { readFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jagit/agent-reporter";
import { createJiraWorklog } from "@jagit/shared";

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

export function calculateBaseTokens(costUsd: number | null): number | null {
  if (costUsd === null) return null;
  // Fixed rate: 1 USD = 4,000,000 BT
  return costUsd * 4000000;
}

export function parseGitDiff(output: string): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;
  
  const lines = output.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length >= 2) {
      if (parts[0] !== "-") linesAdded += parseInt(parts[0], 10);
      if (parts[1] !== "-") linesRemoved += parseInt(parts[1], 10);
    }
  }
  
  return { linesAdded, linesRemoved };
}

function getLocFromCommit(cwd: string, initialCommitSha: string): { linesAdded: number; linesRemoved: number } | undefined {
  try {
    const output = execSync(`git diff --numstat ${initialCommitSha} HEAD`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return parseGitDiff(output);
  } catch (err) {
    return undefined;
  }
}

export function buildPayload(
  stdin: StopStdin,
  read: (path: string) => TranscriptEntry[] = readTranscript,
  checkExists: (path: string) => boolean = existsSync,
  readFile: (path: string, enc: BufferEncoding) => string = readFileSync,
): AgentSessionPayload {
  const entries = read(stdin.transcript_path);
  let inputTokens = 0, cachedInputTokens = 0, cacheCreationInputTokens = 0, outputTokens = 0, toolCallCount = 0;
  let model = "unknown";

  let initialCommitSha: string | null = null;
  let durationMs: number | undefined = undefined;
  
  const statePath = stdin.cwd ? `${stdin.cwd}/.jigit-session-${stdin.session_id}.json` : "";
  if (statePath && checkExists(statePath)) {
    try {
      const stateRaw = readFile(statePath, "utf-8");
      const state = JSON.parse(stateRaw);
      if (state.initialCommitSha) initialCommitSha = state.initialCommitSha;
      if (state.totalDurationMs !== undefined) durationMs = state.totalDurationMs;
    } catch {}
  }

  for (const e of entries) {
    if (e.message?.role !== "assistant") continue;
    if (e.message.model) model = e.message.model;
    if (hasToolUse(e.message.content)) toolCallCount += 1;
    const u = e.message.usage;
    if (u) {
      inputTokens += u.input_tokens ?? 0;
      cachedInputTokens += u.cache_read_input_tokens ?? 0;
      cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
      outputTokens += u.output_tokens ?? 0;
    }
  }

  const startedAt = entries.find((e) => e.timestamp)?.timestamp ?? new Date().toISOString();

  let linesAdded: number | undefined = undefined;
  let linesRemoved: number | undefined = undefined;
  if (stdin.cwd && initialCommitSha) {
    const loc = getLocFromCommit(stdin.cwd, initialCommitSha);
    if (loc) { linesAdded = loc.linesAdded; linesRemoved = loc.linesRemoved; }
  }

  return {
    tool: "claude-code",
    sessionId: stdin.session_id,
    gitUsername: resolveGitUsername(stdin.cwd),
    model,
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    costUsd: null,
    toolCallCount,
    startedAt,
    initialCommitSha: initialCommitSha ?? undefined,
    durationMs,
    linesAdded,
    linesRemoved,
  };
}

async function main(): Promise<void> {
  try {
    const raw = readFileSync(0, "utf-8");
    const stdin = JSON.parse(raw) as StopStdin;
    const payload = buildPayload(stdin);
    await reportSession(payload);

    if (payload.durationMs && stdin.cwd) {
      const statePath = `${stdin.cwd}/.jigit-session-${stdin.session_id}.json`;
      if (existsSync(statePath)) {
        const baseUrl = process.env.JAGIT_BASE_URL?.trim();
        const apiKey = process.env.JAGIT_API_KEY?.trim();
        
        if (baseUrl && apiKey) {
          try {
            const res = await fetch(`${baseUrl}/api/agent-sessions?sessionId=${stdin.session_id}`, {
              headers: { "x-api-key": apiKey },
            });
            if (res.ok) {
              const data = await res.json() as { rows?: any[] };
              const session = data.rows?.[0];
              if (session?.jiraTicketId && session.costUsd) {
                const baseTokens = calculateBaseTokens(session.costUsd);
                if (baseTokens) {
                  await createJiraWorklog({
                    ticketId: session.jiraTicketId,
                    durationMs: payload.durationMs,
                    baseTokens,
                  });
                }
              }
            }
          } catch (err) {
            console.error("[hook-claude-code] Failed to create worklog:", err);
          }
        }
        try {
          rmSync(statePath, { force: true });
        } catch {}
      }
    }
  } catch (err) {
    console.error("[hook-claude-code]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

const isMain = import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) void main();
