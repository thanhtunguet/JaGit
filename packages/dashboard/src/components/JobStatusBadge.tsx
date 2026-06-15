import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  cloning: "secondary",
  running: "default",
  awaiting_approval: "outline",
  pushing: "default",
  opening_mr: "default",
  reporting: "default",
  done: "secondary",
  paused: "outline",
  stopped: "destructive",
  failed: "destructive",
};

export function JobStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>{status.replace("_", " ")}</Badge>;
}
