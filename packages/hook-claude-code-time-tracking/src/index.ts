#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getStatePath, readState, writeState, type TimeTrackingState } from "./state.js";
import { getHeadSha } from "./git.js";

interface UserPromptSubmitStdin {
  session_id: string;
  timestamp: string;
  cwd?: string;
}

export interface TimeTrackingPayload {
  sessionId: string;
  initialCommitSha: string | null;
  totalDurationMs: number;
}

export async function buildPayload(stdin: UserPromptSubmitStdin): Promise<TimeTrackingPayload> {
  const { session_id, timestamp, cwd } = stdin;
  const statePath = cwd ? getStatePath(cwd, session_id) : "";

  let state: TimeTrackingState;

  if (!statePath) {
    // No cwd available, just return minimal payload
    return {
      sessionId: session_id,
      initialCommitSha: null,
      totalDurationMs: 0,
    };
  }

  const existingState = readState(statePath);

  if (!existingState) {
    // Initialize new state
    const initialCommitSha = getHeadSha(cwd);
    state = {
      sessionId: session_id,
      initialCommitSha,
      totalDurationMs: 0,
      lastUpdateTime: timestamp,
    };
    writeState(statePath, state);
  } else {
    // Accumulate duration
    const lastTime = new Date(existingState.lastUpdateTime).getTime();
    const currentTime = new Date(timestamp).getTime();
    const elapsed = currentTime - lastTime;

    state = {
      ...existingState,
      totalDurationMs: existingState.totalDurationMs + elapsed,
      lastUpdateTime: timestamp,
    };
    writeState(statePath, state);
  }

  // Async sync to API (fire and forget)
  syncToApi(state).catch((err) => {
    console.error("[time-tracking] Failed to sync to API:", err);
  });

  return {
    sessionId: state.sessionId,
    initialCommitSha: state.initialCommitSha,
    totalDurationMs: state.totalDurationMs,
  };
}

async function syncToApi(state: TimeTrackingState): Promise<void> {
  const baseUrl = process.env.JAGIT_BASE_URL?.trim();
  const apiKey = process.env.JAGIT_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    return; // Silently skip if not configured
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/api/agent-sessions/${state.sessionId}/time-tracking`;

  const body: { initialCommitSha?: string; durationMs?: number } = {};
  if (state.initialCommitSha) body.initialCommitSha = state.initialCommitSha;
  if (state.totalDurationMs > 0) body.durationMs = state.totalDurationMs;

  if (Object.keys(body).length === 0) return;

  await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  try {
    const raw = readFileSync(0, "utf-8");
    const stdin = JSON.parse(raw) as UserPromptSubmitStdin;
    await buildPayload(stdin);
  } catch (err) {
    console.error("[time-tracking]", err instanceof Error ? err.message : err);
  } finally {
    process.exit(0);
  }
}

const isMain = import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) void main();
