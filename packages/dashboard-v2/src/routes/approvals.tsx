import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";
import { usePendingApprovals, useDecideApproval } from "@/hooks/use-api";
import { useApprovalsSSE } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Approval } from "@/lib/api";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals · JiGit" },
      { name: "description", content: "Pending tool-call approvals across all running jobs. Oldest first." },
    ],
  }),
  component: ApprovalsPage,
});

type PendingApprovalItem = Approval & {
  jobId: string;
  createdAt: string;
  job?: { id: string; jiraIssueKey: string | null };
};

function ApprovalsPage() {
  const { data: rawQueue = [], isLoading } = usePendingApprovals();
  const queryClient = useQueryClient();

  useApprovalsSSE(() => {
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
  });

  const queue = [...(rawQueue as PendingApprovalItem[])].sort(
    (a, b) => new Date(a.createdAt || Date.now()).getTime() - new Date(b.createdAt || Date.now()).getTime(),
  );

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-[1100px] mx-auto">
        <header className="mb-7 flex items-end justify-between gap-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              approvals
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-3">
              {isLoading ? "Loading..." : `${queue.length} pending`}
              {queue.length > 0 && <span className="h-2 w-2 rounded-full bg-amber pulse-amber" />}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Oldest first. Each entry auto-denies on its countdown.
            </p>
          </div>
          <div className="mono text-[11px] text-muted-foreground hidden sm:block">
            GET /api/approvals · live sse
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-xl border border-hairline bg-surface p-10 text-center text-sm text-muted-foreground">
            Loading pending approvals...
          </div>
        ) : queue.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-surface p-10 text-center text-sm text-muted-foreground">
            Inbox zero. Agents are running unblocked.
          </div>
        ) : (
          <ul className="space-y-4">
            {queue.map(a => (
              <li key={a.id}>
                <ApprovalEntry approval={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function ApprovalEntry({ approval }: { approval: PendingApprovalItem }) {
  const [open, setOpen] = useState(false);
  const decideMutation = useDecideApproval();

  const createdAtMs = approval.createdAt ? new Date(approval.createdAt).getTime() : Date.now();
  const expiresAt = createdAtMs + 15 * 60000;
  const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
  const total = 15;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));

  const issueKey = approval.job?.jiraIssueKey ?? approval.jobId?.slice(0, 8) ?? "job";
  const toolName = approval.kind === "tool_permission" ? approval.prompt.replace(/^Allow tool: /, "") : approval.kind;

  let options: { optionId: string; name: string }[] = [];
  if (Array.isArray(approval.options)) {
    options = approval.options;
  } else if (approval.options && typeof approval.options === "object") {
    options = Object.entries(approval.options).map(([k, v]) => ({ optionId: k, name: String(v) }));
  }

  if (options.length === 0) {
    options = [
      { optionId: "deny", name: "Reject" },
      { optionId: "allow", name: "Approve once" },
    ];
  }

  const denyOptions = options.filter(o => o.optionId.includes("deny") || o.optionId.includes("reject"));
  const allowOptions = options.filter(o => !o.optionId.includes("deny") && !o.optionId.includes("reject"));
  const primaryAllow = allowOptions[allowOptions.length - 1];

  const handleDecide = (optionId: string) => {
    decideMutation.mutate({ id: approval.id, optionId });
  };

  return (
    <article className="rounded-xl border border-amber/30 bg-surface overflow-hidden">
      <div className="h-0.5 bg-hairline relative">
        <div
          className="absolute inset-y-0 left-0 bg-amber"
          style={{ width: `${pct}%` }}
        />
      </div>
      <header className="px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {approval.jobId ? (
              <Link
                to="/jobs/$id"
                params={{ id: approval.jobId }}
                className="mono text-[12px] text-teal hover:underline"
              >
                {issueKey}
              </Link>
            ) : (
              <span className="mono text-[12px] text-teal">{issueKey}</span>
            )}
            <span className="mono text-[12px] text-amber">{toolName}</span>
            <span className="mono text-[10px] text-muted-foreground">
              requested {fmtAgo(approval.createdAt)}
            </span>
          </div>
          <p className="text-[15px] mt-2 leading-snug">{approval.prompt}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
            auto-deny in
          </div>
          <div className="mono text-amber text-lg mt-0.5">{remaining}m</div>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="mx-5 mono text-[10px] text-muted-foreground hover:text-foreground"
      >
        {open ? "− hide payload" : "+ inspect tool payload"}
      </button>
      {open && (
        <pre className="mx-5 mt-2 mb-2 rounded-md bg-background border border-hairline p-3 mono text-[11px] overflow-auto">
          {JSON.stringify(
            {
              id: approval.id,
              jobId: approval.jobId,
              kind: approval.kind,
              prompt: approval.prompt,
              options: approval.options,
              createdAt: approval.createdAt,
            },
            null,
            2,
          )}
        </pre>
      )}

      <div className="mt-2 px-5 py-3.5 border-t border-hairline bg-surface-2/40 flex flex-wrap gap-2 justify-end items-center">
        {options.map(opt => {
          const isDeny = denyOptions.includes(opt);
          const isPrimary = opt === primaryAllow;

          let btnClass = "mono text-[11px] px-3 py-2 rounded border border-hairline text-muted-foreground hover:text-foreground hover:border-foreground/40";
          if (!isDeny && isPrimary) {
            btnClass = "text-[12px] font-semibold px-4 py-2 rounded bg-amber text-[#1a1207] hover:brightness-110 shadow-[0_4px_14px_-4px_rgba(232,163,61,0.6)]";
          } else if (!isDeny && !isPrimary) {
            btnClass = "text-[12px] font-medium px-3.5 py-2 rounded border border-amber/40 text-amber hover:bg-amber/10";
          }

          return (
            <button
              key={opt.optionId}
              type="button"
              disabled={decideMutation.isPending}
              onClick={() => handleDecide(opt.optionId)}
              className={`${btnClass} disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
            >
              {decideMutation.isPending && decideMutation.variables?.optionId === opt.optionId
                ? "Submitting..."
                : opt.name}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function fmtAgo(iso: string) {
  if (!iso) return "just now";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  return `${m}m ago`;
}
