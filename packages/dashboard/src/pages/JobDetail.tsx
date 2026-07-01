import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getJob,
  useSSE,
  type JobDetail as JobDetailType,
  type JobEvent,
  type JobStep,
} from "@/api/client";
import { JobActions } from "@/components/JobActions";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EventRow } from "@/components/EventRow";
import { JsonMonacoViewer } from "@/components/JsonMonacoViewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, XCircle, Loader2, ExternalLink, Terminal } from "lucide-react";

const STEP_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  running: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
};

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const liveEvents = useSSE<{
    type: string;
    event?: JobEvent;
    status?: string;
    error?: string;
    step?: JobStep;
  }>(id!);

  useEffect(() => {
    getJob(id!).then(setJob).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (liveEvents.length === 0) return;
    const latest = liveEvents[liveEvents.length - 1];
    if (latest.type === "status_changed" && latest.status) {
      setJob((prev) =>
        prev
          ? {
              ...prev,
              status: latest.status!,
              ...(latest.error !== undefined ? { error: latest.error } : {}),
            }
          : prev,
      );
    }
    if (latest.type === "step_changed" && latest.step) {
      setJob((prev) => {
        if (!prev) return prev;
        const idx = prev.steps.findIndex((s) => s.id === latest.step!.id);
        const steps =
          idx >= 0
            ? prev.steps.map((s, i) => (i === idx ? { ...s, ...latest.step! } : s))
            : [...prev.steps, latest.step!];
        return { ...prev, steps };
      });
    }
  }, [liveEvents]);

  const refreshJob = () => getJob(id!).then(setJob).catch((e) => setError(e.message));

  const allEvents: JobEvent[] = [
    ...(job?.events ?? []),
    ...liveEvents.flatMap((e) => (e.event ? [e.event] : [])),
  ];

  const [tab, setTab] = useState("timeline");
  const fillHeight = tab === "events" || tab === "raw" || tab === "console";

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  if (!job)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );

  return (
    <div className={cn("flex flex-col gap-4", fillHeight && "h-[calc(100vh-3rem)]")}>
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <h2 className="text-xl font-bold font-mono">{job.jiraIssueKey ?? job.id}</h2>
        <JobStatusBadge status={job.status} />
      </div>

      <div className={cn("grid grid-cols-1 lg:grid-cols-3 gap-6", fillHeight && "flex-1 min-h-0")}>
        {/* Main: Timeline + Events */}
        <div className={cn("lg:col-span-2 flex flex-col", fillHeight && "min-h-0")}>
          <Tabs
            value={tab}
            onValueChange={setTab}
            className={cn("flex flex-col", fillHeight && "flex-1 min-h-0")}
          >
            <TabsList className="shrink-0">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="console">
                <Terminal className="h-3 w-3 mr-1" />
                Console
              </TabsTrigger>
              <TabsTrigger value="events">Events ({allEvents.length})</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>

            <div className={cn("mt-4", fillHeight && "flex-1 min-h-0 flex flex-col")}>
              {tab === "timeline" && (
                <div className="space-y-3">
                  {job.steps.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No steps recorded yet.</p>
                  ) : (
                    job.steps.map((step) => (
                      <Card key={step.id}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            {STEP_ICON[step.status] ?? STEP_ICON.pending}
                            {step.name}
                            <Badge variant="outline" className="ml-auto text-xs">
                              {step.status}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground space-y-1">
                          {step.startedAt && (
                            <div>Started: {new Date(step.startedAt).toLocaleTimeString()}</div>
                          )}
                          {step.finishedAt && (
                            <div>Finished: {new Date(step.finishedAt).toLocaleTimeString()}</div>
                          )}
                          {Object.keys(step.detail).length > 0 && (
                            <Accordion type="single" collapsible>
                              <AccordionItem value="detail" className="border-0">
                                <AccordionTrigger className="text-xs py-1">Detail</AccordionTrigger>
                                <AccordionContent>
                                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                                    {JSON.stringify(step.detail, null, 2)}
                                  </pre>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              )}

              {tab === "console" && <ConsoleTab events={allEvents} />}

              {tab === "events" && (
                <Card className="flex-1 min-h-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-3">
                      {allEvents.length === 0 ? (
                        <p className="text-muted-foreground text-sm text-center py-8">
                          No events yet.
                        </p>
                      ) : (
                        allEvents.map((e) => <EventRow key={e.id} event={e} />)
                      )}
                    </div>
                  </ScrollArea>
                </Card>
              )}

              {tab === "raw" && (
                <Card className="flex-1 min-h-0 overflow-hidden">
                  <JsonMonacoViewer
                    className="h-full min-h-0"
                    value={JSON.stringify(job, null, 2)}
                  />
                </Card>
              )}
            </div>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Job Info</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Branch</span>
                <span className="font-mono text-xs truncate max-w-[9rem]">{job.branch ?? "—"}</span>
              </div>
              {job.error && (
                <div className="text-destructive text-xs break-words rounded border border-destructive/30 bg-destructive/5 p-2">
                  {job.error}
                </div>
              )}
              {job.mrUrl && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">MR</span>
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <a href={job.mrUrl} target="_blank" rel="noreferrer">
                      View MR <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tokens</span>
                <span>{job.tokensUsed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span>${job.costUsd.toFixed(4)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-xs">{new Date(job.createdAt).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <JobActions
                job={job}
                onActionComplete={refreshJob}
                onDeleted={() => navigate("/jobs")}
                onError={setError}
              />
            </CardContent>
          </Card>

          {/* Pending approvals */}
          {job.approvals.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Pending Approvals</h3>
              {job.approvals.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onResolved={() => getJob(id!).then(setJob).catch(console.error)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConsoleTab({ events }: { events: JobEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const consoleEvents = events.filter(
    (e) =>
      e.type === "agent_output" ||
      e.type === "approval_requested" ||
      e.type === "agent_done" ||
      e.type === "step_error",
  );

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleEvents.length, autoScroll]);

  return (
    <Card className="flex-1 min-h-0 overflow-hidden flex flex-col bg-black text-green-400 font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
        <span className="text-muted-foreground">Agent Console</span>
        <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="h-3 w-3"
          />
          Auto-scroll
        </label>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-1">
          {consoleEvents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Waiting for agent output...</p>
          ) : (
            consoleEvents.map((e, i) => (
              <div key={e.id ?? i} className="break-all">
                <span className="text-muted-foreground mr-2">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span
                  className={
                    e.type === "approval_requested"
                      ? "text-yellow-400"
                      : e.type === "agent_done"
                        ? "text-blue-400"
                        : e.type === "step_error" || e.level === "error"
                          ? "text-red-400"
                          : ""
                  }
                >
                  {e.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </Card>
  );
}
