# Phase 6 — Dashboard Frontend

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.

**Goal:** A polished, production-quality React dashboard (`packages/dashboard`)
that is a genuine user interface — not a scaffold. Every page must be built with
real shadcn/ui components and TailwindCSS. The dashboard lets operators monitor
running jobs, approve pending permissions, and control (stop/pause/resume) in-flight agents.

**Prerequisites:** Phase 3 (API) complete; NestJS API running on `:3000`.

**Reference spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md` §7

---

## ⚠️ UI Non-Negotiable Rules

These rules apply to **every file in `packages/dashboard/src/`**. Violations block
the phase from being marked done.

1. **shadcn/ui components only** — use `Button`, `Badge`, `Card`, `Table`,
   `Dialog`, `Tabs`, `Skeleton`, `Alert`, `Tooltip`, `ScrollArea`, `Separator`
   from shadcn/ui. Never write raw `<button>`, `<table>`, `<div class="modal">`.
   Primitive HTML elements (`<span>`, `<p>`, `<h1>`, `<li>`) are fine inside
   shadcn containers.

2. **TailwindCSS only** — all spacing, colour, layout, and typography must use
   Tailwind utility classes. No inline `style={}` props except for dynamic values
   that Tailwind cannot express (e.g. a chart's exact pixel height). No CSS
   modules, no `styled-components`.

3. **Dark mode aware** — use `dark:` variants wherever you use light-mode colours.
   The root layout must include `class="dark"` or a theme toggle. All shadcn/ui
   components are dark-mode-ready; don't override their internal colours.

4. **Semantic colour tokens** — use shadcn's CSS variable tokens
   (`bg-background`, `text-foreground`, `border`, `muted`, `muted-foreground`,
   `primary`, `destructive`) rather than raw Tailwind colour names (`bg-gray-100`).
   This keeps the app themeable.

5. **Status colours via `Badge` variants** — job status must be shown as a
   coloured `Badge`. Define a `statusVariant` map:
   ```ts
   const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
     queued: "secondary", cloning: "secondary", running: "default",
     awaiting_approval: "outline", pushing: "default", opening_mr: "default",
     reporting: "default", done: "secondary", paused: "outline",
     stopped: "destructive", failed: "destructive",
   };
   ```

6. **Loading states** — every data-fetching component must show `<Skeleton>`
   blocks while loading, not a blank page or a spinner-only div.

7. **Empty states** — every list/table must have an explicit empty state
   (`<div className="... text-muted-foreground">No jobs yet.</div>`).

8. **Error states** — every query must handle errors with an `<Alert variant="destructive">`.

9. **Accessible** — use correct ARIA roles and `aria-label` on icon-only buttons.
   shadcn/ui components handle most of this automatically; don't break it.

10. **No placeholder text in production** — "Lorem ipsum", "TODO", "coming soon"
    are not allowed. Every section must have real content or a real mock.

---

## Page designs

### Overview (mock metrics)
- `<Card>` grid: 4 stat cards (Active jobs, Done today, Avg token cost, Approval queue).
- `<Recharts LineChart>` for job throughput over the last 7 days (mock data).
- `<Recharts PieChart>` for jobs by status (mock data).
- A "Recent Activity" feed showing the last 10 events across all jobs.
- All charts must have a visible "Mock data — Phase 2 ingestion pending" notice
  rendered as a `<Badge variant="outline">`.

### Jobs list
- `<Table>` with columns: Status, Issue Key, Branch, MR URL, Created, Actions.
- Status column uses `statusVariant` `<Badge>`.
- MR URL is a `<a>` inside a `<Button variant="link">`.
- Actions: Stop / Pause / Resume buttons (disabled based on current status).
- Rows link to Job Detail on click.
- Empty state: "No jobs have been created yet."

### Job Detail
- `<Tabs>` with three tabs: **Timeline**, **Events**, **Raw**.
- **Timeline tab**: vertical step list using `<Card>` + icons, one card per `JobStep`.
  Each card shows step name, status badge, started/finished time, and detail JSON
  (collapsible with `<Accordion>`).
- **Events tab**: `<ScrollArea className="h-96">` containing an event log rendered
  as a list of rows with timestamp, level badge, type, and message.
  New events prepend in real-time via SSE (`EventSource`).
- **Raw tab**: `<pre>` inside a `<ScrollArea>` showing the full job JSON.
- **Sidebar** (sticky): job metadata (issue key, branch, MR link, token/cost),
  control buttons (Stop/Pause/Resume), and a section for **Pending Approvals**.
  Each pending approval renders as a `<Card>` with the tool name, prompt, and
  `<Button>` for each option. Clicking calls `POST /approvals/:id/decide`.

### Config (read-only)
- Three sections: Agent Templates, Repo Mappings, Credentials.
- Each section is a `<Card>` containing a `<Table>`.
- Credentials table: show id, kind, name, meta — never show secrets.
- A top-level `<Alert>` explaining "This view is read-only; edit via seed script."

---

## Module layout

```
packages/dashboard/src/
├── main.tsx
├── App.tsx                    # Router setup (react-router-dom v6)
├── index.css                  # Tailwind directives
├── lib/
│   └── utils.ts               # cn() from shadcn
├── api/
│   └── client.ts              # fetch wrappers + useSSE hook
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx       # sidebar nav + header
│   │   └── ThemeProvider.tsx  # dark mode context
│   ├── JobStatusBadge.tsx     # Badge with statusVariant map
│   ├── StatCard.tsx           # Metric card (icon + value + label)
│   ├── ApprovalCard.tsx       # Pending approval with action buttons
│   └── EventRow.tsx           # Single event log row
└── pages/
    ├── Overview.tsx
    ├── Jobs.tsx
    ├── JobDetail.tsx
    └── Config.tsx
