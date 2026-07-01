// Mock data for JiGit dashboard. Mirrors swagger.yml shapes.

export type JobStatus =
  | "queued"
  | "cloning"
  | "branch"
  | "coding"
  | "awaiting_approval"
  | "pushing"
  | "opening_mr"
  | "reporting"
  | "done"
  | "failed"
  | "stopped"
  | "paused";

export const STATIONS: { key: JobStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "cloning", label: "Cloning" },
  { key: "branch", label: "Branch" },
  { key: "coding", label: "Coding" },
  { key: "awaiting_approval", label: "Approval Gate" },
  { key: "pushing", label: "Pushing" },
  { key: "opening_mr", label: "MR" },
  { key: "reporting", label: "Reporting" },
  { key: "done", label: "Done" },
];

export type Job = {
  id: string;
  issueKey: string;
  title: string;
  repo: string;
  branch: string;
  status: JobStatus;
  step: string;
  mrUrl?: string;
  tokens: number;
  costUsd: number;
  startedAt: string;
  updatedAt: string;
};

export type Approval = {
  id: string;
  jobId: string;
  issueKey: string;
  tool: string;
  summary: string;
  options: string[];
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
};

export type EventEntry = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error" | "agent";
  step?: string;
  message: string;
  data?: Record<string, unknown>;
};

export type StepEntry = {
  key: JobStatus;
  status: "done" | "active" | "pending" | "failed" | "blocked";
  startedAt?: string;
  endedAt?: string;
  note?: string;
};

// Fixed reference so SSR and client agree (avoids hydration mismatch).
export const NOW_MS = 1_750_507_200_000;
const now = NOW_MS;
const ago = (m: number) => new Date(now - m * 60_000).toISOString();
const ahead = (m: number) => new Date(now + m * 60_000).toISOString();

export const JOBS: Job[] = [
  {
    id: "clz9k2a01",
    issueKey: "SCRUM-26",
    title: "Add Postgres LISTEN/NOTIFY for job state changes",
    repo: "infra/orchestrator",
    branch: "feature/SCRUM-26-pg-listen-notify",
    status: "awaiting_approval",
    step: "tool_call: shell.write",
    tokens: 184_320,
    costUsd: 1.84,
    startedAt: ago(42),
    updatedAt: ago(2),
  },
  {
    id: "clz9k2b14",
    issueKey: "SCRUM-31",
    title: "Wire Telegram approve/reject callbacks",
    repo: "apps/telegram-bot",
    branch: "feature/SCRUM-31-tg-callbacks",
    status: "coding",
    step: "edit_file: src/handlers/approve.ts",
    tokens: 92_104,
    costUsd: 0.91,
    startedAt: ago(18),
    updatedAt: ago(0),
  },
  {
    id: "clz9k2c22",
    issueKey: "SCRUM-29",
    title: "Redact secrets in event payload viewer",
    repo: "packages/dashboard",
    branch: "feature/SCRUM-29-redact-secrets",
    status: "pushing",
    step: "git push origin HEAD",
    tokens: 41_009,
    costUsd: 0.34,
    startedAt: ago(11),
    updatedAt: ago(0),
  },
  {
    id: "clz9k2d33",
    issueKey: "SCRUM-30",
    title: "MR template: link Jira issue + ACP session",
    repo: "infra/orchestrator",
    branch: "feature/SCRUM-30-mr-template",
    status: "opening_mr",
    step: "POST /projects/:id/merge_requests",
    tokens: 28_220,
    costUsd: 0.22,
    startedAt: ago(7),
    updatedAt: ago(0),
  },
  {
    id: "clz9k2e44",
    issueKey: "SCRUM-22",
    title: "Cap concurrent ACP sessions at 4",
    repo: "infra/orchestrator",
    branch: "feature/SCRUM-22-cap-sessions",
    status: "done",
    step: "reported to Jira",
    mrUrl: "https://gitlab.example.com/infra/orchestrator/-/merge_requests/418",
    tokens: 156_800,
    costUsd: 1.42,
    startedAt: ago(180),
    updatedAt: ago(120),
  },
  {
    id: "clz9k2f55",
    issueKey: "SCRUM-19",
    title: "Backoff on Jira 429",
    repo: "packages/jira-client",
    branch: "feature/SCRUM-19-jira-backoff",
    status: "failed",
    step: "step: pushing — auth denied",
    tokens: 88_700,
    costUsd: 0.78,
    startedAt: ago(260),
    updatedAt: ago(240),
  },
  {
    id: "clz9k2g66",
    issueKey: "SCRUM-33",
    title: "Surface token cost in worklog comment",
    repo: "packages/jira-client",
    branch: "feature/SCRUM-33-worklog-cost",
    status: "queued",
    step: "waiting for slot",
    tokens: 0,
    costUsd: 0,
    startedAt: ago(1),
    updatedAt: ago(1),
  },
];

