import { Badge } from "@/components/ui/badge";
import type { JobEvent } from "@/api/client";

const LEVEL_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary",
  warn: "outline",
  error: "destructive",
};

export function EventRow({ event }: { event: JobEvent }) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-sm border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground whitespace-nowrap w-[5.5rem] shrink-0 pt-0.5">
        {new Date(event.ts).toLocaleTimeString()}
      </span>
      <Badge variant={LEVEL_VARIANT[event.level] ?? "secondary"} className="shrink-0 text-xs">
        {event.level}
      </Badge>
      <span className="font-mono text-xs text-muted-foreground shrink-0 w-32">{event.type}</span>
      <span className="text-foreground break-all">{event.message}</span>
    </div>
  );
}
