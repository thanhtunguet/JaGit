import { useState } from "react";
import { controlJob, retryJob, deleteJob, type Job } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Pause, RotateCcw, Trash2 } from "lucide-react";

export interface JobActionsProps {
  job: Pick<Job, "id" | "status" | "jiraIssueKey">;
  disabled?: boolean;
  className?: string;
  onActionComplete?: () => void | Promise<void>;
  onDeleted?: () => void;
  onError?: (message: string) => void;
}

export function JobActions({
  job,
  disabled = false,
  className,
  onActionComplete,
  onDeleted,
  onError,
}: JobActionsProps) {
  const [acting, setActing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const busy = disabled || acting;
  const label = job.jiraIssueKey ?? job.id;

  const run = async (fn: () => Promise<void>) => {
    setActing(true);
    try {
      await fn();
      await onActionComplete?.();
    } catch (e) {
      onError?.((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const pause = () =>
    run(async () => {
      await controlJob(job.id, "pause");
    });

  const retry = () =>
    run(async () => {
      await retryJob(job.id);
    });

  const confirmDelete = () =>
    run(async () => {
      await deleteJob(job.id);
      setDeleteOpen(false);
      onDeleted?.();
    });

  return (
    <>
      <div className={cn("flex flex-wrap gap-1", className)}>
        {job.status === "failed" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={retry}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
        {job.status === "running" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={pause}>
            <Pause className="h-3 w-3 mr-1" />
            Pause
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Delete
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete job?</DialogTitle>
            <DialogDescription>
              {job.status === "running" ? (
                <>
                  Job <span className="font-mono">{label}</span> is running. It will be stopped,
                  the agent session terminated, and any worktree removed before deletion.
                </>
              ) : (
                <>
                  Permanently delete job <span className="font-mono">{label}</span>? This cannot
                  be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
