import { useState, useEffect } from "react";
import { storage } from "@/lib/storage";

const BASE = "/api"; // same origin; vite proxy handles /jobs → http://localhost:3000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = storage.getItem("DASHBOARD_API_TOKEN") ?? "";
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = init
    ? await fetch(BASE + path, { ...init, headers })
    : await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const TERMINAL_JOB_STATUSES = ["done", "stopped", "failed"] as const;

export const isActiveJob = (job: Pick<Job, "status">) =>
  !(TERMINAL_JOB_STATUSES as readonly string[]).includes(job.status);

export const listJobs = () => request<Job[]>("/jobs");
export const getOverviewStats = () => request<OverviewStats>("/stats/overview");
export const getJob = (id: string) => request<JobDetail>(`/jobs/${id}`);
export const controlJob = (id: string, action: "stop" | "pause" | "resume") =>
  request<void>(`/jobs/${id}/${action}`, { method: "POST" });
export const retryJob = (id: string) =>
  request<{ accepted: boolean; jobId: string }>(`/jobs/${id}/retry`, { method: "POST" });
export const deleteJob = (id: string) =>
  request<{ deleted: boolean }>(`/jobs/${id}`, { method: "DELETE" });
export const decideApproval = (id: string, optionId: string) =>
  request<void>(`/approvals/${id}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionId }),
  });

// ─── Types (mirror the Prisma shapes the API returns) ────────────────────────

export interface Job {
  id: string;
  source: string;
  jiraIssueKey: string | null;
  branch: string | null;
  mrUrl: string | null;
  status: string;
  error?: string | null;
  tokensUsed: number;
  costUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobStep {
  id: string;
  name: string;
  status: string;
  detail: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobEvent {
  id: string;
  ts: string;
  level: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
}

export interface Approval {
  id: string;
  kind: string;
  prompt: string;
  options: { optionId: string; name: string }[];
  status: string;
}

export interface JobDetail extends Job {
  steps: JobStep[];
  events: JobEvent[];
  approvals: Approval[];
}

export interface OverviewStats {
  activeJobs: number;
  doneToday: number;
  doneYesterday: number;
  approvalQueue: number;
  totalTokensUsed: number;
  totalBaseTokens: number | null;
  throughput: { day: string; date: string; jobs: number }[];
  statusDistribution: { status: string; count: number }[];
  recentEvents: {
    id: string;
    ts: string;
    level: string;
    type: string;
    message: string;
    jiraIssueKey: string | null;
  }[];
}

// ─── Config CRUD ─────────────────────────────────────────────────────────────

export interface CredentialListItem {
  id: string;
  kind: string;
  name: string;
  meta: Record<string, string>;
  secretKeys: string[];
}

export interface CredentialCreateBody {
  kind: string;
  name: string;
  meta: Record<string, string>;
  secrets: Record<string, string>;
}

export interface RepoMappingItem {
  id: string;
  jiraProjectKey: string;
  gitlabProjectId: string;
  defaultBaseBranch: string;
  branchPrefixRules: Record<string, string>;
  agentTemplateId: string;
  agentTemplate?: { id: string; name: string };
}

export interface AgentTemplateItem {
  id: string;
  name: string;
  model: string;
  prompt: string;
  maxTurns?: number;
  mcpServerIds?: string[];
  requireReviewBeforeCommit?: boolean;
}

export type McpEnvValue =
  | string
  | { type: "credential"; kind: string; name: string; secretKey: string };

export type McpTransport = "stdio" | "http";

export interface McpServerItem {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, McpEnvValue>;
  url: string | null;
  headers: Record<string, McpEnvValue>;
  enabled: boolean;
}

export interface McpServerInput {
  name: string;
  transport: McpTransport;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, McpEnvValue>;
  url?: string;
  headers?: Record<string, McpEnvValue>;
}

export const listCredentials = () => request<CredentialListItem[]>("/credentials");
export const createCredential = (body: CredentialCreateBody) =>
  request<{ id: string }>("/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const updateCredential = (id: string, body: Omit<CredentialCreateBody, "kind">) =>
  request<{ updated: boolean }>(`/credentials/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteCredential = (id: string) =>
  request<{ deleted: boolean }>(`/credentials/${id}`, { method: "DELETE" });

export const listRepoMappings = () => request<RepoMappingItem[]>("/repo-mappings");
export const createRepoMapping = (body: Omit<RepoMappingItem, "id" | "agentTemplate">) =>
  request<RepoMappingItem>("/repo-mappings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const updateRepoMapping = (id: string, body: Omit<RepoMappingItem, "id" | "agentTemplate">) =>
  request<RepoMappingItem>(`/repo-mappings/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteRepoMapping = (id: string) =>
  request<{ deleted: boolean }>(`/repo-mappings/${id}`, { method: "DELETE" });

export const listAgentTemplates = () => request<AgentTemplateItem[]>("/agent-templates");
export const createAgentTemplate = (body: Omit<AgentTemplateItem, "id">) =>
  request<AgentTemplateItem>("/agent-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const updateAgentTemplate = (id: string, body: Omit<AgentTemplateItem, "id">) =>
  request<AgentTemplateItem>(`/agent-templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteAgentTemplate = (id: string) =>
  request<{ deleted: boolean }>(`/agent-templates/${id}`, { method: "DELETE" });

export const listMcpServers = () => request<McpServerItem[]>("/mcp-servers");
export const createMcpServer = (body: McpServerInput) =>
  request<McpServerItem>("/mcp-servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const updateMcpServer = (id: string, body: McpServerInput) =>
  request<McpServerItem>(`/mcp-servers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const deleteMcpServer = (id: string) =>
  request<{ deleted: boolean }>(`/mcp-servers/${id}`, { method: "DELETE" });

export const listPendingApprovals = () =>
  request<(Approval & { jobId: string; createdAt: string; job: { id: string; jiraIssueKey: string | null } })[]>(
    "/approvals",
  );

// ─── Usage API ────────────────────────────────────────────────────────────────

export interface UsageUser {
  id: string;
  username: string;
  createdAt: string;
  _count: { uploads: number };
}

export interface UsageUpload {
  id: string;
  userId: string;
  uploadedAt: string;
  period: string;
  data: UsageData;
}

export interface UsageData {
  summary: SummaryRow[];
  daily: DailyRow[];
  activity: ActivityRow[];
  models: ModelRow[];
  projects: ProjectRow[];
  sessions: SessionRow[];
  tools: ToolRow[];
  shellCommands: ShellCommandRow[];
}

export interface SummaryRow {
  Period: string;
  "Cost (USD)": number;
  "Saved (USD)": number;
  "API Calls": number;
  Sessions: number;
  Projects: number;
}

export interface DailyRow {
  Period: string;
  Date: string;
  "Cost (USD)": number;
  "Saved (USD)": number;
  "API Calls": number;
  Sessions: number;
  "Input Tokens": number;
  "Output Tokens": number;
  "Cache Read Tokens": number;
  "Cache Write Tokens": number;
}

export interface ActivityRow {
  Period: string;
  Activity: string;
  "Cost (USD)": number;
  "Share (%)": number;
  Turns: number;
}

export interface ModelRow {
  Period: string;
  Model: string;
  "Cost (USD)": number;
  "Saved (USD)": number;
  "Share (%)": number;
  "API Calls": number;
  "Edit Turns": number;
  "One-shot Rate (%)": number | null;
  "Retries/Edit": number | null;
  "Cost/Edit (USD)": number | null;
  "Input Tokens": number;
  "Output Tokens": number;
  "Cache Read Tokens": number;
  "Cache Write Tokens": number;
}

export interface ProjectRow {
  Project: string;
  "Cost (USD)": number;
  "Saved (USD)": number;
  "Avg/Session (USD)": number;
  "Share (%)": number;
  "API Calls": number;
  Sessions: number;
}

export interface SessionRow {
  Project: string;
  "Session ID": string;
  "Started At": string;
  "Cost (USD)": number;
  "Saved (USD)": number;
  "API Calls": number;
  Turns: number;
}

export interface ToolRow {
  Tool: string;
  Calls: number;
  "Share (%)": number;
}

export interface ShellCommandRow {
  Command: string;
  Calls: number;
  "Share (%)": number;
}

export const listUsageUsers = () => request<UsageUser[]>("/usage/users");
export const getUserUploads = (username: string) =>
  request<UsageUpload[]>(`/usage/users/${encodeURIComponent(username)}`);
export const getLatestUpload = (username: string) =>
  request<UsageUpload | { data: null }>(`/usage/users/${encodeURIComponent(username)}/latest`);
export const deleteUsageUser = (username: string) =>
  request<{ deleted: boolean }>(`/usage/users/${encodeURIComponent(username)}`, {
    method: "DELETE",
  });

// ─── Agent Sessions API ─────────────────────────────────────────────────────

export type AgentSessionTool = "claude-code" | "codex" | "copilot";

export interface AgentSessionRow {
  id: string;
  tool: string; // enum form from API: claude_code | codex | copilot
  sessionId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  toolCallCount: number | null;
  baseTokens: number | null;
  startedAt: string;
  lastUpdatedAt: string;
  createdAt: string;
  rawPayload?: Record<string, unknown>;
  user: { username: string };
}

export interface AgentSessionListResponse {
  rows: AgentSessionRow[];
  total: number;
}

export interface AgentSessionFilters {
  tool?: AgentSessionTool;
  username?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const listAgentSessions = (filters: AgentSessionFilters = {}) => {
  const qs = new URLSearchParams();
  if (filters.tool) qs.set("tool", filters.tool);
  if (filters.username) qs.set("username", filters.username);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  if (filters.limit != null) qs.set("limit", String(filters.limit));
  if (filters.offset != null) qs.set("offset", String(filters.offset));
  return request<AgentSessionListResponse>(`/agent-sessions?${qs.toString()}`);
};

export const getAgentSession = (id: string) =>
  request<AgentSessionRow>(`/agent-sessions/${encodeURIComponent(id)}`);

export interface AgentSessionAggregateResponse {
  byUser: { username: string; costUsd: number }[];
  byModel: { model: string; costUsd: number }[];
  byTool: { tool: string; costUsd: number }[];
  totalTokens: { newInput: number; cachedInput: number; output: number };
  totalCostUsd: number;
  missingCostCount: number;
  baseTokens: { input: number; output: number; total: number } | null;
}

export const aggregateAgentSessions = (filters: Omit<AgentSessionFilters, "limit" | "offset"> = {}) => {
  const qs = new URLSearchParams();
  if (filters.tool) qs.set("tool", filters.tool);
  if (filters.username) qs.set("username", filters.username);
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  return request<AgentSessionAggregateResponse>(`/agent-sessions/aggregate?${qs.toString()}`);
};

// ─── Token helper ─────────────────────────────────────────────────────────────

export const getStoredToken = () => storage.getItem("DASHBOARD_API_TOKEN") ?? "";
export const setStoredToken = (t: string) => storage.setItem("DASHBOARD_API_TOKEN", t);

// ─── useSSE hook ──────────────────────────────────────────────────────────────

export function useSSE<T>(jobId: string) {
  const [events, setEvents] = useState<T[]>([]);

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.onmessage = (e) => {
      try {
        setEvents((prev) => [...prev, JSON.parse(e.data) as T]);
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [jobId]);

  return events;
}

// ─── useApprovalsSSE hook ─────────────────────────────────────────────────────

export function useApprovalsSSE(
  onEvent: (evt: { type: string; approvalId: string; jobId: string; [k: string]: unknown }) => void,
) {
  useEffect(() => {
    const es = new EventSource("/api/approvals/stream");
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [onEvent]);
}
