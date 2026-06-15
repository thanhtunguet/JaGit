import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listJobs, controlJob, retryJob, deleteJob, type Job } from "@/api/client";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Pause, RotateCcw, Trash2 } from "lucide-react";

export function Jobs() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const navigate = useNavigate();

  const refresh = () => listJobs().then(setJobs).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const control = async (jobId: string, action: "pause") => {
    setActing(jobId);
    try {
      await controlJob(jobId, action);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(null);
    }
  };

  const retry = async (jobId: string) => {
    setActing(jobId);
    try {
      await retryJob(jobId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActing(deleteTarget.id);
    try {
      await deleteJob(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(null);
    }
  };

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

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
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
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
                <TableRow
                  key={job.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button,a")) return;
                    navigate(`/jobs/${job.id}`);
                  }}
                >
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="text-primary hover:underline font-mono text-sm"
                    >
                      {job.jiraIssueKey ?? job.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {job.branch ?? "—"}
                  </TableCell>
                  <TableCell>
                    {job.mrUrl ? (
                      <Button variant="link" size="sm" asChild className="h-auto p-0">
                        <a
                          href={job.mrUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open merge request"
                        >
                          MR <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {job.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === job.id}
                          onClick={() => retry(job.id)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}
                      {job.status === "running" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === job.id}
                          onClick={() => control(job.id, "pause")}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={acting === job.id}
                        onClick={() => setDeleteTarget(job)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete job?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.status === "running" ? (
                <>
                  Job <span className="font-mono">{deleteTarget.jiraIssueKey ?? deleteTarget.id}</span>{" "}
                  is running. It will be stopped, the agent session terminated, and any worktree
                  removed before deletion.
                </>
              ) : (
                <>
                  Permanently delete job{" "}
                  <span className="font-mono">{deleteTarget?.jiraIssueKey ?? deleteTarget?.id}</span>?
                  This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={acting === deleteTarget?.id}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
