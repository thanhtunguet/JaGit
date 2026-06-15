import { spawn, type ChildProcess } from "node:child_process";
import { createReader, createWriter, type JsonRpcMessage } from "./protocol.js";

export interface AcpUpdate {
  kind: string;
  tokens?: number;
  costUsd?: number;
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

export interface AcpSessionOpts {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  onUpdate: (update: AcpUpdate) => void;
  onPermission: (req: PermissionRequest) => Promise<string>; // returns chosen optionId
}

export class AcpSession {
  private proc!: ChildProcess;
  private sessionId!: string;
  private idCounter = 0;
  private pending = new Map<number | string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private write!: (msg: JsonRpcMessage) => void;

  private totalTokens = 0;
  private totalCost = 0;

  constructor(private readonly opts: AcpSessionOpts) {}

  private nextId(): number { return ++this.idCounter; }

  private request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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

    // Handshake
    await this.request("initialize", {});
    const { sessionId } = await this.request<{ sessionId: string }>("session/new", {});
    this.sessionId = sessionId;
  }

  private handleMessage(msg: JsonRpcMessage) {
    // Notification (no id) — dispatch to update or permission handler
    if (msg.id === undefined && msg.method === "session/update") {
      const update = (msg.params as any)?.update as AcpUpdate;
      if (update?.tokens) this.totalTokens += update.tokens;
      if (update?.costUsd) this.totalCost += update.costUsd;
      this.opts.onUpdate(update);
      return;
    }

    if (msg.method === "session/request_permission") {
      // Permission is a request from the agent (has id, expects a response)
      const id = msg.id!;
      const params = msg.params as PermissionRequest;
      this.opts.onPermission(params).then((optionId) => {
        this.write({ id, result: { optionId } });
      });
      return;
    }

    // Regular response
    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
      }
    }
  }

  async runPrompt(text: string): Promise<RunResult> {
    const result = await this.request<{ stopReason: string }>("session/prompt", {
      sessionId: this.sessionId, prompt: text,
    });
    return { stopReason: result.stopReason, tokensUsed: this.totalTokens, costUsd: this.totalCost };
  }

  async stop(): Promise<void> {
    try { this.proc.kill("SIGTERM"); } catch { /* ignore */ }
  }
}