export const APPROVALS: Approval[] = [
  {
    id: "appr_01",
    jobId: "clz9k2a01",
    issueKey: "SCRUM-26",
    tool: "shell.write",
    summary: "Apply patch to infra/orchestrator/src/db/listen.ts (+148 / −12)",
    options: ["Approve once", "Approve & remember tool", "Reject"],
    payload: {
      tool: "shell.write",
      cwd: "/work/clz9k2a01/infra/orchestrator",
      command: "git apply",
      patchSize: 4821,
      files: ["src/db/listen.ts", "src/db/index.ts", "test/listen.spec.ts"],
    },
    createdAt: ago(2),
    expiresAt: ahead(13),
  },
  {
    id: "appr_02",
    jobId: "clz9k2b14",
    issueKey: "SCRUM-31",
    tool: "shell.exec",
    summary: "Run `pnpm test --filter telegram-bot` (network: off, timeout 120s)",
    options: ["Approve once", "Approve & remember tool", "Reject"],
    payload: {
      tool: "shell.exec",
      command: "pnpm test --filter telegram-bot",
      network: false,
      timeoutMs: 120000,
    },
    createdAt: ago(6),
    expiresAt: ahead(9),
  },
  {
    id: "appr_03",
    jobId: "clz9k2d33",
    issueKey: "SCRUM-30",
    tool: "gitlab.mr.create",
    summary: "Open MR → infra/orchestrator main from feature/SCRUM-30-mr-template",
    options: ["Approve", "Reject"],
    payload: {
      tool: "gitlab.mr.create",
      project: "infra/orchestrator",
      source: "feature/SCRUM-30-mr-template",
      target: "main",
      title: "SCRUM-30: MR template — link Jira issue + ACP session",
    },
    createdAt: ago(9),
    expiresAt: ahead(5),
  },
];

export const EVENTS: EventEntry[] = [
  { id: "e1", ts: ago(0.2), level: "agent", step: "coding", message: "edit_file applied", data: { file: "src/handlers/approve.ts", lines: 32 } },
  { id: "e2", ts: ago(0.5), level: "info", step: "coding", message: "read_file src/handlers/index.ts" },
  { id: "e3", ts: ago(1), level: "warn", step: "awaiting_approval", message: "tool requires approval: shell.write" },
  { id: "e4", ts: ago(2), level: "agent", step: "coding", message: "planning patch for db/listen.ts" },
  { id: "e5", ts: ago(3), level: "info", step: "branch", message: "checked out feature/SCRUM-26-pg-listen-notify" },
  { id: "e6", ts: ago(4), level: "info", step: "cloning", message: "git clone infra/orchestrator (1.2s)" },
  { id: "e7", ts: ago(5), level: "info", step: "queued", message: "job enqueued from Jira webhook" },
];

export const STEPS: StepEntry[] = [
  { key: "queued", status: "done", startedAt: ago(42), endedAt: ago(42) },
  { key: "cloning", status: "done", startedAt: ago(42), endedAt: ago(41) },
  { key: "branch", status: "done", startedAt: ago(41), endedAt: ago(40) },
  { key: "coding", status: "done", startedAt: ago(40), endedAt: ago(3) },
  { key: "awaiting_approval", status: "blocked", startedAt: ago(2), note: "shell.write — 3 files" },
  { key: "pushing", status: "pending" },
  { key: "opening_mr", status: "pending" },
  { key: "reporting", status: "pending" },
  { key: "done", status: "pending" },
];

export const REPO_MAPPINGS = [
  { id: "rm1", jiraProject: "SCRUM", repo: "infra/orchestrator", baseBranch: "main", branchTemplate: "feature/{issueKey}-{slug}" },
  { id: "rm2", jiraProject: "SCRUM", repo: "packages/dashboard", baseBranch: "main", branchTemplate: "feature/{issueKey}-{slug}" },
  { id: "rm3", jiraProject: "BOT", repo: "apps/telegram-bot", baseBranch: "main", branchTemplate: "bot/{issueKey}-{slug}" },
];

export const AGENT_TEMPLATES = [
  { id: "at1", name: "default", model: "claude-sonnet-4.5", maxTurns: 40, autonomyLevel: "supervised", tools: ["shell.read", "shell.write", "shell.exec", "gitlab.mr.create"] },
  { id: "at2", name: "fast-fix", model: "claude-haiku-4", maxTurns: 16, autonomyLevel: "supervised", tools: ["shell.read", "shell.write"] },
  { id: "at3", name: "research", model: "claude-sonnet-4.5", maxTurns: 60, autonomyLevel: "read-only", tools: ["shell.read"] },
];

export const CREDENTIALS = [
  { id: "c1", name: "GitLab — bot account", kind: "gitlab_token", scopes: ["api", "read_repository", "write_repository"], updatedAt: ago(2 * 60 * 24) },
  { id: "c2", name: "Jira Cloud", kind: "jira_basic", scopes: ["write", "worklog"], updatedAt: ago(8 * 60 * 24) },
  { id: "c3", name: "Telegram bot token", kind: "telegram_token", scopes: ["bot"], updatedAt: ago(3 * 60 * 24) },
  { id: "c4", name: "Anthropic", kind: "anthropic_key", scopes: ["messages"], updatedAt: ago(60 * 24) },
];

