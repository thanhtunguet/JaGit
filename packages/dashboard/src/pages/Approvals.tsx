import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listPendingApprovals,
  decideApproval,
  useApprovalsSSE,
} from "@/api/client";

type PendingApproval = Awaited<ReturnType<typeof listPendingApprovals>>[number];

export function Approvals() {
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});

  const reload = useCallback(() => {
    listPendingApprovals()
      .then(setItems)
      .catch(console.error);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Remove resolved or add requested events from the global SSE stream
  useApprovalsSSE(
    useCallback((evt) => {
      if (evt.type === "resolved") {
        setItems((prev) =>
          prev ? prev.filter((a) => a.id !== evt.approvalId) : prev,
        );
      } else if (evt.type === "approval_requested") {
        reload();
      }
    }, [reload]),
  );

  const decide = async (approvalId: string, optionId: string) => {
    setDeciding((d) => ({ ...d, [approvalId]: true }));
    try {
      await decideApproval(approvalId, optionId);
      setItems((prev) => prev ? prev.filter((a) => a.id !== approvalId) : prev);
    } catch (e) {
      console.error(e);
    } finally {
      setDeciding((d) => ({ ...d, [approvalId]: false }));
    }
  };

  const pendingCount = items?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Awaiting Approval</h2>
        {items !== null && (
          <Badge variant={pendingCount > 0 ? "destructive" : "secondary"}>
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {items === null ? (
        Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground py-12">
            No pending approvals. Waiting for agent activity…
          </CardContent>
        </Card>
      ) : (
        items.map((approval) => (
          <Card key={approval.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  Job {approval.job?.jiraIssueKey ?? approval.jobId}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {approval.kind}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{approval.prompt}</p>
              <div className="flex gap-2 flex-wrap">
                {(approval.options as { optionId: string; name: string }[]).map((opt) => (
                  <Button
                    key={opt.optionId}
                    size="sm"
                    variant={opt.optionId.startsWith("deny") || opt.optionId === "reject" ? "destructive" : "default"}
                    disabled={deciding[approval.id]}
                    onClick={() => decide(approval.id, opt.optionId)}
                  >
                    {opt.name}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Requested {new Date(approval.createdAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
