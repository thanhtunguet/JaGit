import { Link, useNavigate } from "react-router-dom";
import { type Job } from "@/api/client";
import { JobActions } from "@/components/JobActions";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface JobsTableProps {
  jobs: Job[] | null;
  emptyMessage?: string;
  onActionComplete?: () => void;
  onError?: (message: string) => void;
  className?: string;
}

export function JobsTable({
  jobs,
  emptyMessage = "No jobs have been created yet.",
  onActionComplete,
  onError,
  className,
}: JobsTableProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("rounded-md border border-border", className)}>
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
                {emptyMessage}
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
                  <JobActions
                    job={job}
                    className="justify-end"
                    onActionComplete={onActionComplete}
                    onError={onError}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
