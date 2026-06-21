#!/usr/bin/env node
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jigit/agent-reporter";

// Debug logging to a file we can check after the hook runs
const DEBUG_FILE = "/tmp/jigit-hook-debug.log";
function debug(msg: string): void {
  try {
    appendFileSync(DEBUG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

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
  debug("=== HOOK STARTED ===");
  debug(`import.meta.url: ${import.meta.url}`);
  debug(`argv[1]: ${process.argv[1]}`);
  debug(`isMain check: ${import.meta.url.startsWith("file://")}`);
  try {
    const realMeta = realpathSync(fileURLToPath(import.meta.url));
    const realArgv = realpathSync(process.argv[1]);
    debug(`realMeta: ${realMeta}`);
    debug(`realArgv: ${realArgv}`);
    debug(`match: ${realMeta === realArgv}`);
  } catch (e) {
    debug(`realpath error: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    debug("Reading stdin...");
    const raw = readFileSync(0, "utf-8");
    debug(`stdin length: ${raw.length}`);
    debug(`stdin: ${raw.substring(0, 500)}`);

    const stdin = JSON.parse(raw) as StopStdin;
    debug(`Parsed: session_id=${stdin.session_id}, transcript_path=${stdin.transcript_path}, cwd=${stdin.cwd}`);

    const payload = buildPayload(stdin);
    debug(`Payload: ${JSON.stringify(payload)}`);

    // Check env vars before calling reportSession
    debug(`JAGIT_BASE_URL: ${process.env.JAGIT_BASE_URL ? "SET" : "UNSET"}`);
    debug(`JAGIT_API_KEY: ${process.env.JAGIT_API_KEY ? "SET (len=" + process.env.JAGIT_API_KEY.length + ")" : "UNSET"}`);

    await reportSession(payload);
    debug("reportSession completed (check stderr for API errors)");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debug(`ERROR: ${msg}`);
    console.error("[hook-claude-code]", msg);
  } finally {
    debug("=== HOOK FINISHED ===\n");
    process.exit(0);
  }
}

const isMain = import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  debug("isMain=true, calling main()");
  void main();
} else {
  debug("isMain=false, NOT calling main()");
  debug(`import.meta.url: ${import.meta.url}`);
  debug(`process.argv[1]: ${process.argv[1]}`);
}
