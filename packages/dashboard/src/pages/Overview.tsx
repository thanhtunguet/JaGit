import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StatCard } from "@/components/StatCard";
import { JobsTable } from "@/components/JobsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatTokens, formatBaseTokens } from "@/lib/utils";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Activity, CheckCircle, Hash, Clock } from "lucide-react";
import {
  getOverviewStats,
  isActiveJob,
  listJobs,
  listUsageUsers,
  getLatestUpload,
  listAgentSessions,
  type Job,
  type OverviewStats,
  type UsageUser,
  type UsageData,
} from "@/api/client";

const STATUS_COLORS: Record<string, string> = {
  done: "#22c55e",
  running: "#3b82f6",
  failed: "#ef4444",
  paused: "#f59e0b",
  stopped: "#94a3b8",
  queued: "#a78bfa",
  cloning: "#60a5fa",
  awaiting_approval: "#fbbf24",
  pushing: "#34d399",
  opening_mr: "#2dd4bf",
  reporting: "#818cf8",
};

const DEFAULT_COLOR = "#64748b";

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function doneDeltaDescription(doneToday: number, doneYesterday: number): string {
  const delta = doneToday - doneYesterday;
  if (delta === 0) return "Same as yesterday";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} from yesterday`;
}



export function Overview() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usageUsers, setUsageUsers] = useState<UsageUser[] | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [liveTokens7d, setLiveTokens7d] = useState<number | null>(null);

  const refreshJobs = () => listJobs().then(setJobs).catch((e) => setError((e as Error).message));

  useEffect(() => {
    getOverviewStats()
      .then(setStats)
      .catch((e) => setError((e as Error).message));
    refreshJobs();
  }, []);

  useEffect(() => {
    listUsageUsers()
      .then(async (users) => {
        setUsageUsers(users);
        if (users.length > 0) {
          const latest = await getLatestUpload(users[0].username);
          if ("data" in latest && latest.data !== null) {
            setUsageData((latest as { data: UsageData }).data);
          }
        }
      })
      .catch(() => {
        /* usage widget is optional; ignore errors */
      });
  }, []);

  useEffect(() => {
    // Coarse Phase-1 figure: sums input+output tokens across up to 200 of the
    // most recent AgentSession rows in the last 7 days. A dedicated aggregate
    // endpoint is deferred until this proves useful.
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    listAgentSessions({ from, limit: 200 })
      .then((res) => {
        const total = res.rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
        setLiveTokens7d(total);
      })
      .catch(() => {
        /* live token widget is optional; ignore errors */
        setLiveTokens7d(0);
      });
  }, []);

  const runningJobs = useMemo(
    () => (jobs === null ? null : jobs.filter(isActiveJob)),
    [jobs],
  );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const statusChart = (stats?.statusDistribution ?? []).map((s) => ({
    name: formatStatusLabel(s.status),
    value: s.count,
    color: STATUS_COLORS[s.status] ?? DEFAULT_COLOR,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Overview</h2>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats === null ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Active Jobs"
              value={stats.activeJobs}
              icon={Activity}
              description="Currently running"
            />
            <StatCard
              title="Done Today"
              value={stats.doneToday}
              icon={CheckCircle}
              description={doneDeltaDescription(stats.doneToday, stats.doneYesterday)}
            />
            <StatCard
              title="Total Tokens Used"
              value={
                stats.totalBaseTokens == null
                  ? "—"
                  : `${formatBaseTokens(stats.totalBaseTokens)} BT`
              }
              icon={Hash}
              description={`${formatTokens(stats.totalTokensUsed)} tokens · live BT`}
            />
            <StatCard
              title="Approval Queue"
              value={stats.approvalQueue}
              icon={Clock}
              description="Awaiting human action"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Job Throughput (last 7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {stats === null ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.throughput}>
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="jobs"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            {stats === null ? (
              <Skeleton className="h-[200px] w-full" />
            ) : statusChart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center w-full">
                No jobs yet.
              </p>
            ) : (
              <>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                    >
                      {statusChart.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="space-y-2 text-sm flex-1">
                  {statusChart.map((s) => (
                    <li key={s.name} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: s.color }}
                      />
                      <span className="text-muted-foreground">{s.name}</span>
                      <span className="font-semibold ml-auto">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Running jobs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Running Jobs</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/jobs">View all jobs</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <JobsTable
            jobs={runningJobs}
            emptyMessage="No jobs currently running."
            onActionComplete={refreshJobs}
            onError={(message) => setError(message)}
            className="border-0"
          />
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {stats === null ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full mb-2" />
            ))
          ) : stats.recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No events recorded yet.</p>
          ) : (
            stats.recentEvents.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-3 py-2 border-b border-border last:border-0 text-sm"
              >
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <Badge
                  variant={
                    e.level === "error"
                      ? "destructive"
                      : e.level === "warn"
                        ? "outline"
                        : "secondary"
                  }
                  className="text-xs shrink-0"
                >
                  {e.level}
                </Badge>
                {e.jiraIssueKey && (
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {e.jiraIssueKey}
                  </span>
                )}
                <span>{e.message}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* AI Usage Widget */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">AI Usage</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/usage">View details</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-baseline justify-between border-b pb-3">
            <div>
              <div className="text-2xl font-bold">
                {liveTokens7d === null ? "—" : formatTokens(liveTokens7d)}
              </div>
              <div className="text-xs text-muted-foreground">Live tokens (7d)</div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/usage">Historical</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/usage?tab=sessions">Live</Link>
              </Button>
            </div>
          </div>
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
    </div>
  );
}
