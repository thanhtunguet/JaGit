#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jagit/agent-reporter";

// ─── Codex Stop-hook stdin ────────────────────────────────────────────────────
// Ref: https://developers.openai.com/codex/hooks#stop
// Schema: https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/stop.command.input.schema.json
// All fields are required per the official schema (as of Codex CLI ≥ 0.100).

export interface CodexStopStdin {
  /** Current Codex session id */
  session_id: string;
  /** Working directory for the session */
  cwd: string;
  /** Always "Stop" for this event */
  hook_event_name: string;
  /** Active model slug — Codex-specific extension */
  model: string;
  /** Active Codex turn id — Codex-specific extension */
  turn_id: string;
  /** Whether this turn was already continued by a Stop hook (prevents loops) */
  stop_hook_active: boolean;
  /** Path to the session transcript file, or null */
  transcript_path: string | null;
  /** Latest assistant message text, or null */
  last_assistant_message: string | null;
  /** Current permission mode */
  permission_mode: "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions";
}

// ─── Legacy JSONL record (used by the file-scan fallback) ─────────────────────

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

// ─── Transcript entry (Codex transcript JSONL) ────────────────────────────────
// The transcript format is not a stable API, but token usage is available via
// assistant messages in a structure similar to the OpenAI chat completions API.

export interface CodexTranscriptEntry {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
    usage?: {
      // snake_case (OpenAI-style)
      input_tokens?: number;
      output_tokens?: number;
      cached_tokens?: number;
      // camelCase variants
      inputTokens?: number;
      outputTokens?: number;
      cachedTokens?: number;
    };
  };
}

const TOOL_CALL_SUBTYPES = new Set(["function_call", "custom_tool_call", "web_search_call"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as T;
      } catch {
        return {} as T;
      }
    });
}

function hasToolUse(content: unknown): boolean {
  return Array.isArray(content) && content.some((b) => (b as { type?: string })?.type === "tool_use");
}

// ─── Payload builders ─────────────────────────────────────────────────────────

/**
 * Build payload from a real Codex Stop-hook stdin.
 * Model is read directly from stdin; transcript is parsed for token usage.
 */
export function buildPayloadFromStdin(
  stdin: CodexStopStdin,
  read: (path: string) => CodexTranscriptEntry[] = (p) => readJsonl<CodexTranscriptEntry>(p),
): AgentSessionPayload {
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let toolCallCount = 0;

  const entries = stdin.transcript_path
    ? (() => {
        try {
          return read(stdin.transcript_path!);
        } catch {
          return [];
        }
      })()
    : [];

  for (const e of entries) {
    if (e.message?.role !== "assistant") continue;
    if (hasToolUse(e.message.content)) toolCallCount += 1;
    const u = e.message.usage;
    if (u) {
      inputTokens += u.input_tokens ?? u.inputTokens ?? 0;
      cachedInputTokens += u.cached_tokens ?? u.cachedTokens ?? 0;
      outputTokens += u.output_tokens ?? u.outputTokens ?? 0;
    }
  }

  const startedAt =
    entries.find((e) => e.timestamp)?.timestamp ?? new Date().toISOString();

  return {
    tool: "codex",
    sessionId: stdin.session_id,
    gitUsername: resolveGitUsername(stdin.cwd),
    model: stdin.model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costUsd: null,
    toolCallCount,
    startedAt,
  };
}

/**
 * Build payload from legacy JSONL session records (file-scan fallback).
 * Used when hook-codex is invoked via the old shell-wrapper pattern.
 */
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
        // Codex token_count events are cumulative — take the last non-null value
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
  const startedAt =
    records.find((r) => r.timestamp)?.timestamp ??
    sessionMeta?.payload?.timestamp ??
    new Date().toISOString();

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

// ─── Legacy file-scan helpers ─────────────────────────────────────────────────

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

// ─── Try to read a JSON object from stdin (fd 0) ──────────────────────────────

function tryReadStdin(): CodexStopStdin | undefined {
  try {
    const raw = readFileSync(0, "utf-8").trim();
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Accept any object that looks like a Codex Stop hook payload
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed["hook_event_name"] === "Stop" &&
      typeof parsed["session_id"] === "string"
    ) {
      return parsed as unknown as CodexStopStdin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    const stdin = tryReadStdin();

    // stop_hook_active=true means the agent is re-running because a previous Stop hook
    // blocked it. Skip reporting to avoid duplicate session entries.
    if (stdin?.stop_hook_active === true) {
      process.exit(0);
    }

    if (stdin) {
      // Real Codex hook mode — stdin has session_id, model, transcript_path
      await reportSession(buildPayloadFromStdin(stdin));
    } else {
      // Legacy shell-wrapper mode — scan ~/.codex/sessions/**/*.jsonl
      const { file } = parseArgs(process.argv.slice(2));
      const filePath = file ?? findLatestSessionFile(join(homedir(), ".codex", "sessions"));
      if (!filePath) return;

      const records = readJsonl<CodexRecord>(filePath);
      const sessionMeta = records.find((r) => r.type === "session_meta");
      const sessionId = sessionMeta?.payload?.id ?? filePath;
      const cwd = sessionMeta?.payload?.cwd;

      await reportSession(buildPayload(sessionId, cwd, records));
    }
  } catch (err) {
    console.error("[hook-codex]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

const isMain =
  import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) void main();
