import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/pipeline-rail";
import { useJobs, useControlJob, useRetryJob, useDeleteJob } from "@/hooks/use-api";
import { Job } from "@/lib/api";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs · JiGit" },
      { name: "description", content: "All jobs in flight — status, repo, branch, MR link." },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { data: jobs, isLoading, error } = useJobs();
  const jobList = jobs ?? [];

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">jobs</div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">
              {isLoading ? "Loading…" : `${jobList.length} total · newest first`}
            </h1>
          </div>
          <div className="mono text-[11px] text-muted-foreground hidden sm:block">GET /api/jobs</div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-brick/30 bg-brick/[0.04] px-4 py-3 text-sm text-brick">
            Failed to load jobs from API. Showing empty state.
          </div>
        )}

        <div className="rounded-xl border border-hairline bg-surface overflow-hidden">
          <div className="grid grid-cols-[120px_90px_1fr_1.2fr_auto] gap-4 px-5 py-3 border-b border-hairline mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div>status</div>
            <div>issue</div>
            <div>title · repo</div>
            <div>branch / mr</div>
            <div className="text-right">controls</div>
          </div>
          <ul>
            {isLoading ? (
              <>
                <JobRowSkeleton />
                <JobRowSkeleton />
                <JobRowSkeleton />
              </>
            ) : jobList.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                No jobs found — assign a Jira issue or trigger a webhook to get started.
              </li>
            ) : (
              jobList.map(j => (
                <li key={j.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                  <div className="grid grid-cols-[120px_90px_1fr_1.2fr_auto] gap-4 items-center px-5 py-3.5">
                    <StatusPill status={j.status as any} />
                    <Link to="/jobs/$id" params={{ id: j.id }} className="mono text-[12px] text-teal hover:underline">
                      {j.jiraIssueKey ?? j.id.slice(0, 8)}
                    </Link>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{j.source.toUpperCase()} Task</div>
                      <div className="mono text-[10px] text-muted-foreground truncate">{j.id}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="mono text-[11px] truncate">{j.branch ?? "—"}</div>
                      {j.mrUrl ? (
                        <a
                          href={j.mrUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mono text-[10px] text-teal hover:underline truncate block"
                        >
                          !{j.mrUrl.split("/").pop()} ↗
                        </a>
                      ) : (
                        <div className="mono text-[10px] text-muted-foreground">no MR yet</div>
                      )}
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <Controls job={j} />
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

function Controls({ job }: { job: Job }) {
  const controlMutation = useControlJob();
  const retryMutation = useRetryJob();
  const deleteMutation = useDeleteJob();

  const btn = "mono text-[10px] px-2 py-1 rounded border transition-colors disabled:opacity-50";
  const ghost = `${btn} border-hairline text-muted-foreground hover:text-foreground hover:border-foreground/40`;
  const danger = `${btn} border-brick/40 text-brick hover:bg-brick/10`;
  const retry = `${btn} border-teal/40 text-teal hover:bg-teal/10`;

  const isPending = controlMutation.isPending || retryMutation.isPending || deleteMutation.isPending;

  if (job.status === "done") return <span className="mono text-[10px] text-muted-foreground">—</span>;
  if (job.status === "failed" || job.status === "stopped") {
    return (
      <>
        <button disabled={isPending} onClick={() => retryMutation.mutate(job.id)} className={retry}>Retry</button>
        <button disabled={isPending} onClick={() => deleteMutation.mutate(job.id)} className={ghost}>Delete</button>
      </>
    );
  }
  if (job.status === "paused")
    return (
      <>
        <button disabled={isPending} onClick={() => controlMutation.mutate({ id: job.id, action: "resume" })} className={retry}>Resume</button>
        <button disabled={isPending} onClick={() => controlMutation.mutate({ id: job.id, action: "stop" })} className={danger}>Stop</button>
      </>
    );
  return (
    <>
      <button disabled={isPending} onClick={() => controlMutation.mutate({ id: job.id, action: "pause" })} className={ghost}>Pause</button>
      <button disabled={isPending} onClick={() => controlMutation.mutate({ id: job.id, action: "stop" })} className={danger}>Stop</button>
    </>
  );
}

function JobRowSkeleton() {
  return (
    <li className="border-b border-hairline last:border-0 px-5 py-3.5">
      <div className="grid grid-cols-[120px_90px_1fr_1.2fr_auto] gap-4 items-center">
        <div className="h-5 w-20 bg-muted-foreground/10 rounded animate-pulse" />
        <div className="h-4 w-14 bg-muted-foreground/10 rounded animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-4 w-36 bg-muted-foreground/10 rounded animate-pulse" />
          <div className="h-3 w-24 bg-muted-foreground/10 rounded animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <div className="h-4 w-28 bg-muted-foreground/10 rounded animate-pulse" />
          <div className="h-3 w-16 bg-muted-foreground/10 rounded animate-pulse" />
        </div>
        <div className="flex justify-end gap-1.5">
          <div className="h-6 w-12 bg-muted-foreground/10 rounded animate-pulse" />
          <div className="h-6 w-12 bg-muted-foreground/10 rounded animate-pulse" />
        </div>
      </div>
    </li>
  );
}
