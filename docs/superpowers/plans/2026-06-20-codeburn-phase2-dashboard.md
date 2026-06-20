# CodeBurn Consolidation — Phase 2: Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port CodeBurn's React dashboard components into JiGit's dashboard and add a `/usage` page with an Overview widget.

**Architecture:** Reuse CodeBurn's component logic (charts, tables, selectors) but adapt data fetching to call JiGit's new `/api/usage/*` endpoints. Components live in `packages/dashboard/src/components/usage/`. The page is assembled at `packages/dashboard/src/pages/Usage.tsx`.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Recharts, react-router-dom

---

## File Structure

| File | Responsibility |
|------|--------------|
| `packages/dashboard/src/api/client.ts` | Add usage API functions |
| `packages/dashboard/src/hooks/useUsageData.ts` | Hook to fetch usage data by user/period |
| `packages/dashboard/src/components/usage/SummaryCards.tsx` | 4 stat cards (total cost, API calls, projects, avg/session) |
| `packages/dashboard/src/components/usage/DailyChart.tsx` | Bar chart of daily spend |
| `packages/dashboard/src/components/usage/ActivityChart.tsx` | Horizontal bar: cost by activity |
| `packages/dashboard/src/components/usage/ModelsChart.tsx` | Horizontal bar: cost by model (top 8) |
| `packages/dashboard/src/components/usage/ProjectsChart.tsx` | Horizontal bar: top 10 projects |
| `packages/dashboard/src/components/usage/SessionsTable.tsx` | Table: top 20 sessions |
| `packages/dashboard/src/components/usage/ToolsChart.tsx` | Horizontal bar: tool usage (top 10) |
| `packages/dashboard/src/components/usage/ShellCommandsChart.tsx` | Horizontal bar: shell commands (top 10) |
| `packages/dashboard/src/components/usage/UserSelector.tsx` | Pill buttons for user selection |
| `packages/dashboard/src/components/usage/PeriodToggle.tsx` | Today / 7 Days / 30 Days toggle |
| `packages/dashboard/src/pages/Usage.tsx` | Assembled usage page |
| `packages/dashboard/src/App.tsx` | Add `/usage` route |
| `packages/dashboard/src/components/layout/AppShell.tsx` | Add "Usage" nav item |
| `packages/dashboard/src/pages/Overview.tsx` | Add AI Usage widget section |

---

## Task 1: Dashboard API Client

**Goal:** Add usage API functions to the dashboard's API client.

**Files:**
- Modify: `packages/dashboard/src/api/client.ts`

**Acceptance Criteria:**
- [ ] `listUsageUsers()` calls `GET /api/usage/users`
- [ ] `getUserUploads(username)` calls `GET /api/usage/users/:username`
- [ ] `getLatestUpload(username)` calls `GET /api/usage/users/:username/latest`
- [ ] `deleteUsageUser(username)` calls `DELETE /api/usage/users/:username` (with auth)
- [ ] Types mirror the API response shapes

**Verify:** `pnpm --filter @jigit/dashboard test client.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Add to `packages/dashboard/src/api/client.test.ts` (after existing tests):

```typescript
  it("listUsageUsers calls GET /api/usage/users", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listUsageUsers();
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/usage/users");
  });

  it("getLatestUpload calls GET /api/usage/users/:username/latest", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "up1", data: {} }) } as any);
    await getLatestUpload("alice");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/usage/users/alice/latest", expect.anything());
  });
```

Run test (should fail):

```bash
pnpm --filter @jigit/dashboard test client.test.ts
```

Expected: FAIL — `listUsageUsers` and `getLatestUpload` not defined.

- [ ] **Step 2: Add types and functions**

Add to `packages/dashboard/src/api/client.ts` (after existing exports):

```typescript
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
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @jigit/dashboard test client.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/api/client.ts packages/dashboard/src/api/client.test.ts
git commit -m "feat: add usage API client functions and types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: useUsageData Hook

**Goal:** Create a hook that fetches usage data for a selected user and period.

**Files:**
- Create: `packages/dashboard/src/hooks/useUsageData.ts`
- Create: `packages/dashboard/src/hooks/useUsageData.test.ts`

