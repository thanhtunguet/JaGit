import { useState, useEffect, useCallback } from "react";

/**
 * Connects to a job's SSE stream and accumulates events.
 *
 * @param jobId - The job ID to stream events for
 * @returns Array of parsed events of type T
 */
export function useSSE<T>(jobId: string) {
  const [events, setEvents] = useState<T[]>([]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.onmessage = (e) => {
      try {
        setEvents((prev) => [...prev, JSON.parse(e.data) as T]);
      } catch {
        /* ignore malformed events */
      }
    };
    return () => es.close();
  }, [jobId]);

  return events;
}

/**
 * Approval event shape from the SSE stream.
 */
export interface ApprovalEvent {
  type: string;
  approvalId: string;
  jobId: string;
  [key: string]: unknown;
}

/**
 * Connects to the approvals SSE stream and calls the callback on each event.
 *
 * @param onEvent - Callback invoked for each approval event
 */
export function useApprovalsSSE(onEvent: (evt: ApprovalEvent) => void) {
  const stableOnEvent = useCallback(onEvent, [onEvent]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/approvals/stream");
    es.onmessage = (e) => {
      try {
        stableOnEvent(JSON.parse(e.data));
      } catch {
        /* ignore malformed events */
      }
    };
    return () => es.close();
  }, [stableOnEvent]);
}
