import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listUsageUsers, type UsageUser } from "@/api/client.js";
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

type UsageTab = "historical" | "sessions";

function HistoricalView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UsageUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const selectedUser = searchParams.get("u") ?? null;
  const [period, setPeriod] = useState<Period>("30 Days");

  const { data, loading, error } = useUsageData(selectedUser, period);

  useEffect(() => {
    listUsageUsers()
      .then(setUsers)
      .catch((e: Error) => setUsersError(e.message))
      .finally(() => setUsersLoading(false));
  }, []);

  const handleSelectUser = useCallback(
    (username: string) => {
      setSearchParams({ u: username });
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
      <div className="flex items-center justify-end">
        <PeriodToggle selected={period} onChange={setPeriod} />
      </div>

      {usersLoading ? (
        <Skeleton className="h-8 w-64" />
      ) : usersError ? (
        <p className="text-sm text-destructive">{usersError}</p>
      ) : (
        <UserSelector users={usernames} selected={selectedUser} onSelect={handleSelectUser} />
      )}

      {!selectedUser && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select a user to view usage data.</p>
          </CardContent>
        </Card>
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
          <SessionsTable rows={data.sessions} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ToolsChart rows={data.tools} />
            <ShellCommandsChart rows={data.shellCommands} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Usage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: UsageTab = tabParam === "sessions" ? "sessions" : "historical";

  const handleTabChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === "historical") {
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
          <TabsTrigger value="historical">Historical (CodeBurn)</TabsTrigger>
          <TabsTrigger value="sessions">Live Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="historical">
          <HistoricalView />
        </TabsContent>

        <TabsContent value="sessions">
          <LiveSessionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
