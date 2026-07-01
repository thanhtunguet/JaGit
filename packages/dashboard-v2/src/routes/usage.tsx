import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Activity,
  BarChart3,
  Clock,
  Coins,
  Cpu,
  FileText,
  Layers,
  Search,
  Sparkles,
  Terminal,
  User,
  Users,
  Wrench,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTokens, formatBaseTokens } from "@/lib/utils";
import {
  useAgentSessions,
  useAgentSessionAggregate,
  useAgentSession,
  useUsageUsers,
  useUsageData,
  useHistoricalOverview,
} from "@/hooks/use-api";
import type { AgentSessionRow, AgentSessionTool } from "@/lib/api";

export const Route = createFileRoute("/usage")({
  head: () => ({
    meta: [
      { title: "Usage · JiGit" },
      { name: "description", content: "AI telemetry, live sessions, and historical CodeBurn analytics." },
    ],
  }),
  component: UsagePage,
});

const PIE_COLORS = [
  "var(--teal)",
  "var(--amber)",
  "var(--moss)",
  "var(--brick)",
  "#8B92A3",
  "#6A86C0",
  "#B07FB0",
  "#C0A464",
];

const fmtNum = formatTokens;
const fmtCost = (n: number | null | undefined) =>
  n == null ? "—" : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

const fmtDur = (msOrSec: number | null | undefined, isMs = false) => {
  if (msOrSec == null) return "—";
  const s = isMs ? Math.round(msOrSec / 1000) : Math.round(msOrSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

function UsagePage() {
  const [activeTab, setActiveTab] = useState<"live" | "historical">("live");

  return (
    <AppShell>
      <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mono text-[11px] text-muted-foreground uppercase tracking-wider">
              Telemetry
            </div>
            <h1 className="text-2xl font-semibold mt-1">AI Usage</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live agent session telemetry and historical CodeBurn usage analytics.
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "live" | "historical")}
          >
            <TabsList className="bg-surface border border-hairline p-1">
              <TabsTrigger value="live" className="gap-2 text-xs mono">
                <Sparkles className="h-3.5 w-3.5 text-teal" />
                Live Sessions
              </TabsTrigger>
              <TabsTrigger value="historical" className="gap-2 text-xs mono">
                <BarChart3 className="h-3.5 w-3.5 text-amber" />
                Historical (CodeBurn)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </header>

        {activeTab === "live" ? <LiveSessionsView /> : <HistoricalCodeBurnView />}
      </div>
    </AppShell>
  );
}

// ─── Live Sessions Tab ────────────────────────────────────────────────────────

