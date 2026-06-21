import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listAgentSessions,
  aggregateAgentSessions,
  listUsageUsers,
  type AgentSessionListResponse,
  type AgentSessionAggregateResponse,
  type AgentSessionTool,
  type UsageUser,
} from "@/api/client.js";
import { SessionsFilters, type SessionsFiltersValue } from "./SessionsFilters.js";
import { SessionSummaryCards } from "./SessionSummaryCards.js";
import { LiveSessionsCharts } from "./LiveSessionsCharts.js";
import { LiveSessionsTable } from "./LiveSessionsTable.js";
import { SessionDetailDrawer } from "./SessionDetailDrawer.js";

const PAGE_SIZE = 50;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function LiveSessionsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UsageUser[]>([]);
  const [data, setData] = useState<AgentSessionListResponse | null>(null);
  const [aggData, setAggData] = useState<AgentSessionAggregateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Ensure default from/to are present in the URL on first mount.
  useEffect(() => {
    if (!searchParams.get("from") || !searchParams.get("to")) {
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const next = new URLSearchParams(searchParams);
      if (!next.get("from")) next.set("from", isoDate(weekAgo));
      if (!next.get("to")) next.set("to", isoDate(today));
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listUsageUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const tool = (searchParams.get("tool") ?? "") as "" | AgentSessionTool;
  const username = searchParams.get("user") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const page = Number(searchParams.get("page") ?? "0") || 0;

  const filters: SessionsFiltersValue = { tool, username, from, to };

  const handleFilterChange = useCallback(
    (patch: Partial<SessionsFiltersValue>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        const paramKey = key === "username" ? "user" : key;
        if (value) {
          next.set(paramKey, value);
        } else {
          next.delete(paramKey);
        }
      }
      next.set("page", "0");
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const handlePageChange = useCallback(
    (p: number) => {
      const next = new URLSearchParams(searchParams);
      next.set("page", String(p));
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  // Fetch list when page changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    listAgentSessions({
      tool: tool || undefined,
      username: username || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tool, username, from, to, page]);

  // Fetch aggregate data when filters (except page) change
  useEffect(() => {
    aggregateAgentSessions({
      tool: tool || undefined,
      username: username || undefined,
      from: from || undefined,
      to: to || undefined,
    }).then(setAggData).catch(console.error);
  }, [tool, username, from, to]);

  const usernames = useMemo(() => users.map((u) => u.username), [users]);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <SessionsFilters {...filters} usernames={usernames} onChange={handleFilterChange} />

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && (
        <>
          <SessionSummaryCards rows={rows} total={total} />
          {aggData && <LiveSessionsCharts data={aggData} />}
          <LiveSessionsTable
            rows={rows}
            page={page}
            pageCount={pageCount}
            onPageChange={handlePageChange}
            onRowClick={setSelectedId}
          />
        </>
      )}

      <SessionDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