**Acceptance Criteria:**
- [ ] Hook accepts `username` and `period` (Today | 7 Days | 30 Days)
- [ ] Fetches from `GET /api/usage/users/:username/latest`
- [ ] Returns `{ data, loading, error }` shape
- [ ] Filters data rows by the selected period
- [ ] Test covers loading, success, error states

**Verify:** `pnpm --filter @jigit/dashboard test useUsageData.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `packages/dashboard/src/hooks/useUsageData.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUsageData } from "./useUsageData.js";

vi.stubGlobal("fetch", vi.fn());

const mockUpload = {
  id: "up1",
  userId: "u1",
  uploadedAt: "2026-06-20T00:00:00Z",
  period: "30days",
  data: {
    summary: [{ Period: "30 Days", "Cost (USD)": 100, "Saved (USD)": 0, "API Calls": 50, Sessions: 10, Projects: 3 }],
    daily: [],
    activity: [],
    models: [],
    projects: [],
    sessions: [],
    tools: [],
    shellCommands: [],
  },
};

describe("useUsageData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns loading initially", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useUsageData("alice", "30 Days"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("returns data on success", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockUpload,
    } as any);
    const { result } = renderHook(() => useUsageData("alice", "30 Days"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("returns error on fetch failure", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as any);
    const { result } = renderHook(() => useUsageData("alice", "30 Days"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("404");
  });
});
```

Run test (should fail):

```bash
pnpm --filter @jigit/dashboard test useUsageData.test.ts
```

Expected: FAIL — hook doesn't exist.

- [ ] **Step 2: Implement the hook**

Create `packages/dashboard/src/hooks/useUsageData.ts`:

```typescript
import { useState, useEffect } from "react";
import { getLatestUpload, type UsageData } from "@/api/client.js";

export type Period = "Today" | "7 Days" | "30 Days";

export interface UsageDataResult {
  data: UsageData | null;
  loading: boolean;
  error: string | null;
}

export function useUsageData(username: string | null, period: Period): UsageDataResult {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    getLatestUpload(username)
      .then((upload) => {
        if ("data" in upload && upload.data === null) {
          setData(null);
          return;
        }
        const uploadData = upload as { data: UsageData };
        // Filter rows by period
        const periodKey = period === "Today" ? "Today" : period === "7 Days" ? "7 Days" : "30 Days";
        const filtered: UsageData = {
          summary: uploadData.data.summary.filter((r) => r.Period === periodKey),
          daily: uploadData.data.daily.filter((r) => r.Period === periodKey),
          activity: uploadData.data.activity.filter((r) => r.Period === periodKey),
          models: uploadData.data.models.filter((r) => r.Period === periodKey),
          projects: uploadData.data.projects,
          sessions: uploadData.data.sessions,
          tools: uploadData.data.tools,
          shellCommands: uploadData.data.shellCommands,
        };
        setData(filtered);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [username, period]);

  return { data, loading, error };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @jigit/dashboard test useUsageData.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/hooks/useUsageData.ts packages/dashboard/src/hooks/useUsageData.test.ts
git commit -m "feat: add useUsageData hook for fetching and filtering usage data

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Core Usage Components (Part 1)

**Goal:** Port SummaryCards, DailyChart, ActivityChart, and ModelsChart from CodeBurn.

**Files:**
- Create: `packages/dashboard/src/components/usage/SummaryCards.tsx`
- Create: `packages/dashboard/src/components/usage/DailyChart.tsx`
- Create: `packages/dashboard/src/components/usage/ActivityChart.tsx`
- Create: `packages/dashboard/src/components/usage/ModelsChart.tsx`

**Acceptance Criteria:**
- [ ] All 4 components render correctly with mock data
- [ ] Components use shadcn/ui Card components (not raw divs) for consistency with JiGit
- [ ] Recharts charts match CodeBurn's visual style but use Tailwind colors
- [ ] Components accept `data` prop and `period` prop where needed

**Verify:** `pnpm --filter @jigit/dashboard test` (component tests if any) → pass

**Steps:**

- [ ] **Step 1: Create SummaryCards**

```typescript
// packages/dashboard/src/components/usage/SummaryCards.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SummaryRow } from "@/api/client.js";
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  rows: SummaryRow[];
  period: Period;
}

export function SummaryCards({ rows, period }: Props) {
  const periodKey = period === "Today" ? "Today" : period === "7 Days" ? "7 Days" : "30 Days";
  const row = rows.find((r) => r.Period === periodKey);
  if (!row) return null;

  const avgPerSession = row.Sessions > 0 ? `$${(row["Cost (USD)"] / row.Sessions).toFixed(2)}` : "$0.00";

  const stats = [
    { label: "Total Cost", value: `$${row["Cost (USD)"].toFixed(2)}`, sub: `$${row["Saved (USD)"].toFixed(2)} saved` },
    { label: "API Calls", value: row["API Calls"].toLocaleString(), sub: `${row.Sessions} sessions` },
    { label: "Projects", value: String(row.Projects), sub: "active" },
    { label: "Avg / Session", value: avgPerSession, sub: `${row.Sessions} sessions` },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create DailyChart**

```typescript
// packages/dashboard/src/components/usage/DailyChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { DailyRow } from "@/api/client.js";
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  rows: DailyRow[];
  period: Period;
}

export function DailyChart({ rows, period }: Props) {
  const periodKey = period === "Today" ? "Today" : period === "7 Days" ? "7 Days" : "30 Days";
  const data = rows
    .filter((r) => r.Period === periodKey)
    .map((r) => ({ date: r.Date.slice(5), cost: r["Cost (USD)"] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Daily Spend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create ActivityChart**

```typescript
// packages/dashboard/src/components/usage/ActivityChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ActivityRow } from "@/api/client.js";
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  rows: ActivityRow[];
  period: Period;
}

export function ActivityChart({ rows, period }: Props) {
  const periodKey = period === "Today" ? "Today" : period === "7 Days" ? "7 Days" : "30 Days";
  const data = rows
    .filter((r) => r.Period === periodKey)
    .sort((a, b) => b["Cost (USD)"] - a["Cost (USD)"])
    .map((r) => ({ activity: r.Activity, cost: r["Cost (USD)"] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Activity Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="activity" width={110} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create ModelsChart**

```typescript
// packages/dashboard/src/components/usage/ModelsChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ModelRow } from "@/api/client.js";
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  rows: ModelRow[];
  period: Period;
}

export function ModelsChart({ rows, period }: Props) {
  const periodKey = period === "Today" ? "Today" : period === "7 Days" ? "7 Days" : "30 Days";
  const data = rows
    .filter((r) => r.Period === periodKey)
    .sort((a, b) => b["Cost (USD)"] - a["Cost (USD)"])
    .slice(0, 8)
    .map((r) => ({ model: r.Model, cost: r["Cost (USD)"] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Cost by Model</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="model" width={130} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="hsl(var(--secondary))" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/usage/SummaryCards.tsx packages/dashboard/src/components/usage/DailyChart.tsx packages/dashboard/src/components/usage/ActivityChart.tsx packages/dashboard/src/components/usage/ModelsChart.tsx
git commit -m "feat: port SummaryCards, DailyChart, ActivityChart, ModelsChart

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Core Usage Components (Part 2)

**Goal:** Port ProjectsChart, SessionsTable, ToolsChart, and ShellCommandsChart.

**Files:**
- Create: `packages/dashboard/src/components/usage/ProjectsChart.tsx`
- Create: `packages/dashboard/src/components/usage/SessionsTable.tsx`
- Create: `packages/dashboard/src/components/usage/ToolsChart.tsx`
- Create: `packages/dashboard/src/components/usage/ShellCommandsChart.tsx`

**Acceptance Criteria:**
- [ ] ProjectsChart shows top 10 projects by cost (horizontal bar)
- [ ] SessionsTable shows top 20 sessions with sortable columns
- [ ] ToolsChart shows top 10 tools by calls (horizontal bar)
- [ ] ShellCommandsChart shows top 10 commands by calls (horizontal bar)
- [ ] All use shadcn/ui Card and Table components

**Steps:**

- [ ] **Step 1: Create ProjectsChart**

```typescript
// packages/dashboard/src/components/usage/ProjectsChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ProjectRow } from "@/api/client.js";

interface Props {
  rows: ProjectRow[];
}

function shortName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function ProjectsChart({ rows }: Props) {
  const data = rows
    .slice()
    .sort((a, b) => b["Cost (USD)"] - a["Cost (USD)"])
    .slice(0, 10)
    .map((r) => ({ project: shortName(r.Project), cost: r["Cost (USD)"] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Top Projects (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="project" width={140} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
            />
            <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create SessionsTable**

```typescript
// packages/dashboard/src/components/usage/SessionsTable.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SessionRow } from "@/api/client.js";

interface Props {
  rows: SessionRow[];
}

function shortName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function SessionsTable({ rows }: Props) {
  const top20 = rows.slice().sort((a, b) => b["Cost (USD)"] - a["Cost (USD)"]).slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Top Sessions (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">API Calls</TableHead>
              <TableHead className="text-right">Turns</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top20.map((s) => (
              <TableRow key={s["Session ID"]}>
                <TableCell className="font-medium">{shortName(s.Project)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(s["Started At"]).toISOString().slice(0, 16).replace("T", " ")}
                </TableCell>
                <TableCell className="text-right font-mono">${s["Cost (USD)"].toFixed(2)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{s["API Calls"]}</TableCell>
                <TableCell className="text-right text-muted-foreground">{s.Turns}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create ToolsChart**

```typescript
// packages/dashboard/src/components/usage/ToolsChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ToolRow } from "@/api/client.js";

interface Props {
  rows: ToolRow[];
}

export function ToolsChart({ rows }: Props) {
  const data = rows.slice().sort((a, b) => b.Calls - a.Calls).slice(0, 10).map((r) => ({ tool: r.Tool, calls: r.Calls }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Tool Usage (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="tool" width={100} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [Number(value ?? 0).toLocaleString(), "Calls"]}
            />
            <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create ShellCommandsChart**

```typescript
// packages/dashboard/src/components/usage/ShellCommandsChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ShellCommandRow } from "@/api/client.js";

interface Props {
  rows: ShellCommandRow[];
}

export function ShellCommandsChart({ rows }: Props) {
  const data = rows.slice().sort((a, b) => b.Calls - a.Calls).slice(0, 10).map((r) => ({ command: r.Command, calls: r.Calls }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Shell Commands (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="command" width={80} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value) => [Number(value ?? 0).toLocaleString(), "Calls"]}
            />
            <Bar dataKey="calls" fill="hsl(var(--success))" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/usage/ProjectsChart.tsx packages/dashboard/src/components/usage/SessionsTable.tsx packages/dashboard/src/components/usage/ToolsChart.tsx packages/dashboard/src/components/usage/ShellCommandsChart.tsx
git commit -m "feat: port ProjectsChart, SessionsTable, ToolsChart, ShellCommandsChart

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: UserSelector and PeriodToggle

**Goal:** Create user selection pills and period toggle buttons.

**Files:**
- Create: `packages/dashboard/src/components/usage/UserSelector.tsx`
- Create: `packages/dashboard/src/components/usage/PeriodToggle.tsx`

**Acceptance Criteria:**
- [ ] UserSelector shows pill buttons for each user, highlights selected
- [ ] PeriodToggle shows Today/7 Days/30 Days buttons, highlights selected
- [ ] Both use Tailwind/shadcn styling consistent with dashboard
- [ ] PeriodToggle uses the Period type from useUsageData

**Steps:**

- [ ] **Step 1: Create UserSelector**

```typescript
// packages/dashboard/src/components/usage/UserSelector.tsx
import { Badge } from "@/components/ui/badge";

interface Props {
  users: string[];
  selected: string | null;
  onSelect: (username: string) => void;
}

export function UserSelector({ users, selected, onSelect }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</span>
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <button
            key={u}
            onClick={() => onSelect(u)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              selected === u
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PeriodToggle**

```typescript
// packages/dashboard/src/components/usage/PeriodToggle.tsx
import type { Period } from "@/hooks/useUsageData.js";

interface Props {
  selected: Period;
  onChange: (p: Period) => void;
}

const PERIODS: Period[] = ["Today", "7 Days", "30 Days"];

export function PeriodToggle({ selected, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-muted rounded-lg p-1">
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            selected === p
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/usage/UserSelector.tsx packages/dashboard/src/components/usage/PeriodToggle.tsx
git commit -m "feat: add UserSelector and PeriodToggle components

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Usage Page

**Goal:** Assemble the `/usage` page with all components, period filtering, and user selection.

**Files:**
- Create: `packages/dashboard/src/pages/Usage.tsx`
- Create: `packages/dashboard/src/pages/Usage.test.tsx`

**Acceptance Criteria:**
- [ ] Page fetches user list on mount
- [ ] URL query param `?u=` syncs with selected user
- [ ] Period toggle filters displayed data
- [ ] All chart components render with fetched data
- [ ] Empty state shown when no user selected or no data
- [ ] Test covers rendering and user selection

**Verify:** `pnpm --filter @jigit/dashboard test Usage.test.tsx` → pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `packages/dashboard/src/pages/Usage.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Usage } from "./Usage.js";

vi.stubGlobal("fetch", vi.fn());

describe("Usage page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders user selector and period toggle", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ id: "u1", username: "alice", createdAt: "2026-01-01", _count: { uploads: 1 } }],
    } as any);

    render(
      <MemoryRouter initialEntries={["/usage"]}>
        <Usage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("7 Days")).toBeInTheDocument();
    expect(screen.getByText("30 Days")).toBeInTheDocument();
  });
});
```

Run test (should fail):

```bash
pnpm --filter @jigit/dashboard test Usage.test.tsx
```

Expected: FAIL — Usage page doesn't exist.

- [ ] **Step 2: Implement the page**

Create `packages/dashboard/src/pages/Usage.tsx`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listUsageUsers, type UsageUser } from "@/api/client.js";
import { useUsageData, type Period } from "@/hooks/useUsageData.js";
import { UserSelector } from "@/components/usage/UserSelector.js";
import { PeriodToggle } from "@/components/usage/PeriodToggle.js";
import { SummaryCards } from "@/components/usage/SummaryCards.js";
import { DailyChart } from "@/components/usage/DailyChart.js";
import { ActivityChart } from "@/components/usage/ActivityChart.js";
import { ModelsChart } from "@/components/usage/ModelsChart.js";
import { ProjectsChart } from "@/components/usage/ProjectsChart.js";
import { SessionsTable } from "@/components/usage/SessionsTable.js";
import { ToolsChart } from "@/components/usage/ToolsChart.js";
import { ShellCommandsChart } from "@/components/usage/ShellCommandsChart.js";

export function Usage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UsageUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const selectedUser = searchParams.get("u") ?? null;
  const [period, setPeriod] = useState<Period>("30 Days");

  const { data, loading, error } = useUsageData(selectedUser, period);

  useEffect(() => {
    listUsageUsers()
      .then(setUsers)
      .catch((e: Error) => setUsersError(e.message))
      .finally(() => setUsersLoading(false));
  }, []);

  // Sync URL with selected user
  const handleSelectUser = useCallback(
    (username: string) => {
      setSearchParams({ u: username });
    },
    [setSearchParams]
  );

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const u = params.get("u");
      if (u !== selectedUser) {
        // Force re-render via searchParams state
        setSearchParams(params);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedUser, setSearchParams]);

  const usernames = users.map((u) => u.username);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">AI Usage</h2>
        <PeriodToggle selected={period} onChange={setPeriod} />
      </div>

      {usersLoading ? (
        <Skeleton className="h-8 w-64" />
      ) : usersError ? (
        <p className="text-sm text-destructive">{usersError}</p>
      ) : (
        <UserSelector users={usernames} selected={selectedUser} onSelect={handleSelectUser} />
      )}

      {!selectedUser && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select a user to view usage data.</p>
          </CardContent>
        </Card>
      )}

      {selectedUser && loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {selectedUser && error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {selectedUser && data && (
        <div className="space-y-4">
          <SummaryCards rows={data.summary} period={period} />

          <DailyChart rows={data.daily} period={period} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ActivityChart rows={data.activity} period={period} />
            <ModelsChart rows={data.models} period={period} />
          </div>

          <ProjectsChart rows={data.projects} />
          <SessionsTable rows={data.sessions} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ToolsChart rows={data.tools} />
            <ShellCommandsChart rows={data.shellCommands} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @jigit/dashboard test Usage.test.tsx
```

Expected: Tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/pages/Usage.tsx packages/dashboard/src/pages/Usage.test.tsx
git commit -m "feat: add Usage page with all components and URL sync

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Routes and Navigation

**Goal:** Add `/usage` route and sidebar nav item.

**Files:**
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/components/layout/AppShell.tsx`

**Acceptance Criteria:**
- [ ] `/usage` route renders Usage page
- [ ] Sidebar has "Usage" nav item with bar-chart icon
- [ ] Nav item highlights when on `/usage` route

**Verify:** `pnpm --filter @jigit/dashboard typecheck` → no errors

**Steps:**

- [ ] **Step 1: Add route**

Modify `packages/dashboard/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Overview } from "./pages/Overview";
import { Jobs } from "./pages/Jobs";
import { JobDetail } from "./pages/JobDetail";
import { Config } from "./pages/Config";
import { Approvals } from "./pages/Approvals";
import { McpServers } from "./pages/McpServers";
import { Usage } from "./pages/Usage";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/config" element={<Config />} />
          <Route path="/mcp-servers" element={<McpServers />} />
          <Route path="/approvals" element={<Approvals />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Add nav item**

Modify `packages/dashboard/src/components/layout/AppShell.tsx`:

```typescript
import { LayoutDashboard, Briefcase, Settings, CheckSquare, Plug, BarChart3 } from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/usage", label: "Usage", icon: BarChart3 },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/mcp-servers", label: "MCP Servers", icon: Plug },
  { to: "/config", label: "Config", icon: Settings },
];
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @jigit/dashboard typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/src/components/layout/AppShell.tsx
git commit -m "feat: add /usage route and sidebar navigation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Overview Widget

**Goal:** Add an AI Usage widget to the Overview page.

**Files:**
- Modify: `packages/dashboard/src/pages/Overview.tsx`

**Acceptance Criteria:**
- [ ] Widget shows top 3 users by total cost (last 30 days)
- [ ] Shows mini bar chart of daily spend for first user
- [ ] Has link to `/usage` page
- [ ] Uses existing StatCard component pattern

**Steps:**

- [ ] **Step 1: Add state and fetch logic**

Add to `packages/dashboard/src/pages/Overview.tsx` (in the component, after existing state):

```typescript
  const [usageUsers, setUsageUsers] = useState<UsageUser[] | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);

  useEffect(() => {
    listUsageUsers()
      .then(async (users) => {
        setUsageUsers(users);
        if (users.length > 0) {
          const latest = await getLatestUpload(users[0].username);
          if ("data" in latest && latest.data !== null) {
            setUsageData((latest as any).data);
          }
        }
      })
      .catch(() => {}); // Silently fail — usage is optional
  }, []);
```

- [ ] **Step 2: Add imports**

Add to imports at top of `Overview.tsx`:

```typescript
import { BarChart3 } from "lucide-react";
import { listUsageUsers, getLatestUpload, type UsageUser, type UsageData } from "@/api/client.js";
import { Link } from "react-router-dom";
```

- [ ] **Step 3: Add widget JSX**

Add after the "Recent Activity" card (at the end of the page):

```tsx
      {/* AI Usage Widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">AI Usage</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/usage">View details</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {usageUsers === null ? (
            <Skeleton className="h-8 w-full" />
          ) : usageUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No usage data uploaded yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-4">
                {usageUsers.slice(0, 3).map((u) => (
                  <div key={u.id} className="flex-1">
                    <div className="text-sm font-medium">{u.username}</div>
                    <div className="text-xs text-muted-foreground">{u._count.uploads} uploads</div>
                  </div>
                ))}
              </div>
              {usageData && usageData.daily.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart
                    data={usageData.daily
                      .filter((r) => r.Period === "30 Days")
                      .map((r) => ({ date: r.Date.slice(5), cost: r["Cost (USD)"] }))}
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
                    />
                    <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @jigit/dashboard typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/Overview.tsx
git commit -m "feat: add AI Usage widget to Overview page

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Dashboard Tests

**Goal:** Write tests for the new dashboard functionality.

**Files:**
- Create: `packages/dashboard/src/pages/Usage.test.tsx` (already created in Task 6, expand)
- Create: `packages/dashboard/src/components/usage/SummaryCards.test.tsx`

**Acceptance Criteria:**
- [ ] Usage page test covers user selection, period change, and data display
- [ ] SummaryCards test renders with mock data
- [ ] All dashboard tests pass

**Verify:** `pnpm --filter @jigit/dashboard test` → all pass

**Steps:**

- [ ] **Step 1: Expand Usage page test**

Replace `Usage.test.tsx` with expanded tests:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Usage } from "./Usage.js";

vi.stubGlobal("fetch", vi.fn());

const mockUsers = [{ id: "u1", username: "alice", createdAt: "2026-01-01", _count: { uploads: 1 } }];

const mockUpload = {
  id: "up1",
  userId: "u1",
  uploadedAt: "2026-06-20T00:00:00Z",
  period: "30days",
  data: {
    summary: [{ Period: "30 Days", "Cost (USD)": 100, "Saved (USD)": 0, "API Calls": 50, Sessions: 10, Projects: 3 }],
    daily: [{ Period: "30 Days", Date: "2026-06-20", "Cost (USD)": 10, "Saved (USD)": 0, "API Calls": 5, Sessions: 1, "Input Tokens": 1000, "Output Tokens": 500, "Cache Read Tokens": 0, "Cache Write Tokens": 0 }],
    activity: [],
    models: [],
    projects: [],
    sessions: [],
    tools: [],
    shellCommands: [],
  },
};

describe("Usage page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders user selector and period toggle", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => mockUsers } as any);
    render(<MemoryRouter initialEntries={["/usage"]}><Usage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("30 Days")).toBeInTheDocument();
  });

  it("selects user and shows data", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => mockUsers } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => mockUpload } as any);

    render(<MemoryRouter initialEntries={["/usage"]}><Usage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    fireEvent.click(screen.getByText("alice"));
    await waitFor(() => expect(screen.getByText("Total Cost")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Create SummaryCards test**

Create `packages/dashboard/src/components/usage/SummaryCards.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryCards } from "./SummaryCards.js";

describe("SummaryCards", () => {
  it("renders stats for matching period", () => {
    render(
      <SummaryCards
        rows={[{ Period: "30 Days", "Cost (USD)": 100, "Saved (USD)": 0, "API Calls": 50, Sessions: 10, Projects: 3 }]}
        period="30 Days"
      />
    );
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("returns null when no matching period", () => {
    const { container } = render(
      <SummaryCards
        rows={[{ Period: "7 Days", "Cost (USD)": 50, "Saved (USD)": 0, "API Calls": 25, Sessions: 5, Projects: 2 }]}
        period="30 Days"
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 3: Run all dashboard tests**

```bash
pnpm --filter @jigit/dashboard test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/pages/Usage.test.tsx packages/dashboard/src/components/usage/SummaryCards.test.tsx
git commit -m "test: add dashboard tests for Usage page and SummaryCards

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2 Completion Checklist

- [ ] API client functions added and tested
- [ ] useUsageData hook created and tested
- [ ] All 8 chart/table components ported
- [ ] UserSelector and PeriodToggle created
- [ ] Usage page assembled with URL sync
- [ ] `/usage` route and nav item added
- [ ] Overview widget added
- [ ] All dashboard tests passing
- [ ] Dashboard builds successfully
