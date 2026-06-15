import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

// ── Mock data (Phase 2 will replace with real ingestion) ──────────────────────
const THROUGHPUT = [
  { day: "Mon", jobs: 2 },
  { day: "Tue", jobs: 5 },
  { day: "Wed", jobs: 3 },
  { day: "Thu", jobs: 7 },
  { day: "Fri", jobs: 4 },
  { day: "Sat", jobs: 1 },
  { day: "Sun", jobs: 6 },
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
                <Line
                  type="monotone"
                  dataKey="jobs"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
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
                <Pie
                  data={STATUS_DIST}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                >
                  {STATUS_DIST.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
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
            <div
              key={e.id}
              className="flex items-start gap-3 py-2 border-b border-border last:border-0 text-sm"
            >
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(e.ts).toLocaleTimeString()}
              </span>
              <Badge
                variant={
                  e.level === "error" ? "destructive" : e.level === "warn" ? "outline" : "secondary"
                }
                className="text-xs shrink-0"
              >
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
