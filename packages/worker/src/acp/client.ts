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
  /** Absolute path to the working directory the agent operates in (required by ACP). */
  cwd: string;
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

    // ACP protocol v1 handshake
    await this.request("initialize", { protocolVersion: 1 });
    const { sessionId } = await this.request<{ sessionId: string }>("session/new", {
      cwd: this.opts.cwd,
      mcpServers: [],
    });
    this.sessionId = sessionId;
  }

  private handleMessage(msg: JsonRpcMessage) {
    // Notification (no id) — session/update is a CLIENT_METHOD notification from agent
    if (msg.id === undefined && msg.method === "session/update") {
      const update = (msg.params as any)?.update as AcpUpdate;
      if (update?.tokens) this.totalTokens += update.tokens;
      if (update?.costUsd) this.totalCost += update.costUsd;
      this.opts.onUpdate(update);
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
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
      }
    }
  }

  async runPrompt(text: string): Promise<RunResult> {
    // ACP PromptRequest.prompt is Array<ContentBlock>, not a plain string
    const result = await this.request<{ stopReason: string }>("session/prompt", {
      sessionId: this.sessionId,
      prompt: [{ type: "text", text }],
    });
    return { stopReason: result.stopReason, tokensUsed: this.totalTokens, costUsd: this.totalCost };
  }

  async stop(): Promise<void> {
    try { this.proc.kill("SIGTERM"); } catch { /* ignore */ }
  }
}
