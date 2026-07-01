import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PipelineRail, StatusPill } from "@/components/pipeline-rail";
import {
  useOverviewStats,
  useJobs,
  usePendingApprovals,
} from "@/hooks/use-api";
import { isActiveJob } from "@/lib/api";
import { formatTokens, formatBaseTokens } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · JiGit" },
      { name: "description", content: "Live pipeline of all running AI coding jobs and pending approvals." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useOverviewStats();
  const {
    data: jobs,
    isLoading: jobsLoading,
    error: jobsError,
  } = useJobs();
  const {
    data: approvals,
    isLoading: approvalsLoading,
    error: approvalsError,
  } = usePendingApprovals();

  const running = (jobs ?? []).filter(isActiveJob);
  const hasError = statsError || jobsError || approvalsError;

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-[1400px] mx-auto space-y-8">
        <PipelineRail />

        {hasError && (
          <div className="rounded-lg border border-brick/30 bg-brick/[0.04] px-4 py-3 text-sm text-brick">
            Some data could not be loaded. The page is showing the latest available information.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsLoading ? (
            <>
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
              <StatSkeleton />
            </>
          ) : (
            <>
              <Stat
                label="active jobs"
                value={stats?.activeJobs ?? 0}
                tone="teal"
              />
              <Stat
                label="awaiting approval"
                value={stats?.approvalQueue ?? 0}
                tone="amber"
                pulse={(stats?.approvalQueue ?? 0) > 0}
              />
              <Stat
                label="done today"
                value={stats?.doneToday ?? 0}
                tone="moss"
              />
              <Stat
                label="tokens today"
                value={formatTokens(stats?.totalTokensUsed ?? 0)}
                sub={stats?.totalBaseTokens != null ? `${formatBaseTokens(stats.totalBaseTokens)}` : undefined}
              />
            </>
          )}
        </div>

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <section className="rounded-xl border border-hairline bg-surface">
            <header className="px-5 py-4 flex items-center justify-between border-b border-hairline">
              <h2 className="text-sm font-semibold tracking-tight">Running jobs</h2>
              <Link to="/jobs" className="mono text-[11px] text-teal hover:underline">
                view all →
              </Link>
            </header>
            <ul>
              {jobsLoading ? (
                <>
                  <JobRowSkeleton />
                  <JobRowSkeleton />
                  <JobRowSkeleton />
                </>
              ) : running.length === 0 ? (
                <EmptyRow text="No jobs running — assign a Jira issue to get started." />
              ) : (
                running.map((j) => (
                  <li key={j.id} className="border-b border-hairline last:border-0">
                    <Link
                      to="/jobs/$id"
                      params={{ id: j.id }}
                      className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3.5 hover:bg-surface-2/60 transition-colors"
                    >
                      <span className="mono text-[11px] text-teal w-20">
                        {j.jiraIssueKey ?? "—"}
                      </span>
                      <span className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {j.source}
                        </div>
                        <div className="mono text-[10px] text-muted-foreground truncate mt-0.5">
                          {j.branch ?? "—"}
                        </div>
                      </span>
                      <StatusPill status={j.status as any} />
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-hairline bg-surface">
            <header className="px-5 py-4 flex items-center justify-between border-b border-hairline">
              <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
              <span className="mono text-[10px] text-muted-foreground">live · sse</span>
            </header>
            <ul className="px-5 py-2">
              {statsLoading ? (
                <>
                  <EventRowSkeleton />
                  <EventRowSkeleton />
                  <EventRowSkeleton />
                  <EventRowSkeleton />
                </>
              ) : (stats?.recentEvents ?? []).length === 0 ? (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No recent events
                </li>
              ) : (
                (stats?.recentEvents ?? []).slice(0, 8).map((e) => (
                  <li key={e.id} className="flex gap-3 py-2 border-b border-hairline last:border-0">
                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                        e.level === "warn"
                          ? "bg-amber"
                          : e.level === "error"
                            ? "bg-brick"
                            : e.level === "agent"
                              ? "bg-teal"
                              : "bg-muted-foreground"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug">{e.message}</div>
                      <div className="mono text-[10px] text-muted-foreground mt-0.5">
                        {e.type ?? "—"} · {fmtAgo(e.ts)}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        {approvals && approvals.length > 0 && (
          <section className="rounded-xl border border-amber/30 bg-amber/[0.04]">
            <header className="px-5 py-4 flex items-center justify-between border-b border-amber/20">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-amber pulse-amber" />
                <h2 className="text-sm font-semibold tracking-tight">
                  {approvals.length} {approvals.length === 1 ? "agent is" : "agents are"} waiting on you
                </h2>
              </div>
              <Link to="/approvals" className="mono text-[11px] text-amber hover:underline">
                open queue →
              </Link>
            </header>
            <ul>
              {approvals.slice(0, 3).map((a) => (
                <li
                  key={a.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3 border-b border-amber/10 last:border-0"
                >
                  <span className="mono text-[11px] text-amber">
                    {a.job.jiraIssueKey ?? "—"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm truncate">
                      <span className="mono text-[12px] text-foreground">{a.kind}</span>
                      <span className="text-muted-foreground"> — {a.prompt}</span>
                    </div>
                  </div>
                  <Link
                    to="/approvals"
                    className="mono text-[11px] px-3 py-1.5 rounded border border-amber/40 text-amber hover:bg-amber/10"
                  >
                    review
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  pulse,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "teal" | "amber" | "moss";
  pulse?: boolean;
}) {
  const accent =
    tone === "amber" ? "text-amber" : tone === "moss" ? "text-moss" : tone === "teal" ? "text-teal" : "text-foreground";
  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3.5 relative overflow-hidden">
      {pulse && <div className="absolute inset-x-0 top-0 h-px bg-amber pulse-amber" />}
      <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <div className={`text-2xl font-semibold tracking-tight ${accent}`}>{value}</div>
        {sub && <div className="mono text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3.5 relative overflow-hidden">
      <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        loading…
      </div>
      <div className="mt-1.5 h-8 w-16 bg-muted-foreground/10 rounded animate-pulse" />
    </div>
  );
}

function JobRowSkeleton() {
  return (
    <li className="border-b border-hairline last:border-0 px-5 py-3.5">
      <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center">
        <div className="h-4 w-16 bg-muted-foreground/10 rounded animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-4 w-48 bg-muted-foreground/10 rounded animate-pulse" />
          <div className="h-3 w-32 bg-muted-foreground/10 rounded animate-pulse" />
        </div>
        <div className="h-6 w-16 bg-muted-foreground/10 rounded animate-pulse" />
      </div>
    </li>
  );
}

function EventRowSkeleton() {
  return (
    <li className="flex gap-3 py-2 border-b border-hairline last:border-0">
      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/20 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-4 w-full bg-muted-foreground/10 rounded animate-pulse" />
        <div className="h-3 w-24 bg-muted-foreground/10 rounded animate-pulse" />
      </div>
    </li>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <li className="px-5 py-8 text-center text-sm text-muted-foreground">{text}</li>;
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