```

---

## Acceptance Criteria

- [ ] `pnpm --filter @jigit/dashboard build` produces static assets in `dist/`.
- [ ] `pnpm --filter @jigit/dashboard test` passes.
- [ ] All shadcn/ui rules above are followed (reviewer will check randomly selected files).
- [ ] `GET /jobs` data populates the Jobs table; empty state shows when array is empty.
- [ ] Job Detail shows live SSE events appending in real time.
- [ ] Approve/Reject on a pending approval calls `POST /approvals/:id/decide`.
- [ ] Stop/Pause/Resume call the correct control endpoints.
- [ ] Overview page renders charts (mock data) with the "Mock data" badge.
- [ ] Config page shows agent templates and redacted credentials.
- [ ] No TypeScript errors.

---

## Steps

### Step 1 — Scaffold Vite + React + TailwindCSS

- [ ] In `packages/dashboard`:
```bash
cd packages/dashboard
pnpm add react react-dom react-router-dom
pnpm add -D @types/react @types/react-dom
pnpm add -D vite @vitejs/plugin-react
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
pnpm add recharts
pnpm add -D @types/recharts
```

- [ ] Configure `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

- [ ] Create `src/index.css` with Tailwind directives + shadcn CSS variables:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}
@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

---

### Step 2 — Install shadcn/ui

- [ ] Install shadcn/ui components:
```bash
cd packages/dashboard
pnpm add class-variance-authority clsx tailwind-merge tailwindcss-animate
pnpm add lucide-react
```

- [ ] Create `src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] Install shadcn/ui components (copy from shadcn/ui source or use CLI):
  ```
  components/ui/button.tsx
  components/ui/badge.tsx
  components/ui/card.tsx
  components/ui/table.tsx
  components/ui/dialog.tsx
  components/ui/tabs.tsx
  components/ui/skeleton.tsx
  components/ui/alert.tsx
  components/ui/tooltip.tsx
  components/ui/scroll-area.tsx
  components/ui/separator.tsx
  components/ui/accordion.tsx
  ```

  Use `npx shadcn@latest add button badge card table dialog tabs skeleton alert tooltip scroll-area separator accordion` if the CLI is available, otherwise copy the component source from https://ui.shadcn.com/docs/components.

---

### Step 3 — API client + useSSE hook (TDD)

- [ ] **Write failing test** — `packages/dashboard/src/api/client.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

