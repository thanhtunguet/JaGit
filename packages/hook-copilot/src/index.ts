#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGitUsername, reportSession, type AgentSessionPayload } from "@jagit/agent-reporter";

// ─── VS Code Copilot agent Stop-hook stdin ───────────────────────────────────
// Ref: https://code.visualstudio.com/docs/agents/reference/hooks-reference#_stop
// Common fields: timestamp, cwd, session_id (all optional per spec), hook_event_name, transcript_path
// Stop-specific: stop_hook_active
// NOTE: transcript_path format is NOT a stable API and may change in future VS Code releases.

export interface CopilotStopStdin {
  /** Optional per VS Code spec — common hook field */
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  /** Absolute path to session transcript. Format is unstable — may change in future VS Code releases. */
  transcript_path?: string;
  timestamp?: string;
  /**
   * true when the agent is already continuing as a result of a previous Stop hook.
   * Check this to prevent the hook from reporting duplicate sessions.
   */
  stop_hook_active?: boolean;
}

// ─── Real VS Code Copilot transcript format ───────────────────────────────────
// The transcript is a JSONL file where each line is one of these entry types.
// NOTE: This format is NOT a stable API — it may change in future VS Code releases.
//
// Observed entry types (VS Code Copilot 0.44+):
//   session.start      — data: { sessionId, version, producer, copilotVersion, vscodeVersion, startTime }
//   user.message       — data: { content, attachments }
//   assistant.turn_start / assistant.turn_end — data: { turnId }
//   assistant.message  — data: { messageId, content, toolRequests: [{ toolCallId, name, arguments, type }] }
//   tool.execution_start / tool.execution_complete — data: { toolCallId, toolName, arguments, success }
//
// Token usage and model name are NOT present in the transcript — Copilot uses
// seat-based billing and does not expose per-call telemetry in the hook transcript.

export interface CopilotTranscriptSessionStart {
  type: "session.start";
  timestamp?: string;
  data: {
    sessionId?: string;
    version?: number;
    producer?: string;
    copilotVersion?: string;
    vscodeVersion?: string;
    startTime?: string;
  };
}

export interface CopilotTranscriptToolRequest {
  toolCallId?: string;
  name?: string;
  arguments?: string;
  type?: string;
}

export interface CopilotTranscriptAssistantMessage {
  type: "assistant.message";
  timestamp?: string;
  id?: string;
  data: {
    messageId?: string;
    content?: string;
    /** Tool calls made in this assistant turn */
    toolRequests?: CopilotTranscriptToolRequest[];
  };
}

export type CopilotTranscriptEntry =
  | CopilotTranscriptSessionStart
  | CopilotTranscriptAssistantMessage
  | { type: string; timestamp?: string; data?: unknown };

// ─── Legacy CopilotInfo (for shell-wrapper / no-stdin mode) ──────────────────

export interface CopilotInfo {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  toolCallCount?: number | null;
}

interface WorkspaceCandidate {
  workspaceId: string;
  debugLogsDir: string;
  updatedAtMs: number;
}

interface ModelUsageBucket {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  observations: number;
}

interface CopilotDebugUsage {
  sessionId: string;
  workspaceId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  sourcePath: string;
  modelUsage: Record<string, ModelUsageBucket>;
}

// ─── Platform-aware workspace storage resolver ───────────────────────────────
//
// VS Code stores the Copilot Chat debug logs under a workspaceStorage directory
// whose root path differs by OS:
//
//   Linux   ~/.config/Code/User/workspaceStorage
//   macOS   ~/Library/Application Support/Code/User/workspaceStorage
//   Windows %APPDATA%\Code\User\workspaceStorage
//           (process.env.APPDATA falls back to USERPROFILE\AppData\Roaming)
//
// The interface lets callers / tests inject a custom resolver without touching
// the rest of the logic.

/** Resolves the root workspaceStorage directory for the current platform. */
export interface WorkspaceStorageResolver {
  resolve(): string;
}

/** Linux: ~/.config/Code/User/workspaceStorage */
export class LinuxWorkspaceStorageResolver implements WorkspaceStorageResolver {
  resolve(): string {
    return join(homedir(), ".config", "Code", "User", "workspaceStorage");
  }
}

