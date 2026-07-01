import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/pipeline-rail";
import { STATIONS } from "@/lib/jigit-data";
import { useState, useRef, useEffect } from "react";
import { formatTokens } from "@/lib/utils";
import { useJob, useControlJob, useDecideApproval } from "@/hooks/use-api";
import { useSSE } from "@/hooks/use-sse";
import { Approval, JobEvent, JobStep } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Terminal, ListFilter, FileCode } from "lucide-react";

export const Route = createFileRoute("/jobs_/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Job ${params.id} · JiGit` },
      { name: "description", content: "Live step timeline and event log for a single AI coding job." },
    ],
  }),
  component: JobDetail,
  notFoundComponent: () => (
    <AppShell>
      <div className="p-10 text-center text-muted-foreground">
        Job not found.{" "}
        <Link to="/jobs" className="text-teal hover:underline">
          Back to jobs
        </Link>
      </div>
    </AppShell>
  ),
});

function JobDetail() {
  const { id } = Route.useParams();
  const { data: job, isLoading, error } = useJob(id);
  const liveEvents = useSSE<JobEvent>(id);
  const controlMutation = useControlJob();
  const decideMutation = useDecideApproval();
  const [activeTab, setActiveTab] = useState("events");

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-10 text-center text-muted-foreground animate-pulse">
          Loading job detail…
        </div>
      </AppShell>
    );
  }

  if (error || !job) {
    return (
      <AppShell>
        <div className="p-10 text-center text-muted-foreground">
          Job not found.{" "}
          <Link to="/jobs" className="text-teal hover:underline">
            Back to jobs
          </Link>
        </div>
      </AppShell>
    );
  }

  const pendingForJob = (job.approvals ?? []).filter(a => a.status === "pending");
  const mergedEvents = [...(job.events ?? []), ...liveEvents].filter(
    (e, idx, arr) => arr.findIndex(x => x.id === e.id) === idx
  );

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-[1400px] mx-auto space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="mono text-[12px] text-teal">{job.jiraIssueKey ?? job.id.slice(0, 8)}</span>
              <StatusPill status={job.status as any} />
              <span className="mono text-[10px] text-muted-foreground">job · {job.id}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-2">{job.source.toUpperCase()} Task</h1>
            <div className="mono text-[11px] text-muted-foreground mt-1.5">
              {job.branch ?? "no branch"}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={controlMutation.isPending || job.status === "done" || job.status === "failed" || job.status === "stopped"}
              onClick={() => controlMutation.mutate({ id: job.id, action: "pause" })}
              className="mono text-[11px] px-3 py-1.5 rounded border border-hairline text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Pause
            </button>
            <button
              disabled={controlMutation.isPending || job.status === "done" || job.status === "failed" || job.status === "stopped"}
              onClick={() => controlMutation.mutate({ id: job.id, action: "stop" })}
              className="mono text-[11px] px-3 py-1.5 rounded border border-brick/40 text-brick hover:bg-brick/10 disabled:opacity-50"
            >
              Stop job
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="tokens" value={formatTokens(job.tokensUsed ?? 0)} />
          <Metric label="cost" value={`$${(job.costUsd ?? 0).toFixed(2)}`} />
          <Metric label="started" value={fmtAgo(job.createdAt)} />
          <Metric label="last event" value={fmtAgo(job.updatedAt)} />
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          {/* Vertical timeline */}
          <aside className="rounded-xl border border-hairline bg-surface p-5">
            <div className="flex flex-col gap-2 mb-4 border-b border-hairline/60 pb-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">Timeline</h2>
                <span className="text-[10px] mono text-muted-foreground">Indicators</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] mono font-medium">
                <span className="flex items-center gap-1.5 text-green-500"><span className="h-2 w-2 rounded-full bg-green-500 inline-block shadow-[0_0_6px_rgba(34,197,94,0.6)]"></span>Success</span>
                <span className="flex items-center gap-1.5 text-blue-400"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]"></span>Progress</span>
                <span className="flex items-center gap-1.5 text-orange-400"><span className="h-2 w-2 rounded-full bg-orange-500 inline-block shadow-[0_0_6px_rgba(249,115,22,0.6)]"></span>Pending</span>
                <span className="flex items-center gap-1.5 text-red-500"><span className="h-2 w-2 rounded-full bg-red-500 inline-block shadow-[0_0_6px_rgba(239,68,68,0.6)]"></span>Error</span>
              </div>
            </div>
            <ol className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-hairline" />
              {STATIONS.map((s, idx) => {
                const step = (job.steps ?? []).find(st => st.name === s.key || (st as any).key === s.key);
                let stat = step?.status;
                const currentStationIdx = STATIONS.findIndex(x => x.key === job.status);

                if (!stat) {
                  if (job.status === "done") {
                    stat = "done";
                  } else if (job.status === "failed" && idx === currentStationIdx) {
                    stat = "failed";
                  } else if (idx < currentStationIdx && currentStationIdx !== -1) {
                    stat = "done";
                  } else if (idx === currentStationIdx) {
                    stat = job.status === "awaiting_approval" ? "blocked" : "active";
                  } else {
                    stat = "pending";
                  }
                }

                const isSuccess = stat === "done" || stat === "success" || stat === "completed";
                const isProgress = stat === "active" || stat === "running" || stat === "in_progress";
                const isError = stat === "failed" || stat === "error";

                let dotColor = "bg-orange-500 border-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]";
                let badgeText = "Pending";
                let badgeColor = "bg-orange-500/10 text-orange-400 border-orange-500/30";

                if (isSuccess) {
                  dotColor = "bg-green-500 border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]";
                  badgeText = "Success";
                  badgeColor = "bg-green-500/10 text-green-500 border-green-500/30";
                } else if (isProgress) {
                  dotColor = "bg-blue-500 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse";
                  badgeText = "Progress";
                  badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/40 font-semibold animate-pulse";
                } else if (isError) {
                  dotColor = "bg-red-500 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]";
                  badgeText = "Error";
                  badgeColor = "bg-red-500/10 text-red-400 border-red-500/40 font-semibold";
                }

                return (
                  <li key={s.key} className={`relative pl-6 py-2.5 transition-colors ${isProgress ? "bg-blue-500/[0.04] rounded-lg my-0.5 pr-2" : ""}`}>
                    <span className={`absolute left-0 top-3.5 h-3.5 w-3.5 rounded-full border-2 ${dotColor}`} />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${isProgress ? "text-blue-400 font-semibold" : isSuccess ? "text-foreground" : isError ? "text-red-400 font-semibold" : "text-muted-foreground"}`}>
                          {s.label}
                        </span>
                        <span className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border leading-none ${badgeColor}`}>
                          {badgeText}
                        </span>
                        {isProgress && (
                          <span className="text-[10px] font-mono text-blue-400 font-bold tracking-wider uppercase animate-pulse flex items-center gap-1">
                            ◀ Active
                          </span>
                        )}
                      </div>
                      {step?.startedAt && (
                        <div className="mono text-[10px] text-muted-foreground shrink-0">
                          {fmtAgo(step.finishedAt ?? step.startedAt)}
                        </div>
                      )}
                    </div>
                    {(step as any)?.note && (
                      <div className="mono text-[10px] text-amber mt-1 pl-1">{(step as any).note}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="space-y-6 min-w-0">
            {pendingForJob.map(a => (
              <ApprovalCard
                key={a.id}
                approval={a}
                isPending={decideMutation.isPending}
                onDecide={(optionId) => decideMutation.mutate({ id: a.id, optionId })}
              />
            ))}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="bg-surface border border-hairline p-1 flex flex-wrap h-auto gap-1">
                <TabsTrigger value="events" className="gap-2 text-xs mono py-1.5 px-3">
                  <ListFilter className="h-3.5 w-3.5 text-teal" />
                  Events ({mergedEvents.length})
                </TabsTrigger>
                <TabsTrigger value="console" className="gap-2 text-xs mono py-1.5 px-3">
                  <Terminal className="h-3.5 w-3.5 text-amber" />
                  Console
                </TabsTrigger>
                <TabsTrigger value="raw-steps" className="gap-2 text-xs mono py-1.5 px-3">
                  <FileCode className="h-3.5 w-3.5 text-moss" />
                  Raw Logs
                </TabsTrigger>
              </TabsList>

              <TabsContent value="events" className="mt-4">
                <section className="rounded-xl border border-hairline bg-surface">
                  <header className="px-5 py-3.5 flex items-center justify-between border-b border-hairline">
                    <h2 className="text-sm font-semibold tracking-tight">Event stream</h2>
                    <span className="mono text-[10px] text-muted-foreground">
                      GET /api/jobs/{job.id}/stream
                    </span>
                  </header>
                  <ol className="mono text-[11.5px] leading-relaxed max-h-[600px] overflow-y-auto">
                    {mergedEvents.length === 0 ? (
                      <li className="px-5 py-6 text-center text-muted-foreground">No events yet</li>
                    ) : (
                      mergedEvents.map(e => {
                        const stepOrLevel = (e as any).step ?? e.type ?? e.level;
                        const payload = (e as any).data ?? e.payload;
                        return (
                          <li
                            key={e.id}
                            className="grid grid-cols-[88px_72px_1fr] gap-4 px-5 py-2 border-b border-hairline/60 last:border-0 hover:bg-surface-2/40"
                          >
                            <span className="text-muted-foreground">{fmtTime(e.ts)}</span>
                            <span
                              className={
                                e.level === "warn"
                                  ? "text-amber"
                                  : e.level === "error"
                                    ? "text-brick"
                                    : e.level === "agent"
                                      ? "text-teal"
                                      : "text-muted-foreground"
                              }
                            >
                              {stepOrLevel}
                            </span>
                            <span className="break-all">
                              {e.message}
                              {payload && Object.keys(payload).length > 0 && (
                                <span className="text-muted-foreground"> {JSON.stringify(payload)}</span>
                              )}
                            </span>
                          </li>
                        );
                      })
                    )}
                  </ol>
                </section>
              </TabsContent>

              <TabsContent value="console" className="mt-4">
                <ConsoleTabView events={mergedEvents} />
              </TabsContent>

              <TabsContent value="raw-steps" className="mt-4">
                <StepRawLogsView steps={job.steps ?? []} job={job} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ApprovalCard({
  approval,
  onDecide,
  isPending,
}: {
  approval: Approval;
  onDecide: (optionId: string) => void;
  isPending?: boolean;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const options = approval.options && approval.options.length > 0
    ? approval.options
    : [{ optionId: "allow", name: "Approve" }, { optionId: "deny", name: "Reject" }];
  const payload = (approval as any).payload;

  return (
    <section className="rounded-xl border border-amber/40 bg-amber/[0.04] overflow-hidden">
      <header className="px-5 py-3.5 flex items-center justify-between border-b border-amber/20">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-amber pulse-amber" />
          <h3 className="text-sm font-semibold">Approval requested</h3>
          <span className="mono text-[11px] text-amber">{approval.kind}</span>
        </div>
        {(approval as any).expiresAt && <Countdown expiresAt={(approval as any).expiresAt} />}
      </header>
      <div className="px-5 py-4">
        <p className="text-sm">{approval.prompt}</p>
        {payload && (
          <button
            onClick={() => setShowPayload(s => !s)}
            className="mono text-[10px] text-muted-foreground hover:text-foreground mt-3"
          >
            {showPayload ? "− hide payload" : "+ inspect payload"}
          </button>
        )}
        {showPayload && payload && (
          <pre className="mt-2 rounded-md bg-background border border-hairline p-3 mono text-[11px] text-foreground overflow-auto">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </div>
      <div className="px-5 py-3.5 border-t border-amber/20 bg-amber/[0.03] flex flex-wrap gap-2 justify-end items-center">
        {options.map(opt => (
          <button
            key={opt.optionId}
            disabled={isPending}
            onClick={() => onDecide(opt.optionId)}
            className="text-[12px] font-medium px-3.5 py-2 rounded border border-amber/40 text-amber hover:bg-amber/10 disabled:opacity-50"
          >
            {opt.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  const m = Math.max(0, Math.round(diff / 60000));
  return (
    <span className="mono text-[10px] text-amber">
      auto-deny in {m}m
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3">
      <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mono text-base font-medium mt-1">{value}</div>
    </div>
  );
}

function fmtAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ConsoleTabView({ events }: { events: JobEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const consoleEvents = events.filter(
    (e) =>
      e.type === "agent_output" ||
      e.type === "approval_requested" ||
      e.type === "agent_done" ||
      e.type === "step_error" ||
      e.level === "agent" ||
      e.level === "error"
  );

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleEvents.length, autoScroll]);

  return (
    <section className="rounded-xl border border-hairline bg-[#0a0f0d] text-emerald-400 font-mono text-xs overflow-hidden flex flex-col">
      <header className="px-5 py-3 flex items-center justify-between border-b border-hairline/40 bg-black/40">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-foreground">Agent Console Output</span>
        </div>
        <label className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer select-none text-[11px]">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded border-hairline bg-surface h-3.5 w-3.5 text-teal accent-teal"
          />
          Auto-scroll
        </label>
      </header>
      <div className="p-4 space-y-1.5 max-h-[600px] overflow-y-auto min-h-[300px]">
        {consoleEvents.length === 0 ? (
          <div className="text-muted-foreground text-center py-16">Waiting for live agent console output...</div>
        ) : (
          consoleEvents.map((e, i) => (
            <div key={e.id ?? i} className="break-all leading-relaxed flex items-start gap-3 hover:bg-white/[0.02] py-0.5 px-2 rounded">
              <span className="text-muted-foreground shrink-0 select-none">{fmtTime(e.ts)}</span>
              <span
                className={
                  e.type === "approval_requested"
                    ? "text-amber font-semibold"
                    : e.type === "agent_done"
                      ? "text-teal font-semibold"
                      : e.type === "step_error" || e.level === "error"
                        ? "text-brick font-semibold"
                        : "text-emerald-300"
                }
              >
                {e.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

function StepRawLogsView({ steps, job }: { steps: JobStep[]; job: any }) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(steps.length > 0 ? steps[0].id : null);
  const [showFullJob, setShowFullJob] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-hairline bg-surface overflow-hidden">
        <header className="px-5 py-3.5 border-b border-hairline flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Raw Step Logs & Telemetry</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Inspect raw structured output and execution details recorded during each pipeline station.</p>
          </div>
          <span className="mono text-xs text-muted-foreground">{steps.length} steps</span>
        </header>
        <div className="divide-y divide-hairline">
          {steps.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs">No execution steps recorded yet.</div>
          ) : (
            steps.map((step) => {
              const isExpanded = expandedStepId === step.id;
              const hasDetail = step.detail && Object.keys(step.detail).length > 0;
              const stat = step.status ?? "pending";
              return (
                <div key={step.id} className="transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                    className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-surface-2/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="mono text-xs font-semibold text-foreground">{step.name}</span>
                      <span
                        className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border ${
                          stat === "done"
                            ? "bg-moss/10 border-moss/40 text-moss"
                            : stat === "active" || stat === "running"
                              ? "bg-teal/10 border-teal/40 text-teal animate-pulse"
                              : stat === "failed"
                                ? "bg-brick/10 border-brick/40 text-brick"
                                : "bg-muted border-hairline text-muted-foreground"
                        }`}
                      >
                        {stat}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {step.startedAt && (
                        <span className="mono text-[11px] text-muted-foreground">
                          {fmtTime(step.startedAt)} {step.finishedAt ? `→ ${fmtTime(step.finishedAt)}` : ""}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 bg-background/50">
                      <div className="mono text-[10px] text-muted-foreground mb-2 flex justify-between items-center">
                        <span>Payload Detail (JSON)</span>
                        <span>ID: {step.id}</span>
                      </div>
                      <pre className="p-3 rounded-lg bg-black/60 border border-hairline mono text-[11px] text-emerald-300 overflow-x-auto max-h-[350px]">
                        {hasDetail ? JSON.stringify(step.detail, null, 2) : "// No additional raw log detail payload for this step"}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-surface overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFullJob(!showFullJob)}
          className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-surface-2/50 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Full Job Raw JSON</span>
          </div>
          <span className="mono text-xs text-muted-foreground">{showFullJob ? "▼ Hide" : "▶ Inspect"}</span>
        </button>
        {showFullJob && (
          <div className="p-5 border-t border-hairline bg-background/50">
            <pre className="p-4 rounded-lg bg-black/80 border border-hairline mono text-[11px] text-foreground overflow-x-auto max-h-[500px]">
              {JSON.stringify(job, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
