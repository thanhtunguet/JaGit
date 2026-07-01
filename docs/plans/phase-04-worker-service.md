# Phase 4 — Worker Service

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.
> **TDD is mandatory** — write the failing test first, see it fail, then implement.

**Goal:** The BullMQ worker (`packages/worker`) that consumes the job queue,
drives a LangGraph graph through the full coding lifecycle, and spawns Claude
Code as an ACP subprocess. Every external call (Jira, GitLab, Git, ACP) goes
through an interface-first adapter so the graph is fully testable with fakes.

**Prerequisites:** Phase 0 + Phase 1 + Phase 2 complete.

**Reference spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md` §4, §8

---

## Module layout

```
packages/worker/src/
├── main.ts                   # BullMQ consumer entrypoint
├── graph.ts                  # LangGraph StateGraph wiring all nodes
├── checkpointer.ts           # Postgres LangGraph checkpointer
├── nodes/
│   ├── resolveContext.ts     # load issue, repo mapping, compute branch
│   ├── cloneRepo.ts          # git clone into workdir
│   ├── createBranch.ts       # git checkout -b <branch>
│   ├── runAgent.ts           # ACP session + approval bridge
│   ├── commitAndPush.ts      # git add/commit/push
│   ├── openMergeRequest.ts   # GitLab MR create
│   ├── jiraWorklog.ts        # add Jira comment/worklog
│   └── report.ts             # Telegram report + mark done
├── adapters/
│   ├── interfaces.ts         # IJiraAdapter, IGitlabAdapter, IGitAdapter
│   ├── jira.ts               # JiraAdapter (HTTP + withRetry)
│   ├── gitlab.ts             # GitlabAdapter (HTTP + withRetry)
│   └── git.ts                # GitAdapter (execa shell-out)
└── acp/
    ├── protocol.ts           # newline-delimited JSON-RPC framing
    └── client.ts             # AcpSession (spawn + stream + permission bridge)
```

---

## Acceptance Criteria

- [ ] `pnpm --filter @jigit/worker test` — all tests pass.
- [ ] With fake adapters, the graph runs to `done` and sets `mrUrl`.
- [ ] Each node writes a `JobStep` and at least one `JobEvent`.
- [ ] A `stop` signal before `runAgent` halts the graph with `status = stopped`.
- [ ] `AcpSession` handles a `session/request_permission` by calling `onPermission` and sending the optionId back.
- [ ] `JiraAdapter.getIssue` calls the correct Jira REST path with Basic-auth.

**Verify:**
```bash
pnpm --filter @jigit/worker test
pnpm --filter @jigit/worker build
```

---

## Steps

### Step 1 — Install worker dependencies

- [ ] In `packages/worker`:
```bash
cd packages/worker
pnpm add @langchain/langgraph @langchain/langgraph-checkpoint-postgres
pnpm add bullmq ioredis
pnpm add execa
pnpm add node-telegram-bot-api
pnpm add @types/node-telegram-bot-api -D
```

---

### Step 2 — Adapter interfaces (contracts first)

- [ ] Create `packages/worker/src/adapters/interfaces.ts`:
```ts
export interface IssueData {
  key: string;
  type: string;
  summary: string;
  description: string;
}

export interface MrResult {
  webUrl: string;
  iid: number;
}

export interface IJiraAdapter {
  getIssue(key: string): Promise<IssueData>;
  addWorklog(key: string, text: string): Promise<void>;
}

export interface IGitlabAdapter {
  cloneUrlWithToken(projectId: string): string;
  openMergeRequest(opts: {
    projectId: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
  }): Promise<MrResult>;
}

export interface IGitAdapter {
  clone(url: string, workdir: string): Promise<void>;
  createBranch(workdir: string, branch: string): Promise<void>;
  hasChanges(workdir: string): Promise<boolean>;
  commitAll(workdir: string, message: string): Promise<void>;
  push(workdir: string, branch: string): Promise<void>;
}

