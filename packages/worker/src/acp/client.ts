import { spawn, type ChildProcess } from "node:child_process";
import { createReader, createWriter, type JsonRpcMessage } from "./protocol.js";

export interface AcpCost {
  amount: number;
  currency: string;
}

export interface AcpUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AcpUpdate {
  kind?: string;
  sessionUpdate?: string;
  /** Legacy / test shape */
  tokens?: number;
  /** Legacy / test shape */
  costUsd?: number;
  /** ACP usage_update: tokens currently in context (cumulative session metric from agent) */
  used?: number;
  cost?: AcpCost;
  [key: string]: unknown;
}

export interface PermissionRequest {
  toolCall: { name: string };
  options: { optionId: string; name: string }[];
}

export interface RunResult {
  stopReason: string;
  tokensUsed: number;
  costUsd: number;
}

export interface AcpOutput {
  kind: string;
  text?: string;
  toolCall?: { name: string; input?: unknown };
  toolResult?: { output?: string; error?: string };
}

import type { AcpMcpServer } from "@jagit/shared";

export interface AcpSessionOpts {
  command: string;
  args: string[];
  /** Absolute path to the working directory the agent operates in (required by ACP). */
  cwd: string;
  env?: NodeJS.ProcessEnv;
  mcpServers?: AcpMcpServer[];
  onUpdate: (update: AcpUpdate) => void;
  onOutput?: (output: AcpOutput) => void;
  onPermission: (req: PermissionRequest) => Promise<string>; // returns chosen optionId
  /** Reject a pending ACP request if no response arrives within this many ms. Guards against a hung subprocess (e.g. the upstream "No onPostToolUseHook" bug). */
  requestTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 600_000;

export interface UsageTotals {
  tokensUsed: number;
  costUsd: number;
}

/** Merge token/cost figures from an ACP session/update notification. */
export function applyUsageUpdate(
  totals: UsageTotals,
  update: AcpUpdate,
): UsageTotals {
  const next = { ...totals };

  if (update.sessionUpdate === "usage_update") {
    if (typeof update.used === "number" && update.used >= 0) {
      next.tokensUsed = Math.max(next.tokensUsed, update.used);
    }
    if (update.cost && typeof update.cost.amount === "number" && update.cost.amount >= 0) {
      next.costUsd = Math.max(next.costUsd, update.cost.amount);
    }
    return next;
  }

  if (typeof update.tokens === "number" && update.tokens > 0) {
    next.tokensUsed += update.tokens;
  }
  if (typeof update.costUsd === "number" && update.costUsd > 0) {
    next.costUsd += update.costUsd;
  }

  return next;
}

/** Apply per-prompt usage from session/prompt response (fallback when stream omits usage). */
export function applyPromptUsage(
  totals: UsageTotals,
  usage?: AcpUsage | null,
): UsageTotals {
  if (!usage) return totals;

  const next = { ...totals };
  const fromParts =
    (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const candidate =
    usage.totalTokens ?? (fromParts > 0 ? fromParts : 0);

  if (candidate > 0) {
    next.tokensUsed = Math.max(next.tokensUsed, candidate);
  }

  return next;
}

export class AcpSession {
  private proc!: ChildProcess;
  private sessionId!: string;
  private idCounter = 0;
  private pending = new Map<
    number | string,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private write!: (msg: JsonRpcMessage) => void;

  private totals: UsageTotals = { tokensUsed: 0, costUsd: 0 };

  constructor(private readonly opts: AcpSessionOpts) {}

  private nextId(): number { return ++this.idCounter; }

  private request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId();
    return new Promise((resolve, reject) => {
      const timeoutMs = this.opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }

  async start(): Promise<void> {
    this.proc = spawn(this.opts.command, this.opts.args, {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, ...this.opts.env },
    });

    this.write = createWriter(this.proc.stdin!);
    createReader(this.proc.stdout!, (msg) => this.handleMessage(msg));

    // ACP protocol v1 handshake
    await this.request("initialize", { protocolVersion: 1 });
    const { sessionId } = await this.request<{ sessionId: string }>("session/new", {
      cwd: this.opts.cwd,
      mcpServers: this.opts.mcpServers ?? [],
    });
    this.sessionId = sessionId;

    // Skip interactive permission prompts — the agent decides what tools to use
    await this.request("session/set_mode", {
      sessionId: this.sessionId,
      modeId: "bypassPermissions",
    });
  }

  private handleMessage(msg: JsonRpcMessage) {
    // Notification (no id) — session/update is a CLIENT_METHOD notification from agent
    if (msg.id === undefined && msg.method === "session/update") {
      const update = (msg.params as any)?.update as AcpUpdate;
      this.totals = applyUsageUpdate(this.totals, update ?? {});
      this.opts.onUpdate(update ?? {});
      // Stream structured output blocks to the dashboard
      if (this.opts.onOutput) {
        const kind = update?.kind as string;
        if (kind === "text" && typeof update.text === "string") {
          this.opts.onOutput({ kind: "text", text: update.text });
        } else if (kind === "tool_use" && update.toolCall) {
          this.opts.onOutput({ kind: "tool_use", toolCall: update.toolCall as any });
        } else if (kind === "tool_result" && update.toolResult) {
          this.opts.onOutput({ kind: "tool_result", toolResult: update.toolResult as any });
        }
      }
      return;
    }

    // session/request_permission is a CLIENT_METHOD request from agent (has id, expects response)
    if (msg.method === "session/request_permission") {
      const id = msg.id!;
      const params = msg.params as PermissionRequest;
      this.opts.onPermission(params).then((optionId) => {
        // ACP response shape: { outcome: { outcome: "selected", optionId } }
        this.write({ id, result: { outcome: { outcome: "selected", optionId } } });
      });
      return;
    }

    // Regular response to one of our outgoing requests
    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
      }
    }
  }

  async runPrompt(text: string): Promise<RunResult> {
    // ACP PromptRequest.prompt is Array<ContentBlock>, not a plain string
    const result = await this.request<{ stopReason: string; usage?: AcpUsage }>("session/prompt", {
      sessionId: this.sessionId,
      prompt: [{ type: "text", text }],
    });
    this.totals = applyPromptUsage(this.totals, result.usage);
    return {
      stopReason: result.stopReason,
      tokensUsed: this.totals.tokensUsed,
      costUsd: this.totals.costUsd,
    };
  }

  async stop(): Promise<void> {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error("ACP session stopped"));
    }
    this.pending.clear();
    try { this.proc.kill("SIGTERM"); } catch { /* ignore */ }
  }
}
