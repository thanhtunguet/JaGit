import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Activity, CheckCircle, DollarSign, Clock } from "lucide-react";
import { getOverviewStats, type OverviewStats } from "@/api/client";

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

function formatCost(usd: number): string {
  return usd === 0 ? "$0.00" : `$${usd.toFixed(2)}`;
}

export function Overview() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOverviewStats()
      .then(setStats)
      .catch((e) => setError((e as Error).message));
  }, []);

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
              title="Avg Token Cost"
              value={formatCost(stats.avgCostUsd)}
              icon={DollarSign}
              description="Per job this week"
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
    </div>
  );
}