/** Sink for writing JobStep/JobEvent rows + updating job status */
export interface IJobSink {
  setStatus(jobId: string, status: string, error?: string): Promise<void>;
  startStep(jobId: string, stepName: string): Promise<string>; // returns stepId
  finishStep(stepId: string, status: "done" | "failed", detail?: object): Promise<void>;
  addEvent(jobId: string, opts: {
    type: string;
    message: string;
    level?: string;
    payload?: object;
  }): Promise<void>;
}

export interface ISignals {
  shouldStop(jobId: string): boolean;
  shouldPause(jobId: string): boolean;
}
```

---

### Step 3 — JiraAdapter (TDD)

- [ ] **Write failing test** — `packages/worker/src/adapters/jira.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { JiraAdapter } from "./jira.js";

describe("JiraAdapter", () => {
  const makeFetch = (body: unknown, ok = true) =>
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });

  it("fetches an issue from the correct REST path", async () => {
    const fetchMock = makeFetch({ key: "JIGIT-7", fields: {
      issuetype: { name: "Bug" }, summary: "Fix login", description: "details" } });
    const a = new JiraAdapter({
      baseUrl: "https://jira.example.com",
      email: "bot@example.com",
      token: "token-123",
      maxRetries: 0,
      fetch: fetchMock as any,
    });
    const issue = await a.getIssue("JIGIT-7");
    expect(issue.key).toBe("JIGIT-7");
    expect(issue.type).toBe("Bug");
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/api/3/issue/JIGIT-7");
    expect(opts.headers?.["Authorization"]).toMatch(/^Basic /);
  });

  it("throws on non-ok response", async () => {
    const fetchMock = makeFetch({}, false);
    const a = new JiraAdapter({ baseUrl: "https://j", email: "e", token: "t",
      maxRetries: 0, fetch: fetchMock as any });
    await expect(a.getIssue("X-1")).rejects.toThrow("jira 500");
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Create `packages/worker/src/adapters/jira.ts`:
```ts
import { withRetry } from "@jigit/shared";
import type { IJiraAdapter, IssueData } from "./interfaces.js";

export interface JiraOpts {
  baseUrl: string;
  email: string;
  token: string;
  maxRetries: number;
  fetch?: typeof fetch;
}

export class JiraAdapter implements IJiraAdapter {
  private readonly fetch: typeof fetch;
  constructor(private readonly o: JiraOpts) {
    this.fetch = o.fetch ?? globalThis.fetch;
  }

  private auth() {
    return "Basic " + Buffer.from(`${this.o.email}:${this.o.token}`).toString("base64");
  }

  getIssue(key: string): Promise<IssueData> {
    return withRetry(async () => {
      const r = await this.fetch(`${this.o.baseUrl}/rest/api/3/issue/${key}`, {
        headers: { Authorization: this.auth(), Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`jira ${r.status}`);
      const data = await r.json() as any;
      return {
        key: data.key,
        type: data.fields?.issuetype?.name ?? "Task",
        summary: data.fields?.summary ?? "",
        description: data.fields?.description ?? "",
      };
    }, { maxRetries: this.o.maxRetries, baseDelayMs: 500 });
  }

  addWorklog(key: string, text: string): Promise<void> {
    return withRetry(async () => {
      const r = await this.fetch(`${this.o.baseUrl}/rest/api/3/issue/${key}/comment`, {
        method: "POST",
        headers: {
          Authorization: this.auth(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          body: {
            type: "doc", version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          },
        }),
      });
      if (!r.ok) throw new Error(`jira ${r.status}`);
    }, { maxRetries: this.o.maxRetries, baseDelayMs: 500 }).then(() => undefined);
  }
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 4 — GitlabAdapter (TDD)

- [ ] **Write failing test** — `packages/worker/src/adapters/gitlab.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { GitlabAdapter } from "./gitlab.js";

describe("GitlabAdapter", () => {
  it("builds a clone URL with embedded token", () => {
    const a = new GitlabAdapter({ baseUrl: "https://gitlab.example.com",
      token: "glpat-xyz", maxRetries: 0 });
    const url = a.cloneUrlWithToken("42");
    expect(url).toContain("oauth2:glpat-xyz@");
    expect(url).toContain("42");
  });

  it("opens a MR and returns webUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ web_url: "https://gitlab.example.com/ns/repo/-/merge_requests/1", iid: 1 }),
    });
    const a = new GitlabAdapter({ baseUrl: "https://gitlab.example.com",
      token: "t", maxRetries: 0, fetch: fetchMock as any });
    const result = await a.openMergeRequest({
      projectId: "42", sourceBranch: "bugfix/X-1-foo",
      targetBranch: "main", title: "Fix X", description: "desc",
    });
    expect(result.webUrl).toContain("merge_requests/1");
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Create `packages/worker/src/adapters/gitlab.ts`:
```ts
import { withRetry } from "@jigit/shared";
import type { IGitlabAdapter, MrResult } from "./interfaces.js";

export interface GitlabOpts {
  baseUrl: string;
  token: string;
  maxRetries: number;
  fetch?: typeof fetch;
}

export class GitlabAdapter implements IGitlabAdapter {
  private readonly fetch: typeof fetch;
  constructor(private readonly o: GitlabOpts) {
    this.fetch = o.fetch ?? globalThis.fetch;
  }

  cloneUrlWithToken(projectId: string): string {
    const url = new URL(this.o.baseUrl);
    return `${url.protocol}//oauth2:${this.o.token}@${url.host}/${projectId}.git`;
  }

  openMergeRequest(opts: {
    projectId: string; sourceBranch: string; targetBranch: string;
    title: string; description: string;
  }): Promise<MrResult> {
    return withRetry(async () => {
      const r = await this.fetch(
        `${this.o.baseUrl}/api/v4/projects/${encodeURIComponent(opts.projectId)}/merge_requests`,
        {
          method: "POST",
          headers: {
            "PRIVATE-TOKEN": this.o.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source_branch: opts.sourceBranch,
            target_branch: opts.targetBranch,
            title: opts.title,
            description: opts.description,
            remove_source_branch: true,
          }),
        }
      );
      if (!r.ok) throw new Error(`gitlab ${r.status}`);
      const data = await r.json() as any;
      return { webUrl: data.web_url, iid: data.iid };
    }, { maxRetries: this.o.maxRetries, baseDelayMs: 500 });
  }
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 5 — GitAdapter (shell-out via execa)

- [ ] Create `packages/worker/src/adapters/git.ts`:
```ts
import { execa } from "execa";
import type { IGitAdapter } from "./interfaces.js";

export class GitAdapter implements IGitAdapter {
  async clone(url: string, workdir: string): Promise<void> {
    await execa("git", ["clone", "--depth=1", url, workdir]);
  }

  async createBranch(workdir: string, branch: string): Promise<void> {
    await execa("git", ["checkout", "-b", branch], { cwd: workdir });
  }

  async hasChanges(workdir: string): Promise<boolean> {
    const { stdout } = await execa("git", ["status", "--porcelain"], { cwd: workdir });
    return stdout.trim().length > 0;
  }

  async commitAll(workdir: string, message: string): Promise<void> {
    await execa("git", ["add", "-A"], { cwd: workdir });
    await execa("git", ["commit", "-m", message], { cwd: workdir });
  }

  async push(workdir: string, branch: string): Promise<void> {
    await execa("git", ["push", "--set-upstream", "origin", branch], { cwd: workdir });
  }
}
```

---

### Step 6 — ACP client (TDD with a fake agent process)

- [ ] **Write failing test** — `packages/worker/src/acp/client.test.ts`:

The test pipes a scripted Node.js process as the "fake agent" over stdio.

```ts
import { describe, it, expect, vi } from "vitest";
import { AcpSession } from "./client.js";

// Fake agent: reads JSON-RPC requests, emits scripted responses
const FAKE_AGENT_SCRIPT = `
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === "initialize") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: { protocolVersion: 1 } }) + "\\n");
    }
    if (msg.method === "session/new") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: { sessionId: "s1" } }) + "\\n");
    }
    if (msg.method === "session/prompt") {
      // emit an update
      process.stdout.write(JSON.stringify({
        method: "session/update",
        params: { sessionId: "s1", update: { kind: "agent_message", tokens: 7, costUsd: 0.001 } }
      }) + "\\n");
      // emit a permission request
      process.stdout.write(JSON.stringify({
        id: 999,
        method: "session/request_permission",
        params: { sessionId: "s1", toolCall: { name: "bash" },
          options: [{ optionId: "allow", name: "Allow" }, { optionId: "deny", name: "Deny" }] }
      }) + "\\n");
    }
    if (msg.id === 999) {
      // after permission resolved, send end_turn
      process.stdout.write(JSON.stringify({ id: msg.id, result: { stopReason: "end_turn" } }) + "\\n");
    }
  }
});
`;

describe("AcpSession", () => {
  it("runs a prompt and bridges permission requests", async () => {
    const updates: any[] = [];
    const session = new AcpSession({
      command: "node",
      args: ["-e", FAKE_AGENT_SCRIPT],
      onUpdate: (u) => updates.push(u),
      onPermission: async (_perm) => "allow",
    });

    await session.start();
    const result = await session.runPrompt("Implement the feature");
    await session.stop();

    expect(result.stopReason).toBe("end_turn");
    expect(result.tokensUsed).toBe(7);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].kind).toBe("agent_message");
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Create `packages/worker/src/acp/protocol.ts`:
```ts
import { Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";

export interface JsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export function createWriter(stream: Writable) {
  return (msg: JsonRpcMessage) => {
    stream.write(JSON.stringify(msg) + "\n");
  };
}

export function createReader(stream: Readable, onMessage: (msg: JsonRpcMessage) => void) {
  const rl = createInterface({ input: stream });
  rl.on("line", (line) => {
    try { onMessage(JSON.parse(line) as JsonRpcMessage); } catch { /* ignore malformed */ }
  });
  return rl;
}
```

- [ ] Create `packages/worker/src/acp/client.ts`:
```ts
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
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 7 — LangGraph graph (TDD with fakes)

- [ ] **Write failing test** — `packages/worker/src/graph.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { buildGraph } from "./graph.js";

const makeSink = () => ({
  setStatus: vi.fn().mockResolvedValue(undefined),
  startStep: vi.fn().mockResolvedValue("step-id-1"),
  finishStep: vi.fn().mockResolvedValue(undefined),
  addEvent: vi.fn().mockResolvedValue(undefined),
});

const makeSignals = (stop = false) => ({
  shouldStop: vi.fn().mockReturnValue(stop),
  shouldPause: vi.fn().mockReturnValue(false),
});

const fakeDeps = () => ({
  jira: {
    getIssue: vi.fn().mockResolvedValue({
      key: "JIGIT-7", type: "Bug", summary: "Fix login", description: "desc",
    }),
    addWorklog: vi.fn().mockResolvedValue(undefined),
  },
  gitlab: {
    cloneUrlWithToken: vi.fn().mockReturnValue("https://token@gitlab/repo.git"),
    openMergeRequest: vi.fn().mockResolvedValue({ webUrl: "https://gitlab/mr/1", iid: 1 }),
  },
  git: {
    clone: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    hasChanges: vi.fn().mockResolvedValue(true),
    commitAll: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
  },
  acp: {
    run: vi.fn().mockResolvedValue({ stopReason: "end_turn", tokensUsed: 100, costUsd: 0.05 }),
  },
  repoMapping: {
    gitlabProjectId: "proj-5",
    defaultBaseBranch: "main",
    branchPrefixRules: { Bug: "bugfix/", Story: "feature/", default: "feature/" },
  },
  sink: makeSink(),
  signals: makeSignals(),
  sendTelegram: vi.fn().mockResolvedValue(undefined),
});

describe("buildGraph", () => {
  it("runs to done and records mrUrl", async () => {
    const deps = fakeDeps();
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.mrUrl).toBe("https://gitlab/mr/1");
    expect(deps.sink.setStatus).toHaveBeenCalledWith("j-1", "done");
  });

  it("halts with status=stopped when stop signal fires before runAgent", async () => {
    const deps = fakeDeps();
    deps.signals.shouldStop = vi.fn().mockReturnValue(true);
    const graph = buildGraph(deps as any);
    const final = await graph.run({ jobId: "j-1", jiraIssueKey: "JIGIT-7" });
    expect(final.status).toBe("stopped");
    expect(deps.acp.run).not.toHaveBeenCalled();
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Create node files in `packages/worker/src/nodes/` and `packages/worker/src/graph.ts`.
  The graph uses `@langchain/langgraph`'s `StateGraph`. Each node:
  1. Calls `sink.startStep(jobId, nodeName)` → `stepId`.
  2. Does its work.
  3. Calls `sink.finishStep(stepId, "done")`.
  4. Calls `sink.addEvent(...)` for key events.
  5. Returns a state patch (`Partial<JobState>`).

  Between every pair of nodes the graph checks `signals.shouldStop(jobId)` via a
  conditional edge and transitions to a `stop` terminal node if true.

  `graph.ts` signature:
  ```ts
  export interface GraphDeps {
    jira: IJiraAdapter;
    gitlab: IGitlabAdapter;
    git: IGitAdapter;
    acp: { run(prompt: string, onPermission: (req: PermissionRequest) => Promise<string>): Promise<RunResult> };
    repoMapping: { gitlabProjectId: string; defaultBaseBranch: string; branchPrefixRules: object };
    sink: IJobSink;
    signals: ISignals;
    sendTelegram(text: string): Promise<void>;
  }

  export function buildGraph(deps: GraphDeps): { run(input: { jobId: string; jiraIssueKey: string }): Promise<JobState> }
  ```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 8 — PrismaJobSink (real sink used by worker entrypoint)

- [ ] Create `packages/worker/src/prisma-sink.ts`:
```ts
import { prisma, publishEvent, jobChannel, loadConfig } from "@jigit/shared";
import type { IJobSink } from "./adapters/interfaces.js";

export class PrismaJobSink implements IJobSink {
  private readonly cfg = loadConfig();

  async setStatus(jobId: string, status: string, error?: string): Promise<void> {
    await prisma.job.update({ where: { id: jobId }, data: { status: status as any, error } });
    await publishEvent(this.cfg.redisUrl, jobChannel(jobId), { type: "status_changed", status, error });
  }

  async startStep(jobId: string, name: string): Promise<string> {
    const step = await prisma.jobStep.create({
      data: { jobId, name, status: "running", startedAt: new Date() },
    });
    return step.id;
  }

  async finishStep(stepId: string, status: "done" | "failed", detail?: object): Promise<void> {
    await prisma.jobStep.update({
      where: { id: stepId },
      data: { status, finishedAt: new Date(), detail: detail ?? {} },
    });
  }

  async addEvent(jobId: string, opts: {
    type: string; message: string; level?: string; payload?: object;
  }): Promise<void> {
    const event = await prisma.jobEvent.create({
      data: {
        jobId,
        type: opts.type,
        message: opts.message,
        level: opts.level ?? "info",
        payload: opts.payload ?? {},
      },
    });
    // Fan out to SSE
    const cfg = this.cfg;
    await publishEvent(cfg.redisUrl, jobChannel(jobId), {
      type: "event",
      event: { ...event, payload: opts.payload },
    });
  }
}
```

---

### Step 9 — Worker entrypoint

- [ ] Replace placeholder `packages/worker/src/main.ts`:
```ts
import { createWorker, loadConfig, decrypt } from "@jigit/shared";
import { prisma } from "@jigit/shared";
import { buildGraph } from "./graph.js";
import { JiraAdapter } from "./adapters/jira.js";
import { GitlabAdapter } from "./adapters/gitlab.js";
import { GitAdapter } from "./adapters/git.js";
import { AcpSession } from "./acp/client.js";
import { PrismaJobSink } from "./prisma-sink.js";
import type { GraphDeps } from "./graph.js";
import IORedis from "ioredis";
import TelegramBot from "node-telegram-bot-api";

const cfg = loadConfig();

/** Per-job stop/pause flags driven by Redis control-channel messages */
class RedisSignals {
  private stopped = new Set<string>();
  private paused = new Set<string>();

  constructor(private redis: IORedis) {}

  listen(jobId: string) {
    this.redis.subscribe(`control:${jobId}`);
    this.redis.on("message", (_ch, msg) => {
      try {
        const signal = JSON.parse(msg);
        if (signal.jobId !== jobId) return;
        if (signal.type === "stop") this.stopped.add(jobId);
        if (signal.type === "pause") this.paused.add(jobId);
        if (signal.type === "resume") this.paused.delete(jobId);
      } catch { /* ignore */ }
    });
  }

  shouldStop(jobId: string): boolean { return this.stopped.has(jobId); }
  shouldPause(jobId: string): boolean { return this.paused.has(jobId); }
}

const telegramBot = new TelegramBot(cfg.telegramBotToken);

async function getCredential(kind: string, name: string) {
  const cred = await prisma.credential.findFirst({ where: { kind: kind as any, name } });
  if (!cred) throw new Error(`Credential not found: ${kind}/${name}`);
  const secrets = JSON.parse(decrypt(JSON.stringify(cred.secrets), cfg.encryptionKey));
  return { secrets, meta: cred.meta as Record<string, string> };
}

const worker = createWorker(
  cfg.redisUrl,
  async (job) => {
    const { jobId } = job.data;
    const jobRow = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { agentTemplate: true },
    });
    const mapping = await prisma.repoMapping.findFirst({
      where: { jiraProjectKey: jobRow.jiraIssueKey?.split("-")[0] ?? "" },
    });
    if (!mapping) throw new Error(`No repo mapping for job ${jobId}`);

    const jiraCred = await getCredential("jira", "default");
    const gitlabCred = await getCredential("gitlab", "default");
    const anthropicCred = await getCredential("anthropic", "default");

    const redisSignals = new RedisSignals(new IORedis(cfg.redisUrl, { maxRetriesPerRequest: null }));
    redisSignals.listen(jobId);

    const jira = new JiraAdapter({
      baseUrl: jiraCred.meta["baseUrl"] ?? "",
      email: jiraCred.secrets["email"],
      token: jiraCred.secrets["token"],
      maxRetries: cfg.maxRetries,
    });

    const gitlab = new GitlabAdapter({
      baseUrl: gitlabCred.meta["baseUrl"] ?? "",
      token: gitlabCred.secrets["token"],
      maxRetries: cfg.maxRetries,
    });

    const telegramChatId = (
      await getCredential("telegram", "default")
    ).meta["chatId"] ?? "";

    const deps: GraphDeps = {
      jira,
      gitlab,
      git: new GitAdapter(),
      acp: {
        run: async (prompt, onPermission) => {
          const session = new AcpSession({
            command: "npx",
            args: ["@zed-industries/claude-code-acp"],
            env: { ANTHROPIC_API_KEY: anthropicCred.secrets["apiKey"] },
            onUpdate: () => {},
            onPermission,
          });
          await session.start();
          const result = await session.runPrompt(prompt);
          await session.stop();
          return result;
        },
      },
      repoMapping: mapping as any,
      sink: new PrismaJobSink(),
      signals: redisSignals,
      sendTelegram: (text) => telegramBot.sendMessage(telegramChatId, text),
    };

    const graph = buildGraph(deps);
    await graph.run({ jobId, jiraIssueKey: jobRow.jiraIssueKey ?? "" });
  },
  cfg.maxConcurrentAgents
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log(`JiGit worker started (concurrency=${cfg.maxConcurrentAgents})`);
```

---

### Step 10 — Build + test

- [ ] Run:
```bash
pnpm --filter @jigit/worker build
pnpm --filter @jigit/worker test
```

---

### Step 11 — Commit

- [ ] Stage and commit:
```bash
git add packages/worker/src \
        packages/worker/package.json
git commit -m "feat(worker): adapters, ACP client, LangGraph graph, worker entrypoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
