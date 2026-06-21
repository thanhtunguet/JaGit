import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listUsageUsers, type UsageUser, getLatestUpload, type UsageUpload, type UsageData, type AgentSessionAggregateResponse } from "@/api/client.js";
import { useUsageData, type Period } from "@/hooks/useUsageData.js";
import { UserSelector } from "@/components/usage/UserSelector.js";
import { PeriodToggle } from "@/components/usage/PeriodToggle.js";
import { SummaryCards } from "@/components/usage/SummaryCards.js";
import { DailyChart } from "@/components/usage/DailyChart.js";
import { ActivityChart } from "@/components/usage/ActivityChart.js";
import { ModelsChart } from "@/components/usage/ModelsChart.js";
import { ProjectsChart } from "@/components/usage/ProjectsChart.js";
import { SessionsTable } from "@/components/usage/SessionsTable.js";
import { ToolsChart } from "@/components/usage/ToolsChart.js";
import { ShellCommandsChart } from "@/components/usage/ShellCommandsChart.js";
import { LiveSessionsTab } from "@/components/sessions/LiveSessionsTab.js";
import { SessionSummaryCards } from "@/components/sessions/SessionSummaryCards.js";
import { LiveSessionsCharts } from "@/components/sessions/LiveSessionsCharts.js";

type UsageTab = "historical" | "sessions";

function HistoricalView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UsageUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const selectedUser = searchParams.get("u") ?? null;
  const [period, setPeriod] = useState<Period>("30 Days");

  const { data, loading, error } = useUsageData(selectedUser, period);

  const [globalTotal, setGlobalTotal] = useState<number>(0);
  const [globalAgg, setGlobalAgg] = useState<AgentSessionAggregateResponse | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => {
    listUsageUsers()
      .then(setUsers)
      .catch((e: Error) => setUsersError(e.message))
      .finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      if (users.length === 0) {
        setGlobalTotal(0);
        setGlobalAgg(null);
        return;
      }
      
      setGlobalLoading(true);

      Promise.all(
        users.map((u) => getLatestUpload(u.username).then((upload) => ({ username: u.username, upload })))
      )
        .then((results) => {
          let totalSessions = 0;
          let totalCostUsd = 0;
          const totalTokens = { newInput: 0, cachedInput: 0, output: 0 };
          
          const byUserMap = new Map<string, number>();
          const byModelMap = new Map<string, number>();
          const byToolMap = new Map<string, number>();

          for (const { username, upload } of results) {
            if ("data" in upload && upload.data === null) continue;
            const uData = (upload as UsageUpload).data;
            if (!uData) continue;
            
            const summaryRow = uData.summary?.find((r) => r.Period === period);
            if (summaryRow) {
              totalSessions += summaryRow.Sessions || 0;
              totalCostUsd += summaryRow["Cost (USD)"] || 0;
              byUserMap.set(username, summaryRow["Cost (USD)"] || 0);
            }
            
            const modelRows = uData.models?.filter((r) => r.Period === period) || [];
            for (const m of modelRows) {
              const cost = m["Cost (USD)"] || 0;
              byModelMap.set(m.Model, (byModelMap.get(m.Model) || 0) + cost);
              
              totalTokens.newInput += (m["Input Tokens"] || 0) + (m["Cache Write Tokens"] || 0);
              totalTokens.cachedInput += (m["Cache Read Tokens"] || 0);
              totalTokens.output += (m["Output Tokens"] || 0);
            }
            
            const toolRows = uData.tools || [];
            for (const t of toolRows) {
              // Faking costUsd as calls for the pie chart
              byToolMap.set(t.Tool, (byToolMap.get(t.Tool) || 0) + (t.Calls || 0));
            }
          }

          const byUser = Array.from(byUserMap.entries())
            .map(([username, costUsd]) => ({ username, costUsd }))
            .sort((a, b) => b.costUsd - a.costUsd);

          const byModel = Array.from(byModelMap.entries())
            .map(([model, costUsd]) => ({ model, costUsd }))
            .sort((a, b) => b.costUsd - a.costUsd);

          const byTool = Array.from(byToolMap.entries())
            .map(([tool, costUsd]) => ({ tool, costUsd }))
            .sort((a, b) => b.costUsd - a.costUsd);

          setGlobalTotal(totalSessions);
          setGlobalAgg({
            byUser,
            byModel,
            byTool,
            totalTokens,
            totalCostUsd,
            missingCostCount: 0,
          });
        })
        .catch(console.error)
        .finally(() => setGlobalLoading(false));
    }
  }, [selectedUser, period, users]);

  const handleSelectUser = useCallback(
    (username: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (username) {
          next.set("u", username);
        } else {
          next.delete("u");
        }
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSearchParams(params);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setSearchParams]);

  const usernames = users.map((u) => u.username);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0 overflow-x-auto pb-2 -mb-2 custom-scrollbar">
          {usersLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : usersError ? (
            <p className="text-sm text-destructive">{usersError}</p>
          ) : (
            <UserSelector users={usernames} selected={selectedUser} onSelect={handleSelectUser} />
          )}
        </div>
        <div className="flex-shrink-0 pb-2 -mb-2">
          <PeriodToggle selected={period} onChange={setPeriod} />
        </div>
      </div>

      {!selectedUser && globalLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!selectedUser && !globalLoading && (
        <div className="space-y-4">
          <SessionSummaryCards total={globalTotal} aggData={globalAgg} />
          {globalAgg && <LiveSessionsCharts data={globalAgg} />}
        </div>
      )}

      {selectedUser && loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {selectedUser && error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {selectedUser && data && (
        <div className="space-y-4">
          <SummaryCards rows={data.summary} period={period} />

          <DailyChart rows={data.daily} period={period} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ActivityChart rows={data.activity} period={period} />
            <ModelsChart rows={data.models} period={period} />
          </div>

          <ProjectsChart rows={data.projects} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ToolsChart rows={data.tools} />
            <ShellCommandsChart rows={data.shellCommands} />
          </div>

          <SessionsTable rows={data.sessions} />
        </div>
      )}
    </div>
  );
}

export function Usage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: UsageTab = tabParam === "historical" ? "historical" : "sessions";

  const handleTabChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === "sessions") {
        next.delete("tab");
      } else {
        next.set("tab", value);
      }
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">AI Usage</h2>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="sessions">Live Sessions</TabsTrigger>
          <TabsTrigger value="historical">Historical (CodeBurn)</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <LiveSessionsTab />
        </TabsContent>

        <TabsContent value="historical">
          <HistoricalView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