export type McpEnvVar = { key: string; value: string; secret?: boolean };
export type McpHeader = { key: string; value: string; secret?: boolean };

export const MCP_SERVERS: Array<{
  id: string;
  name: string;
  transport: "stdio" | "http" | "sse";
  command: string;
  status: string;
  tools: string[];
  lastSeen: string;
  env?: McpEnvVar[];
  headers?: McpHeader[];
}> = [
  {
    id: "m1",
    name: "jigit",
    transport: "stdio",
    command: "node packages/mcp-jigit/dist/index.js",
    status: "healthy",
    tools: ["request_review", "fetch_context", "post_worklog"],
    lastSeen: ago(0.3),
    env: [
      { key: "JIGIT_API_URL", value: "http://127.0.0.1:8787" },
      { key: "JIGIT_API_TOKEN", value: "••••••••••••••••", secret: true },
      { key: "LOG_LEVEL", value: "info" },
    ],
  },
  {
    id: "m2",
    name: "filesystem",
    transport: "stdio",
    command: "npx @mcp/filesystem /work",
    status: "healthy",
    tools: ["read_file", "write_file", "list_dir"],
    lastSeen: ago(0.1),
    env: [
      { key: "FS_ROOT", value: "/work" },
      { key: "FS_READONLY", value: "false" },
    ],
  },
  {
    id: "m3",
    name: "gitlab",
    transport: "http",
    command: "https://mcp.internal/gitlab",
    status: "degraded",
    tools: ["mr.create", "mr.update", "ci.status"],
    lastSeen: ago(4),
    headers: [
      { key: "Authorization", value: "Bearer ••••••••••••", secret: true },
      { key: "X-Project-Scope", value: "platform/*" },
    ],
  },
];

export const STATS = {
  activeJobs: JOBS.filter(j => !["done", "failed", "stopped"].includes(j.status)).length,
  doneToday: 11,
  tokensToday: 2_184_900,
  approvalQueueSize: APPROVALS.length,
  costTodayUsd: 18.42,
  avgTimeToMergeMin: 27,
};

export function getJob(id: string) {
  return JOBS.find(j => j.id === id);
}
export function statusColor(s: JobStatus): "amber" | "teal" | "moss" | "brick" | "muted" {
  if (s === "awaiting_approval") return "amber";
  if (s === "done") return "moss";
  if (s === "failed" || s === "stopped") return "brick";
  if (s === "queued" || s === "paused") return "muted";
  return "teal";
}
export function stationIndex(s: JobStatus): number {
  const i = STATIONS.findIndex(st => st.key === s);
  if (i >= 0) return i;
  if (s === "stopped" || s === "failed") return 4; // visually park failures near the gate
  if (s === "paused") return 3;
  return 0;
}

// ---- Usage analytics (mock) ----
export type AiSession = {
  id: string;
  username: string;
  tool: string;
  model: string;
  startedAt: string;
  durationSec: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUsd: number;
};

const USERS = ["alice", "bob", "carol", "dan", "erin", "frank", "gina", "hugo"];
const TOOLS = ["Claude Code", "Cursor", "Aider", "Codex CLI", "Continue"];
const MODELS = [
  "claude-sonnet-4.5",
  "claude-opus-4.1",
  "gpt-5",
  "gpt-5-mini",
  "gemini-2.5-pro",
  "deepseek-v3",
];

const PRICES: Record<string, { in: number; out: number; cache: number }> = {
  "claude-sonnet-4.5": { in: 3, out: 15, cache: 0.3 },
  "claude-opus-4.1":   { in: 15, out: 75, cache: 1.5 },
  "gpt-5":             { in: 5, out: 15, cache: 0.5 },
  "gpt-5-mini":        { in: 0.25, out: 2, cache: 0.025 },
  "gemini-2.5-pro":    { in: 2.5, out: 10, cache: 0.25 },
  "deepseek-v3":       { in: 0.27, out: 1.1, cache: 0.07 },
};

// seeded PRNG for stable mock data
function mulberry(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

export const AI_SESSIONS: AiSession[] = Array.from({ length: 84 }, (_, i) => {
  const model = pick(MODELS);
  const inT = Math.floor(2000 + rand() * 60000);
  const cached = Math.floor(inT * (0.1 + rand() * 0.5));
  const outT = Math.floor(500 + rand() * 12000);
  const p = PRICES[model];
  const cost =
    ((inT - cached) * p.in + cached * p.cache + outT * p.out) / 1_000_000;
  const minutesAgo = Math.floor(rand() * 60 * 24 * 7); // last 7 days
  return {
    id: `s${(1000 + i).toString()}`,
    username: pick(USERS),
    tool: pick(TOOLS),
    model,
    startedAt: new Date(NOW_MS - minutesAgo * 60_000).toISOString(),
    durationSec: Math.floor(30 + rand() * 1800),
    inputTokens: inT,
    cachedTokens: cached,
    outputTokens: outT,
    costUsd: Number(cost.toFixed(4)),
  };
});

export const USAGE_USERS = USERS;
export const USAGE_TOOLS = TOOLS;
export const USAGE_MODELS = MODELS;