/** macOS: ~/Library/Application Support/Code/User/workspaceStorage */
export class MacOSWorkspaceStorageResolver implements WorkspaceStorageResolver {
  resolve(): string {
    return join(homedir(), "Library", "Application Support", "Code", "User", "workspaceStorage");
  }
}

/**
 * Windows: %APPDATA%\Code\User\workspaceStorage
 * Falls back to %USERPROFILE%\AppData\Roaming when APPDATA is unset.
 */
export class WindowsWorkspaceStorageResolver implements WorkspaceStorageResolver {
  resolve(): string {
    const appData =
      process.env["APPDATA"] ??
      join(homedir(), "AppData", "Roaming");
    return join(appData, "Code", "User", "workspaceStorage");
  }
}

/**
 * Returns the appropriate WorkspaceStorageResolver for the current OS.
 * Override in tests by passing a custom resolver directly to the functions
 * that accept a `baseDir` parameter.
 */
export function platformWorkspaceStorageResolver(): WorkspaceStorageResolver {
  switch (platform()) {
    case "darwin":
      return new MacOSWorkspaceStorageResolver();
    case "win32":
      return new WindowsWorkspaceStorageResolver();
    default:
      return new LinuxWorkspaceStorageResolver();
  }
}

const WORKSPACE_STORAGE_DIR = platformWorkspaceStorageResolver().resolve();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readTranscript(path: string): CopilotTranscriptEntry[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as CopilotTranscriptEntry;
      } catch {
        return { type: "__parse_error__" };
      }
    });
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listWorkspaceCandidates(baseDir: string): WorkspaceCandidate[] {
  if (!existsSync(baseDir)) {
    return [];
  }

  const entries = readdirSync(baseDir, { withFileTypes: true });
  const workspaces: WorkspaceCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const debugLogsDir = join(baseDir, entry.name, "GitHub.copilot-chat", "debug-logs");
    if (!existsSync(debugLogsDir)) {
      continue;
    }

    let updatedAtMs = 0;
    try {
      updatedAtMs = statSync(debugLogsDir).mtimeMs;
    } catch {
      updatedAtMs = 0;
    }

    workspaces.push({
      workspaceId: entry.name,
      debugLogsDir,
      updatedAtMs,
    });
  }

  return workspaces;
}

