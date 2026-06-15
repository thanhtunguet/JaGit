import { useState, useEffect } from "react";

const BASE = "/api"; // same origin; vite proxy handles /jobs → http://localhost:3000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem("DASHBOARD_API_TOKEN") ?? "";
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

export const listJobs = () => request<Job[]>("/jobs");
export const getOverviewStats = () => request<OverviewStats>("/stats/overview");
export const getJob = (id: string) => request<JobDetail>(`/jobs/${id}`);
export const controlJob = (id: string, action: "stop" | "pause" | "resume") =>
  request<void>(`/jobs/${id}/${action}`, { method: "POST" });
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

export const listPendingApprovals = () =>
  request<(Approval & { jobId: string; createdAt: string; job: { id: string; jiraIssueKey: string | null } })[]>(
    "/approvals",
  );

// ─── Token helper ─────────────────────────────────────────────────────────────

export const getStoredToken = () => sessionStorage.getItem("DASHBOARD_API_TOKEN") ?? "";
export const setStoredToken = (t: string) => sessionStorage.setItem("DASHBOARD_API_TOKEN", t);

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
