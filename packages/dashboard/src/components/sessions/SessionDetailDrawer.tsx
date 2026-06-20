import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentSession, type AgentSessionRow } from "@/api/client.js";

interface Props {
  id: string | null;
  onClose: () => void;
}

export function SessionDetailDrawer({ id, onClose }: Props) {
  const [row, setRow] = useState<AgentSessionRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setRow(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getAgentSession(id)
      .then(setRow)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const fields: { label: string; value: React.ReactNode }[] | null = row
    ? [
        { label: "ID", value: row.id },
        { label: "Session ID", value: row.sessionId },
        { label: "User", value: row.user.username },
        { label: "Tool", value: row.tool },
        { label: "Model", value: row.model },
        { label: "Input tokens", value: row.inputTokens.toLocaleString() },
        { label: "Cached input tokens", value: row.cachedInputTokens.toLocaleString() },
        { label: "Output tokens", value: row.outputTokens.toLocaleString() },
        { label: "Cost (USD)", value: row.costUsd == null ? "—" : `$${row.costUsd.toFixed(2)}` },
        { label: "Tool calls", value: row.toolCallCount ?? "—" },
        { label: "Started at", value: new Date(row.startedAt).toLocaleString() },
        { label: "Last updated at", value: new Date(row.lastUpdatedAt).toLocaleString() },
        { label: "Created at", value: new Date(row.createdAt).toLocaleString() },
      ]
    : null;

  return (
    <Dialog open={id != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session detail</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && row && fields && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {fields.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium break-all">{f.value}</dd>
                </div>
              ))}
            </dl>

            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Raw payload</summary>
              <pre className="text-xs overflow-auto mt-2 rounded-md bg-muted p-3">
                {JSON.stringify(row.rawPayload ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