global.fetch = vi.fn();

import { listJobs, getJob, controlJob, decideApproval } from "./client.js";

describe("API client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listJobs calls GET /jobs", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
    await listJobs();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/jobs");
  });

  it("getJob calls GET /jobs/:id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ id: "j1" }) } as any);
    const job = await getJob("j1");
    expect(job.id).toBe("j1");
  });

  it("controlJob calls POST /jobs/:id/:action", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await controlJob("j1", "stop");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/jobs/j1/stop", expect.objectContaining({ method: "POST" }));
  });

  it("decideApproval calls POST /approvals/:id/decide", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    await decideApproval("a1", "allow");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/approvals/a1/decide",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ optionId: "allow" }) })
    );
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Create `packages/dashboard/src/api/client.ts`:
```ts
const BASE = "";  // same origin; vite proxy handles /jobs → http://localhost:3000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init);
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

import { useState, useEffect } from "react";

export function useSSE<T>(jobId: string) {
  const [events, setEvents] = useState<T[]>([]);

  useEffect(() => {
    const es = new EventSource(`/jobs/${jobId}/stream`);
    es.onmessage = (e) => {
      try { setEvents((prev) => [...prev, JSON.parse(e.data) as T]); } catch { /* ignore */ }
    };
    return () => es.close();
  }, [jobId]);

  return events;
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 4 — Shared components

- [ ] Create `packages/dashboard/src/components/JobStatusBadge.tsx`:
```tsx
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary", cloning: "secondary", running: "default",
  awaiting_approval: "outline", pushing: "default", opening_mr: "default",
  reporting: "default", done: "secondary", paused: "outline",
  stopped: "destructive", failed: "destructive",
};

export function JobStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>{status.replace("_", " ")}</Badge>;
}
```

- [ ] Create `packages/dashboard/src/components/StatCard.tsx`:
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
}

export function StatCard({ title, value, icon: Icon, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] Create `packages/dashboard/src/components/ApprovalCard.tsx`:
```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Approval } from "@/api/client";
import { decideApproval } from "@/api/client";

interface ApprovalCardProps {
  approval: Approval;
  onResolved: () => void;
}

