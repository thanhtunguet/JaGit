import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getJob,
  controlJob,
  useSSE,
  type JobDetail as JobDetailType,
  type JobEvent,
} from "@/api/client";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EventRow } from "@/components/EventRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { CheckCircle2, Circle, XCircle, Loader2, ExternalLink, Terminal } from "lucide-react";

const STEP_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  running: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
};

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlling, setControlling] = useState(false);
  const liveEvents = useSSE<{ type: string; event?: JobEvent }>(id!);

  useEffect(() => {
    getJob(id!).then(setJob).catch((e) => setError(e.message));
  }, [id]);

  const control = async (action: "stop" | "pause" | "resume") => {
    setControlling(true);
    try {
      await controlJob(id!, action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setControlling(false);
    }
  };

  const allEvents: JobEvent[] = [
    ...(job?.events ?? []),
    ...liveEvents.flatMap((e) => (e.event ? [e.event] : [])),
  ];

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold font-mono">{job.jiraIssueKey ?? job.id}</h2>
        <JobStatusBadge status={job.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Timeline + Events */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="console">
                <Terminal className="h-3 w-3 mr-1" />
                Console
              </TabsTrigger>
              <TabsTrigger value="events">Events ({allEvents.length})</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="space-y-3 mt-4">
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
            </TabsContent>

            <TabsContent value="events" className="mt-4">
              <Card>
                <ScrollArea className="h-96">
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
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              <Card>
                <ScrollArea className="h-96">
                  <pre className="text-xs p-4 font-mono">{JSON.stringify(job, null, 2)}</pre>
                </ScrollArea>
              </Card>
            </TabsContent>
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
            <CardContent className="flex gap-2 flex-wrap">
              {job.status === "running" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={controlling}
                    onClick={() => control("pause")}
                  >
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={controlling}
                    onClick={() => control("stop")}
                  >
                    Stop
                  </Button>
                </>
              )}
              {job.status === "paused" && (
                <Button size="sm" disabled={controlling} onClick={() => control("resume")}>
                  Resume
                </Button>
              )}
              {["done", "stopped", "failed"].includes(job.status) && (
                <p className="text-xs text-muted-foreground">No controls available.</p>
              )}
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
    (e) => e.type === "agent_output" || e.type === "approval_requested" || e.type === "agent_done"
  );

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleEvents.length, autoScroll]);

  return (
    <Card className="bg-black text-green-400 font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
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
      <ScrollArea className="h-96">
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
                        : e.level === "error"
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
