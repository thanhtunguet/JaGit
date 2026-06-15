import { useState, useEffect } from "react";

const BASE = ""; // same origin; vite proxy handles /jobs → http://localhost:3000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = init ? await fetch(BASE + path, init) : await fetch(BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const listJobs = () => request<Job[]>("/jobs");
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

// ─── useSSE hook ──────────────────────────────────────────────────────────────

export function useSSE<T>(jobId: string) {
  const [events, setEvents] = useState<T[]>([]);

  useEffect(() => {
    const es = new EventSource(`/jobs/${jobId}/stream`);
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