export function ApprovalCard({ approval, onResolved }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (optionId: string) => {
    setLoading(true);
    setError(null);
    try {
      await decideApproval(approval.id, optionId);
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-orange-500 dark:border-orange-400">
      <CardHeader>
        <CardTitle className="text-sm">⚠️ Approval Required</CardTitle>
        <CardDescription>{approval.kind}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{approval.prompt}</p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2 flex-wrap">
          {approval.options.map((opt) => (
            <Button
              key={opt.optionId}
              size="sm"
              variant={opt.optionId.includes("deny") ? "destructive" : "default"}
              disabled={loading}
              onClick={() => decide(opt.optionId)}
              aria-label={`${opt.name} this approval request`}
            >
              {opt.name}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] Create `packages/dashboard/src/components/EventRow.tsx`:
```tsx
import { Badge } from "@/components/ui/badge";
import type { JobEvent } from "@/api/client";

const LEVEL_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary", warn: "outline", error: "destructive",
};

export function EventRow({ event }: { event: JobEvent }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground whitespace-nowrap w-[5.5rem] shrink-0 pt-0.5">
        {new Date(event.ts).toLocaleTimeString()}
      </span>
      <Badge variant={LEVEL_VARIANT[event.level] ?? "secondary"} className="shrink-0 text-xs">
        {event.level}
      </Badge>
      <span className="font-mono text-xs text-muted-foreground shrink-0 w-32">{event.type}</span>
      <span className="text-foreground break-all">{event.message}</span>
    </div>
  );
}
```

---

### Step 5 — App shell + router

- [ ] Create `packages/dashboard/src/components/layout/AppShell.tsx`:
```tsx
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, Briefcase, Settings } from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/config", label: "Config", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">JiGit</h1>
          <p className="text-xs text-muted-foreground">AI Coding Orchestrator</p>
        </div>
        <Separator />
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-current={pathname === to ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-screen-xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] Create `packages/dashboard/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Overview } from "./pages/Overview";
import { Jobs } from "./pages/Jobs";
import { JobDetail } from "./pages/JobDetail";
import { Config } from "./pages/Config";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/config" element={<Config />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
```

- [ ] Create `packages/dashboard/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

- [ ] Create `packages/dashboard/index.html`:
```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JiGit Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### Step 6 — Page implementations

#### Overview page

- [ ] Create `packages/dashboard/src/pages/Overview.tsx`:
```tsx
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Activity, CheckCircle, DollarSign, Clock } from "lucide-react";

// ── Mock data (Phase 2 will replace with real ingestion) ──────────────────────
const THROUGHPUT = [
  { day: "Mon", jobs: 2 }, { day: "Tue", jobs: 5 }, { day: "Wed", jobs: 3 },
  { day: "Thu", jobs: 7 }, { day: "Fri", jobs: 4 }, { day: "Sat", jobs: 1 }, { day: "Sun", jobs: 6 },
];
const STATUS_DIST = [
  { name: "Done", value: 18, color: "#22c55e" },
  { name: "Running", value: 3, color: "#3b82f6" },
  { name: "Failed", value: 2, color: "#ef4444" },
  { name: "Paused", value: 1, color: "#f59e0b" },
];
const RECENT_EVENTS = [
  { id: "1", ts: new Date().toISOString(), message: "Job JIGIT-42 reached done", level: "info" },
  { id: "2", ts: new Date(Date.now() - 60_000).toISOString(), message: "Approval requested for bash tool", level: "warn" },
  { id: "3", ts: new Date(Date.now() - 120_000).toISOString(), message: "Job JIGIT-41 failed: git push rejected", level: "error" },
];
// ─────────────────────────────────────────────────────────────────────────────

export function Overview() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Overview</h2>
        <Badge variant="outline">Mock data — Phase 2 ingestion pending</Badge>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Jobs" value={3} icon={Activity} description="Currently running" />
        <StatCard title="Done Today" value={18} icon={CheckCircle} description="+4 from yesterday" />
        <StatCard title="Avg Token Cost" value="$0.07" icon={DollarSign} description="Per job this week" />
        <StatCard title="Approval Queue" value={1} icon={Clock} description="Awaiting human action" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Job Throughput (last 7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={THROUGHPUT}>
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="jobs" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={STATUS_DIST} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                  {STATUS_DIST.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-2 text-sm">
              {STATUS_DIST.map((s) => (
                <li key={s.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-semibold ml-auto">{s.value}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {RECENT_EVENTS.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0 text-sm">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
              <Badge variant={e.level === "error" ? "destructive" : e.level === "warn" ? "outline" : "secondary"}
                className="text-xs shrink-0">
                {e.level}
              </Badge>
              <span>{e.message}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Jobs list page

- [ ] Create `packages/dashboard/src/pages/Jobs.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listJobs, controlJob, type Job } from "@/api/client";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

export function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlling, setControlling] = useState<string | null>(null);

  useEffect(() => {
    listJobs().then(setJobs).catch((e) => setError(e.message));
  }, []);

  const control = async (jobId: string, action: "stop" | "pause" | "resume") => {
    setControlling(jobId);
    try { await controlJob(jobId, action); }
    catch (e) { setError((e as Error).message); }
    finally { setControlling(null); }
  };

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Jobs</h2>
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>MR</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs === null ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  No jobs have been created yet.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50"
                  onClick={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; }}>
                  <TableCell><JobStatusBadge status={job.status} /></TableCell>
                  <TableCell>
                    <Link to={`/jobs/${job.id}`} className="text-primary hover:underline font-mono text-sm">
                      {job.jiraIssueKey ?? job.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {job.branch ?? "—"}
                  </TableCell>
                  <TableCell>
                    {job.mrUrl ? (
                      <Button variant="link" size="sm" asChild className="h-auto p-0">
                        <a href={job.mrUrl} target="_blank" rel="noreferrer"
                          aria-label="Open merge request">
                          MR <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {job.status === "running" && (
                        <>
                          <Button size="sm" variant="outline" disabled={controlling === job.id}
                            onClick={() => control(job.id, "pause")}>Pause</Button>
                          <Button size="sm" variant="destructive" disabled={controlling === job.id}
                            onClick={() => control(job.id, "stop")}>Stop</Button>
                        </>
                      )}
                      {job.status === "paused" && (
                        <Button size="sm" disabled={controlling === job.id}
                          onClick={() => control(job.id, "resume")}>Resume</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

#### Job Detail page

- [ ] Create `packages/dashboard/src/pages/JobDetail.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getJob, controlJob, useSSE, type JobDetail as JobDetailType, type JobEvent } from "@/api/client";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EventRow } from "@/components/EventRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, Circle, XCircle, Loader2, ExternalLink } from "lucide-react";

const STEP_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  running: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
};

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlling, setControlling] = useState(false);
  const liveEvents = useSSE<{ type: string; event?: JobEvent }>(id!);

  useEffect(() => {
    getJob(id!).then(setJob).catch((e) => setError(e.message));
  }, [id]);

  const control = async (action: "stop" | "pause" | "resume") => {
    setControlling(true);
    try { await controlJob(id!, action); }
    catch (e) { setError((e as Error).message); }
    finally { setControlling(false); }
  };

  const allEvents: JobEvent[] = [
    ...(job?.events ?? []),
    ...liveEvents.flatMap((e) => (e.event ? [e.event] : [])),
  ];

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;

  if (!job) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold font-mono">{job.jiraIssueKey ?? job.id}</h2>
        <JobStatusBadge status={job.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Timeline + Events */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="events">Events ({allEvents.length})</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="space-y-3 mt-4">
              {job.steps.length === 0
                ? <p className="text-muted-foreground text-sm">No steps recorded yet.</p>
                : job.steps.map((step) => (
                  <Card key={step.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {STEP_ICON[step.status] ?? STEP_ICON.pending}
                        {step.name}
                        <Badge variant="outline" className="ml-auto text-xs">{step.status}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground space-y-1">
                      {step.startedAt && <div>Started: {new Date(step.startedAt).toLocaleTimeString()}</div>}
                      {step.finishedAt && <div>Finished: {new Date(step.finishedAt).toLocaleTimeString()}</div>}
                      {Object.keys(step.detail).length > 0 && (
                        <Accordion type="single" collapsible>
                          <AccordionItem value="detail" className="border-0">
                            <AccordionTrigger className="text-xs py-1">Detail</AccordionTrigger>
                            <AccordionContent>
                              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                                {JSON.stringify(step.detail, null, 2)}
                              </pre>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </TabsContent>

            <TabsContent value="events" className="mt-4">
              <Card>
                <ScrollArea className="h-96">
                  <div className="p-3">
                    {allEvents.length === 0
                      ? <p className="text-muted-foreground text-sm text-center py-8">No events yet.</p>
                      : allEvents.map((e) => <EventRow key={e.id} event={e} />)}
                  </div>
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              <Card>
                <ScrollArea className="h-96">
                  <pre className="text-xs p-4 font-mono">{JSON.stringify(job, null, 2)}</pre>
                </ScrollArea>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Metadata */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Job Info</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch</span>
                <span className="font-mono text-xs truncate max-w-[9rem]">{job.branch ?? "—"}</span>
              </div>
              {job.mrUrl && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">MR</span>
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <a href={job.mrUrl} target="_blank" rel="noreferrer">
                      View MR <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tokens</span>
                <span>{job.tokensUsed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span>${job.costUsd.toFixed(4)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-xs">{new Date(job.createdAt).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Controls</CardTitle></CardHeader>
            <CardContent className="flex gap-2 flex-wrap">
              {job.status === "running" && <>
                <Button size="sm" variant="outline" disabled={controlling}
                  onClick={() => control("pause")}>Pause</Button>
                <Button size="sm" variant="destructive" disabled={controlling}
                  onClick={() => control("stop")}>Stop</Button>
              </>}
              {job.status === "paused" && (
                <Button size="sm" disabled={controlling}
                  onClick={() => control("resume")}>Resume</Button>
              )}
              {["done", "stopped", "failed"].includes(job.status) && (
                <p className="text-xs text-muted-foreground">No controls available.</p>
              )}
            </CardContent>
          </Card>

          {/* Pending approvals */}
          {job.approvals.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Pending Approvals</h3>
              {job.approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onResolved={() => getJob(id!).then(setJob).catch(console.error)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

#### Config page

- [ ] Create `packages/dashboard/src/pages/Config.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";

interface AgentTemplate { id: string; name: string; model: string; maxConcurrent: number; }
interface Credential { id: string; kind: string; name: string; meta: Record<string, string>; }
interface RepoMapping { id: string; jiraProjectKey: string; gitlabProjectId: string;
  defaultBaseBranch: string; agentTemplate: { id: string; name: string }; }

export function Config() {
  const [templates, setTemplates] = useState<AgentTemplate[] | null>(null);
  const [credentials, setCredentials] = useState<Credential[] | null>(null);
  const [mappings, setMappings] = useState<RepoMapping[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/agent-templates").then(r => r.json()),
      fetch("/credentials").then(r => r.json()),
      fetch("/repo-mappings").then(r => r.json()),
    ]).then(([t, c, m]) => { setTemplates(t); setCredentials(c); setMappings(m); })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Config</h2>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This view is read-only. Edit configuration via the <code>pnpm seed</code> script.
          Secrets are redacted.
        </AlertDescription>
      </Alert>

      {/* Agent Templates */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Agent Templates</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Max Concurrent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates === null ? (
                Array.from({ length: 2 }).map((_, i) =>
                  <TableRow key={i}>{Array.from({ length: 3 }).map((__, j) =>
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>)
              ) : templates.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  No agent templates. Run <code>pnpm seed</code>.</TableCell></TableRow>
              ) : templates.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><Badge variant="outline">{t.model}</Badge></TableCell>
                  <TableCell>{t.maxConcurrent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Credentials</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials === null ? (
                Array.from({ length: 3 }).map((_, i) =>
                  <TableRow key={i}>{Array.from({ length: 3 }).map((__, j) =>
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>)
              ) : credentials.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                  No credentials. Run <code>pnpm seed</code>.</TableCell></TableRow>
              ) : credentials.map(c => (
                <TableRow key={c.id}>
                  <TableCell><Badge>{c.kind}</Badge></TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                    {JSON.stringify(c.meta)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Repo Mappings */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Repo Mappings</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jira Project</TableHead>
                <TableHead>GitLab Project ID</TableHead>
                <TableHead>Base Branch</TableHead>
                <TableHead>Agent Template</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings === null ? (
                Array.from({ length: 2 }).map((_, i) =>
                  <TableRow key={i}>{Array.from({ length: 4 }).map((__, j) =>
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>)}</TableRow>)
              ) : mappings.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  No repo mappings. Run <code>pnpm seed</code>.</TableCell></TableRow>
              ) : mappings.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono">{m.jiraProjectKey}</TableCell>
                  <TableCell className="font-mono text-xs">{m.gitlabProjectId}</TableCell>
                  <TableCell><Badge variant="secondary">{m.defaultBaseBranch}</Badge></TableCell>
                  <TableCell>{m.agentTemplate.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### Step 7 — Vite config (with API proxy)

- [ ] Create `packages/dashboard/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/jobs": "http://localhost:3000",
      "/webhooks": "http://localhost:3000",
      "/approvals": "http://localhost:3000",
      "/agent-templates": "http://localhost:3000",
      "/credentials": "http://localhost:3000",
      "/repo-mappings": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

---

### Step 8 — Build + test

- [ ] Run:
```bash
pnpm --filter @jigit/dashboard test
pnpm --filter @jigit/dashboard build
```

The build must produce `packages/dashboard/dist/`. Fix any errors before committing.

---

### Step 9 — Commit

- [ ] Stage and commit:
```bash
git add packages/dashboard/
git commit -m "feat(dashboard): React + shadcn/ui + Tailwind dashboard with jobs, detail, overview, config

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