function rankWorkspacesByRecency(workspaces: WorkspaceCandidate[], hookTimestamp?: string): WorkspaceCandidate[] {
  if (!hookTimestamp) {
    return [...workspaces].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  const hookMs = Date.parse(hookTimestamp);
  if (Number.isNaN(hookMs)) {
    return [...workspaces].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  return [...workspaces].sort((a, b) => {
    const aDelta = Math.abs(a.updatedAtMs - hookMs);
    const bDelta = Math.abs(b.updatedAtMs - hookMs);
    if (aDelta !== bDelta) {
      return aDelta - bDelta;
    }
    return b.updatedAtMs - a.updatedAtMs;
  });
}

export function inferWorkspaceIdBySession(
  sessionId: string,
  hookTimestamp?: string,
  baseDir: string = WORKSPACE_STORAGE_DIR,
): WorkspaceCandidate | undefined {
  const candidates = rankWorkspacesByRecency(listWorkspaceCandidates(baseDir), hookTimestamp);
  for (const candidate of candidates) {
    const sessionDir = join(candidate.debugLogsDir, sessionId);
    if (existsSync(sessionDir)) {
      return candidate;
    }
  }
  return candidates[0];
}

interface TranscriptPathLocation {
  workspaceId: string;
  sessionId: string;
}

export function parseTranscriptPathLocation(transcriptPath: string | undefined): TranscriptPathLocation | undefined {
  if (!transcriptPath) {
    return undefined;
  }

  const normalized = transcriptPath.replace(/\\/g, "/");
  const match = normalized.match(/\/workspaceStorage\/([^/]+)\/GitHub\.copilot-chat\/transcripts\/([^/]+)\.jsonl$/);
  if (!match) {
    return undefined;
  }

  return {
    workspaceId: match[1],
    sessionId: match[2],
  };
}

function buildMainLogPath(baseDir: string, workspaceId: string, sessionId: string): string {
  return join(baseDir, workspaceId, "GitHub.copilot-chat", "debug-logs", sessionId, "main.jsonl");
}

function resolveModelFromObject(obj: Record<string, unknown>, fallbackModel: string): string {
  const keys = ["model", "modelName", "model_name", "resolvedModel", "deployment", "engine"];
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallbackModel;
}

function extractTokensFromObject(
  obj: Record<string, unknown>,
): Omit<ModelUsageBucket, "observations"> | null {
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;
  let foundAny = false;
  let sawInputKey = false;
  let sawCacheReadStyleKey = false;
  let sawCachedSubsetKey = false;

  for (const [rawKey, rawValue] of Object.entries(obj)) {
    const key = normalizeKey(rawKey);
    const value = toFiniteNumber(rawValue);
    if (value === null) {
      continue;
    }

    if (["inputtokens", "prompttokens", "requesttokens"].includes(key)) {
      inputTokens += value;
      foundAny = true;
      sawInputKey = true;
      continue;
    }
    if (["cachedinputtokens", "cachereadinputtokens"].includes(key)) {
      cachedInputTokens += value;
      foundAny = true;
      sawCacheReadStyleKey = true;
      continue;
    }
    if (["cachedtokens", "promptcachehitstokens"].includes(key)) {
      cachedInputTokens += value;
      foundAny = true;
      sawCachedSubsetKey = true;
      continue;
    }
    if (["outputtokens", "completiontokens", "responsetokens"].includes(key)) {
      outputTokens += value;
      foundAny = true;
      continue;
    }
    if (["totaltokens", "alltokens"].includes(key)) {
      totalTokens += value;
      foundAny = true;
      continue;
    }
    if (["costusd", "cost", "usd", "usdcost"].includes(key)) {
      costUsd += value;
      foundAny = true;
      continue;
    }
  }

  if (!foundAny) {
    return null;
  }

  // Some providers report inputTokens as total prompt tokens and expose cached
  // tokens as a subset. Convert to non-cached input tokens to match JaGit's
  // input/cached split and avoid double-counting in aggregates.
  if (sawInputKey && sawCachedSubsetKey && !sawCacheReadStyleKey) {
    inputTokens = Math.max(0, inputTokens - cachedInputTokens);
  }

  if (totalTokens === 0) {
    totalTokens = inputTokens + cachedInputTokens + outputTokens;
  }

  return { inputTokens, cachedInputTokens, outputTokens, totalTokens, costUsd };
}

function collectModelUsage(
  value: unknown,
  usageByModel: Map<string, ModelUsageBucket>,
  currentModel = "copilot",
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectModelUsage(item, usageByModel, currentModel);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const resolvedModel = resolveModelFromObject(value, currentModel);
  const tokens = extractTokensFromObject(value);

  if (tokens) {
    const existing = usageByModel.get(resolvedModel) ?? {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      observations: 0,
    };

    existing.inputTokens += tokens.inputTokens;
    existing.cachedInputTokens += tokens.cachedInputTokens;
    existing.outputTokens += tokens.outputTokens;
    existing.totalTokens += tokens.totalTokens;
    existing.costUsd += tokens.costUsd;
    existing.observations += 1;
    usageByModel.set(resolvedModel, existing);
  }

  for (const child of Object.values(value)) {
    collectModelUsage(child, usageByModel, resolvedModel);
  }
}

export function resolveDebugUsageBySession(
  sessionId: string | undefined,
  hookTimestamp?: string,
  baseDir: string = WORKSPACE_STORAGE_DIR,
  workspaceIdFromTranscript?: string,
): CopilotDebugUsage | undefined {
  if (!sessionId) {
    return undefined;
  }

  let workspaceId = workspaceIdFromTranscript;
  let mainJsonlPath: string | undefined;

  if (workspaceId) {
    const pathFromTranscript = buildMainLogPath(baseDir, workspaceId, sessionId);
    if (existsSync(pathFromTranscript)) {
      mainJsonlPath = pathFromTranscript;
    }
  }

  if (!mainJsonlPath) {
    const workspace = inferWorkspaceIdBySession(sessionId, hookTimestamp, baseDir);
    if (!workspace) {
      return undefined;
    }
    workspaceId = workspace.workspaceId;
    const fallbackPath = buildMainLogPath(baseDir, workspace.workspaceId, sessionId);
    if (!existsSync(fallbackPath)) {
      return undefined;
    }
    mainJsonlPath = fallbackPath;
  }

  const usageByModel = new Map<string, ModelUsageBucket>();
  const lines = readFileSync(mainJsonlPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      collectModelUsage(parsed, usageByModel, "copilot");
    } catch {
      // Ignore malformed lines to keep reporting resilient.
    }
  }

  if (usageByModel.size === 0) {
    return {
      sessionId,
      workspaceId: workspaceId ?? "unknown",
      model: "copilot",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: null,
      sourcePath: mainJsonlPath,
      modelUsage: {},
    };
  }

  let dominantModel = "copilot";
  let dominantTotal = -1;
  let dominantObs = -1;

  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;

  for (const [model, usage] of usageByModel.entries()) {
    inputTokens += usage.inputTokens;
    cachedInputTokens += usage.cachedInputTokens;
    outputTokens += usage.outputTokens;
    totalTokens += usage.totalTokens;
    totalCostUsd += usage.costUsd;

    if (usage.totalTokens > dominantTotal || (usage.totalTokens === dominantTotal && usage.observations > dominantObs)) {
      dominantModel = model;
      dominantTotal = usage.totalTokens;
      dominantObs = usage.observations;
    }
  }

  const modelUsage = Object.fromEntries(usageByModel.entries());

  return {
    sessionId,
    workspaceId: workspaceId ?? "unknown",
    model: dominantModel,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    costUsd: totalCostUsd > 0 ? totalCostUsd : null,
    sourcePath: mainJsonlPath,
    modelUsage,
  };
}

/**
 * Count tool calls from assistant.message entries.
 * Each assistant.message with at least one toolRequest counts as one tool-call turn;
 * we sum the total number of individual tool requests across all turns.
 */
function countToolCalls(entries: CopilotTranscriptEntry[]): number {
  const toolCallIds = new Set<string>();
  let anonymousCalls = 0;

  for (const e of entries) {
    if (e.type === "assistant.message") {
      const msg = e as CopilotTranscriptAssistantMessage;
      for (const req of msg.data?.toolRequests ?? []) {
        if (typeof req.toolCallId === "string" && req.toolCallId.length > 0) {
          toolCallIds.add(req.toolCallId);
        } else {
          anonymousCalls += 1;
        }
      }
      continue;
    }

    if (e.type === "tool.execution_start" || e.type === "tool.execution_complete") {
      const data = isRecord(e.data) ? e.data : undefined;
      const toolCallId = data?.toolCallId;
      if (typeof toolCallId === "string" && toolCallId.length > 0) {
        toolCallIds.add(toolCallId);
      } else {
        anonymousCalls += 1;
      }
    }
  }

  return toolCallIds.size + anonymousCalls;
}

/**
 * Extract the earliest timestamp from the transcript.
 * Prefers session.start data.startTime, then falls back to the first entry timestamp.
 */
function extractStartTime(entries: CopilotTranscriptEntry[]): string | undefined {
  for (const e of entries) {
    if (e.type === "session.start") {
      const s = e as CopilotTranscriptSessionStart;
      if (s.data?.startTime) return s.data.startTime;
    }
  }
  // Fall back to the first entry with a timestamp
  return entries.find((e) => e.timestamp)?.timestamp;
}

// ─── Payload builders ─────────────────────────────────────────────────────────

/**
 * Build payload from a real VS Code Copilot agent Stop-hook stdin.
 *
 * Reads the transcript to count tool calls and extract the session start time.
 * Token usage (input/cached/output) and model name are NOT available in the
 * VS Code Copilot transcript — Copilot uses seat-based billing and does not
 * expose per-call telemetry. These fields are reported as 0/null/"copilot".
 */
export function buildPayloadFromStdin(
  stdin: CopilotStopStdin,
  read: (path: string) => CopilotTranscriptEntry[] = readTranscript,
  resolveUsage: (
    sessionId: string | undefined,
    hookTimestamp?: string,
    baseDir?: string,
    workspaceIdFromTranscript?: string,
  ) => CopilotDebugUsage | undefined = resolveDebugUsageBySession,
): AgentSessionPayload {
  const entries = stdin.transcript_path ? (() => {
    try { return read(stdin.transcript_path!); } catch { return []; }
  })() : [];

  const toolCallCount = countToolCalls(entries);
  const startedAt = extractStartTime(entries) ?? stdin.timestamp ?? new Date().toISOString();
  const parsedLocation = parseTranscriptPathLocation(stdin.transcript_path);
  const sessionId = parsedLocation?.sessionId ?? stdin.session_id;
  const usage = resolveUsage(sessionId, stdin.timestamp, WORKSPACE_STORAGE_DIR, parsedLocation?.workspaceId);

  return {
    tool: "copilot",
    // session_id is optional per VS Code spec; synthesize a fallback if absent
    sessionId: sessionId ?? `copilot-${Date.now()}-${process.pid}`,
    gitUsername: resolveGitUsername(stdin.cwd),
    // Model/tokens are inferred from debug logs by session_id; falls back safely.
    model: usage?.model ?? "copilot",
    inputTokens: usage?.inputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    cacheCreationInputTokens: 0,
    outputTokens: usage?.outputTokens ?? 0,
    costUsd: usage?.costUsd ?? null,
    toolCallCount,
    startedAt,
    rawPayload: usage ? {
      source: "copilot-debug-logs",
      workspaceId: usage.workspaceId,
      debugLogPath: usage.sourcePath,
      debugSessionId: usage.sessionId,
      totalTokens: usage.totalTokens,
      cachedTokens: usage.cachedInputTokens,
      modelUsage: usage.modelUsage,
    } : undefined,
  };
}

/**
 * Build payload in legacy mode (no stdin) — used when hook-copilot is invoked
 * via the old shell-wrapper pattern around the Copilot CLI. Token counts are
 * not available in this mode (seat-based billing has no per-call telemetry).
 */
export function buildPayload(cwd: string | undefined, info?: CopilotInfo): AgentSessionPayload {
  return {
    tool: "copilot",
    sessionId: `copilot-${Date.now()}-${process.pid}`,
    gitUsername: resolveGitUsername(cwd),
    model: info?.model ?? "copilot",
    inputTokens: info?.inputTokens ?? 0,
    cachedInputTokens: info?.cachedInputTokens ?? 0,
    cacheCreationInputTokens: 0,
    outputTokens: info?.outputTokens ?? 0,
    costUsd: null,
    toolCallCount: info?.toolCallCount ?? null,
    startedAt: new Date().toISOString(),
  };
}

// ─── Try to read a JSON object from stdin (fd 0) ─────────────────────────────

function tryReadStdin(): CopilotStopStdin | undefined {
  try {
    const raw = readFileSync(0, "utf-8").trim();
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Accept any object that looks like a VS Code hook payload (session_id is optional per spec)
    if (typeof parsed === "object" && parsed !== null && "hook_event_name" in parsed) {
      return parsed as unknown as CopilotStopStdin;
    }
    // Also accept if session_id is present (legacy / Claude Code compat)
    if (typeof parsed.session_id === "string") {
      return parsed as unknown as CopilotStopStdin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    const stdin = tryReadStdin();
    // stop_hook_active=true means the agent is re-running because a previous Stop hook
    // blocked it. Skip reporting to avoid duplicate session entries.
    if (stdin?.stop_hook_active === true) {
      process.exit(0);
    }
    const payload = stdin
      ? buildPayloadFromStdin(stdin)
      : buildPayload(process.cwd());
    await reportSession(payload);
  } catch (err) {
    console.error("[hook-copilot]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

const isMain = import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) void main();
 