function LiveSessionsView() {
  const [userFilter, setUserFilter] = useState<string>("all");
  const [toolFilter, setToolFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data: usersData = [] } = useUsageUsers();
  const usernames = useMemo(() => usersData.map((u) => u.username), [usersData]);

  const queryFilters = useMemo(
    () => ({
      tool: toolFilter === "all" ? undefined : (toolFilter as AgentSessionTool),
      username: userFilter === "all" ? undefined : userFilter,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [toolFilter, userFilter, page, pageSize]
  );

  const { data: aggData, isLoading: aggLoading } = useAgentSessionAggregate({
    tool: queryFilters.tool,
    username: queryFilters.username,
  });

  const { data: listData, isLoading: listLoading } = useAgentSessions(queryFilters);

  const rows = listData?.rows ?? [];
  const totalRows = listData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const filteredRows = useMemo(() => {
    if (!q.trim()) return rows;
    const query = q.toLowerCase();
    return rows.filter(
      (s) =>
        s.id.toLowerCase().includes(query) ||
        s.sessionId.toLowerCase().includes(query) ||
        (s.user?.username || "").toLowerCase().includes(query) ||
        s.model.toLowerCase().includes(query)
    );
  }, [rows, q]);

  const byUser = useMemo(
    () =>
      (aggData?.byUser || []).map((u) => ({
        name: u.username,
        value: u.costUsd || 1,
        cost: u.costUsd,
      })),
    [aggData]
  );

  const byModel = useMemo(
    () =>
      (aggData?.byModel || []).map((m) => ({
        name: m.model,
        value: m.costUsd || 1,
        cost: m.costUsd,
      })),
    [aggData]
  );

  const byTool = useMemo(
    () =>
      (aggData?.byTool || []).map((t) => ({
        name: t.tool,
        value: t.costUsd || 1,
        cost: t.costUsd,
      })),
    [aggData]
  );

  function resetFilters() {
    setUserFilter("all");
    setToolFilter("all");
    setQ("");
    setPage(1);
  }

  return (
    <div className="space-y-8">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-lg border border-hairline">
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="User"
            value={userFilter}
            onChange={(v) => {
              setUserFilter(v);
              setPage(1);
            }}
            options={usernames}
          />
          <FilterSelect
            label="Tool"
            value={toolFilter}
            onChange={(v) => {
              setToolFilter(v);
              setPage(1);
            }}
            options={["claude-code", "codex", "copilot"]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="mono text-[11px] h-8"
          >
            reset
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search session id or user…"
            className="pl-8 h-8 w-64 mono text-xs bg-background"
          />
        </div>
      </div>

      {/* KPI row */}
      {aggLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi
            label="Total spend"
            value={fmtCost(aggData?.totalCostUsd || 0)}
            accent="amber"
            sub={`${totalRows} sessions recorded`}
          />
          <Kpi
            label="Base Tokens (BT)"
            value={aggData?.baseTokens?.total ? fmtNum(aggData.baseTokens.total) + " BT" : "—"}
            accent="teal"
            sub="normalized haiku cost"
          />
          <Kpi
            label="Input tokens"
            value={fmtNum(aggData?.totalTokens?.newInput || 0)}
          />
          <Kpi
            label="Cached input"
            value={fmtNum(aggData?.totalTokens?.cachedInput || 0)}
            accent="teal"
          />
          <Kpi
            label="Output tokens"
            value={fmtNum(aggData?.totalTokens?.output || 0)}
          />
        </section>
      )}

      {/* Pies Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PieCard title="Spend by user" data={byUser} />
        <PieCard title="Spend by model" data={byModel} />
        <PieCard title="Spend by tool" data={byTool} />
      </section>

      {/* Sessions table */}
      <section>
        <Panel
          title="Live AI Sessions"
          subtitle={`${totalRows} matching sessions`}
        >
          {listLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-hairline">
                    <TableHead>User</TableHead>
                    <TableHead>AI Tool</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Started At</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Cached</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">BT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((s) => {
                    const uName = s.user?.username || "unknown";
                    const durMs =
                      s.durationMs ??
                      new Date(s.lastUpdatedAt).getTime() - new Date(s.startedAt).getTime();
                    return (
                      <TableRow
                        key={s.id}
                        className="border-hairline cursor-pointer hover:bg-surface-2 transition-colors"
                        onClick={() => setSelectedSessionId(s.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar name={uName} />
                            <span className="text-sm font-medium">{uName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm mono text-xs">{s.tool}</TableCell>
                        <TableCell>
                          <span className="mono text-[11px] px-1.5 py-0.5 rounded bg-surface-2 border border-hairline">
                            {s.model}
                          </span>
                        </TableCell>
                        <TableCell className="mono text-xs text-muted-foreground">
                          {new Date(s.startedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right mono text-xs text-muted-foreground">
                          {fmtDur(durMs, true)}
                        </TableCell>
                        <TableCell className="text-right mono text-xs">
                          {fmtNum(s.inputTokens)}
                        </TableCell>
                        <TableCell className="text-right mono text-xs text-teal">
                          {fmtNum(s.cachedInputTokens)}
                        </TableCell>
                        <TableCell className="text-right mono text-xs">
                          {fmtNum(s.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right mono text-xs font-medium">
                          {fmtCost(s.costUsd)}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.baseTokens != null ? (
                            <span className="mono text-[10px] px-1.5 py-0.5 rounded bg-teal/10 text-teal border border-teal/20">
                              {fmtNum(s.baseTokens)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center text-sm text-muted-foreground py-10"
                      >
                        No live agent sessions matching criteria.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 border-t border-hairline mt-2">
            <div className="mono text-[11px] text-muted-foreground">
              page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </Panel>
      </section>

      {/* Session Detail Dialog */}
      <SessionDetailModal
        id={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </div>
  );
}

function SessionDetailModal({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: session, isLoading } = useAgentSession(id);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-surface border-hairline max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 mono text-sm">
            <Sparkles className="h-4 w-4 text-teal" />
            Session Details
          </DialogTitle>
        </DialogHeader>

        {isLoading || !session ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Session ID" value={session.sessionId} />
              <Field label="User" value={session.user?.username || "unknown"} />
              <Field label="Tool" value={session.tool} />
              <Field label="Model" value={session.model} />
              <Field
                label="Started At"
                value={new Date(session.startedAt).toLocaleString()}
              />
              <Field
                label="Last Updated"
                value={new Date(session.lastUpdatedAt).toLocaleString()}
              />
              <Field
                label="Duration"
                value={fmtDur(
                  (session as any).durationMs ??
                    new Date(session.lastUpdatedAt).getTime() -
                      new Date(session.startedAt).getTime(),
                  true
                )}
              />
              <Field label="Cost USD" value={fmtCost(session.costUsd)} />
              <Field
                label="Base Tokens"
                value={session.baseTokens != null ? `${fmtNum(session.baseTokens)} BT` : "—"}
              />
              <Field
                label="Input Tokens"
                value={session.inputTokens.toLocaleString()}
              />
              <Field
                label="Cached Input"
                value={session.cachedInputTokens.toLocaleString()}
              />
              <Field
                label="Output Tokens"
                value={session.outputTokens.toLocaleString()}
              />
              {(session as any).jiraTicketId && (
                <Field label="Jira Ticket" value={(session as any).jiraTicketId} />
              )}
              {(session as any).initialCommitSha && (
                <Field
                  label="Initial Commit"
                  value={String((session as any).initialCommitSha).slice(0, 8)}
                />
              )}
            </div>

            {session.rawPayload && (
              <div className="space-y-1 mt-4">
                <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Raw Payload JSON
                </div>
                <pre className="mono text-[11px] bg-surface-2 p-3 rounded-md overflow-x-auto max-h-64 border border-hairline text-foreground/90">
                  {JSON.stringify(session.rawPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Historical CodeBurn Tab ──────────────────────────────────────────────────

const PERIODS = ["Today", "7 Days", "30 Days"];

function HistoricalCodeBurnView() {
  const { data: users = [], isLoading: usersLoading } = useUsageUsers();
  const [selectedUser, setSelectedUser] = useState<string>("overview");
  const [period, setPeriod] = useState<string>("30 Days");

  useEffect(() => {
    if (!selectedUser && users.length > 0) {
      setSelectedUser("overview");
    }
  }, [users, selectedUser]);

  const isOverview = selectedUser === "overview" || !selectedUser;

  const { data: usageData, isLoading: usageLoading } = useUsageData(
    isOverview ? undefined : selectedUser,
    period
  );

  const { data: overviewData, isLoading: overviewLoading } = useHistoricalOverview(
    users,
    period
  );

  if (usersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <Panel title="Historical CodeBurn Analytics" className="text-center py-16">
        <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-base font-medium">No CodeBurn usage uploads yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto mb-4">
          Historical AI usage data generated by CodeBurn can be uploaded as CSV archives to monitor developer spend and model performance.
        </p>
        <div className="mono text-xs bg-surface-2 p-3 rounded max-w-sm mx-auto border border-hairline text-left">
          <code>codeburn-upload.sh /path/to/archive.zip</code>
        </div>
      </Panel>
    );
  }

  const summaryRow = usageData?.summary?.[0];

  return (
    <div className="space-y-8">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-lg border border-hairline">
        <div className="flex items-center gap-3">
          <span className="mono text-[11px] uppercase text-muted-foreground tracking-wider">
            Uploaded User:
          </span>
          <Select value={selectedUser || "overview"} onValueChange={setSelectedUser}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="Select user…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview" className="font-medium text-teal">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5" /> All Users (Overview)
                </span>
              </SelectItem>
              {users.map((u) => (
                <SelectItem key={u.username} value={u.username}>
                  {u.username} ({(u as any).uploadCount || u._count?.uploads || 0} uploads)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-md border border-hairline">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded text-xs mono transition-all ${
                period === p
                  ? "bg-foreground text-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {isOverview ? (
        overviewLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : !overviewData || overviewData.totalSessions === 0 ? (
          <Panel title="Historical Data Overview" className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              No historical usage records found across users in period <strong>{period}</strong>.
            </p>
          </Panel>
        ) : (
          <>
            {/* Summary KPIs */}
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi
                label="Total Spend"
                value={fmtCost(overviewData.totalCostUsd)}
                accent="amber"
                sub="Across all users"
              />
              <Kpi
                label="Estimated Savings"
                value={fmtCost(overviewData.totalSavedUsd)}
                accent="teal"
              />
              <Kpi
                label="Total Sessions"
                value={overviewData.totalSessions.toLocaleString()}
              />
              <Kpi
                label="API Calls"
                value={overviewData.totalApiCalls.toLocaleString()}
              />
              <Kpi
                label="Active Projects"
                value={overviewData.totalProjects.toLocaleString()}
              />
            </section>

            {/* Daily Chart */}
            {overviewData.daily && overviewData.daily.length > 0 && (
              <Panel title="Aggregate Daily Spend & Tokens" subtitle={`Breakdown across all uploaded users for ${period}`}>
                <div className="h-72 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={overviewData.daily}>
                      <defs>
                        <linearGradient id="histOverviewCost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--hairline)" vertical={false} />
                      <XAxis
                        dataKey="Date"
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: "var(--hairline)" }}
                      />
                      <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: "var(--hairline)" }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <RTooltip
                        contentStyle={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--hairline)",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => fmtCost(v)}
                      />
                      <Area
                        type="monotone"
                        name="Cost USD"
                        dataKey="Cost (USD)"
                        stroke="var(--amber)"
                        fill="url(#histOverviewCost)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}

            {/* Pies Section */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <PieCard title="Spend by user" data={overviewData.byUser} />
              <PieCard title="Spend by model" data={overviewData.byModel} />
              <PieCard title="Spend by tool" data={overviewData.byTool} />
            </section>
          </>
        )
      ) : usageLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !usageData || !summaryRow ? (
        <Panel title="Historical Data" className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            No historical usage found for user <strong>{selectedUser}</strong> in period{" "}
            <strong>{period}</strong>.
          </p>
        </Panel>
      ) : (
        <>
          {/* Summary KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi
              label="Period Spend"
              value={fmtCost(summaryRow["Cost (USD)"])}
              accent="amber"
            />
            <Kpi
              label="Estimated Savings"
              value={fmtCost(summaryRow["Saved (USD)"])}
              accent="teal"
            />
            <Kpi
              label="Total Sessions"
              value={(summaryRow.Sessions || 0).toLocaleString()}
            />
            <Kpi
              label="API Calls"
              value={(summaryRow["API Calls"] || 0).toLocaleString()}
            />
            <Kpi
              label="Active Projects"
              value={(summaryRow.Projects || 0).toLocaleString()}
            />
          </section>

          {/* Daily Chart */}
          {usageData.daily && usageData.daily.length > 0 && (
            <Panel title="Daily Spend & Tokens" subtitle={`Breakdown for ${period}`}>
              <div className="h-72 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageData.daily}>
                    <defs>
                      <linearGradient id="histCost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--hairline)" vertical={false} />
                    <XAxis
                      dataKey="Date"
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--hairline)" }}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--hairline)" }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <RTooltip
                      contentStyle={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--hairline)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => fmtCost(v)}
                    />
                    <Area
                      type="monotone"
                      name="Cost USD"
                      dataKey="Cost (USD)"
                      stroke="var(--amber)"
                      fill="url(#histCost)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}

          {/* Models and Activity */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Model Performance">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-hairline">
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(usageData.models || []).map((m) => (
                      <TableRow key={m.Model} className="border-hairline">
                        <TableCell className="mono text-xs font-medium">{m.Model}</TableCell>
                        <TableCell className="text-right mono text-xs">
                          {(m["API Calls"] || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right mono text-xs">
                          {((m["Share (%)"] || 0)).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right mono text-xs text-amber font-medium">
                          {fmtCost(m["Cost (USD)"])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <Panel title="Activity Breakdown">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-hairline">
                      <TableHead>Activity</TableHead>
                      <TableHead className="text-right">Turns</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(usageData.activity || []).map((a) => (
                      <TableRow key={a.Activity} className="border-hairline">
                        <TableCell className="text-sm">{a.Activity}</TableCell>
                        <TableCell className="text-right mono text-xs">
                          {(a.Turns || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right mono text-xs">
                          {((a["Share (%)"] || 0)).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right mono text-xs text-amber">
                          {fmtCost(a["Cost (USD)"])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </section>

          {/* Projects & Tools */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Projects">
              <div className="overflow-x-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow className="border-hairline">
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(usageData.projects || []).map((p) => (
                      <TableRow key={p.Project} className="border-hairline">
                        <TableCell className="text-xs truncate max-w-[200px]" title={p.Project}>
                          {p.Project}
                        </TableCell>
                        <TableCell className="text-right mono text-xs">
                          {p.Sessions}
                        </TableCell>
                        <TableCell className="text-right mono text-xs text-amber">
                          {fmtCost(p["Cost (USD)"])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <Panel title="Most Used Tools">
              <div className="overflow-x-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow className="border-hairline">
                      <TableHead>Tool Name</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(usageData.tools || []).map((t) => (
                      <TableRow key={t.Tool} className="border-hairline">
                        <TableCell className="mono text-xs">{t.Tool}</TableCell>
                        <TableCell className="text-right mono text-xs">
                          {t.Calls.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right mono text-xs">
                          {t["Share (%)"].toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </section>

          {/* Historical Sessions Table */}
          <section>
            <Panel title="CodeBurn Recorded Sessions">
              <div className="overflow-x-auto max-h-80">
                <Table>
                  <TableHeader>
                    <TableRow className="border-hairline">
                      <TableHead>Session ID</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Started At</TableHead>
                      <TableHead className="text-right">Turns</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(usageData.sessions || []).map((s) => (
                      <TableRow key={s["Session ID"]} className="border-hairline">
                        <TableCell className="mono text-xs">{s["Session ID"].slice(0, 12)}…</TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]">
                          {s.Project}
                        </TableCell>
                        <TableCell className="mono text-xs text-muted-foreground">
                          {s["Started At"]}
                        </TableCell>
                        <TableCell className="text-right mono text-xs">
                          {s.Turns}
                        </TableCell>
                        <TableCell className="text-right mono text-xs font-medium text-amber">
                          {fmtCost(s["Cost (USD)"])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Shared UI Helpers ────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="mono text-[10px] uppercase text-muted-foreground tracking-wider">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "teal" | "amber" | "moss" | "brick";
}) {
  const color =
    accent === "teal"
      ? "text-teal"
      : accent === "amber"
        ? "text-amber"
        : accent === "moss"
          ? "text-moss"
          : accent === "brick"
            ? "text-brick"
            : "text-foreground";
  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3">
      <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
      {sub && (
        <div className="mono text-[10px] text-muted-foreground mt-1">{sub}</div>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  actions,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-surface flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {subtitle && (
            <div className="mono text-[10px] text-muted-foreground mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        {actions}
      </div>
      <div className="p-4 flex-1">{children}</div>
    </div>
  );
}

function PieCard({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number; cost?: number | null }[];
}) {
  const top = data.slice(0, 6);
  const totalVal = top.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <Panel title={title} subtitle={`${data.length} categories`}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={top}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--surface)"
            >
              {top.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <RTooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--hairline)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(v: number, n) => [typeof v === 'number' && v < 1000 ? fmtCost(v) : fmtNum(v), String(n)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-1.5">
        {top.map((d, i) => (
          <li
            key={d.name}
            className="flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2 w-2 rounded-sm shrink-0"
                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="truncate">{d.name}</span>
            </div>
            <div className="flex items-center gap-3 mono text-[11px] text-muted-foreground shrink-0">
              <span>{((d.value / totalVal) * 100).toFixed(0)}%</span>
              {d.cost != null && <span>{fmtCost(d.cost)}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <span className="h-6 w-6 rounded-full bg-surface-2 border border-hairline flex items-center justify-center mono text-[10px] text-muted-foreground shrink-0">
      {initials}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2">
      <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mono text-[12px] mt-0.5 break-all">{value}</div>
    </div>
  );
}
