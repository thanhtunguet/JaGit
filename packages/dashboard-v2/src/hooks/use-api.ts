import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

// ─── Query hooks ─────────────────────────────────────────────────────────────

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: api.listJobs,
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ["job", id],
    queryFn: () => api.getJob(id!),
    enabled: !!id,
  });
}

export function useOverviewStats() {
  return useQuery({
    queryKey: ["stats", "overview"],
    queryFn: api.getOverviewStats,
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: api.listPendingApprovals,
  });
}

export function useCredentials() {
  return useQuery({
    queryKey: ["config", "credentials"],
    queryFn: api.listCredentials,
  });
}

export function useRepoMappings() {
  return useQuery({
    queryKey: ["config", "repo-mappings"],
    queryFn: api.listRepoMappings,
  });
}

export function useAgentTemplates() {
  return useQuery({
    queryKey: ["config", "agent-templates"],
    queryFn: api.listAgentTemplates,
  });
}

export function useMcpServers() {
  return useQuery({
    queryKey: ["config", "mcp-servers"],
    queryFn: api.listMcpServers,
  });
}

export function useUsageUsers() {
  return useQuery({
    queryKey: ["usage", "users"],
    queryFn: api.listUsageUsers,
  });
}

export function useUsageData(username: string | undefined, period: string) {
  return useQuery({
    queryKey: ["usage", "data", username, period],
    queryFn: async () => {
      const upload = await api.getLatestUpload(username!);
      if ("data" in upload && upload.data === null) {
        return null;
      }
      const uploadData = upload as { data: api.UsageData };
      return {
        summary: uploadData.data.summary.filter((r) => r.Period === period),
        daily: uploadData.data.daily.filter((r) => r.Period === period),
        activity: uploadData.data.activity.filter((r) => r.Period === period),
        models: uploadData.data.models.filter((r) => r.Period === period),
        projects: uploadData.data.projects,
        sessions: uploadData.data.sessions,
        tools: uploadData.data.tools,
        shellCommands: uploadData.data.shellCommands,
      };
    },
    enabled: !!username,
  });
}

export function useHistoricalOverview(users: api.UsageUser[], period: string) {
  return useQuery({
    queryKey: ["usage", "historical-overview", users.map((u) => u.username).join(","), period],
    queryFn: async () => {
      const results = await Promise.all(
        users.map(async (u) => {
          try {
            const upload = await api.getLatestUpload(u.username);
            return { username: u.username, upload };
          } catch {
            return { username: u.username, upload: { data: null } };
          }
        }),
      );

      let totalSessions = 0;
      let totalCostUsd = 0;
      let totalSavedUsd = 0;
      let totalApiCalls = 0;
      let totalProjects = 0;
      const totalTokens = { newInput: 0, cachedInput: 0, output: 0 };

      const byUserMap = new Map<string, number>();
      const byModelMap = new Map<string, number>();
      const byActivityMap = new Map<string, number>();
      const byToolMap = new Map<string, number>();
      const dailyMap = new Map<string, { cost: number; sessions: number; input: number; output: number }>();

      for (const { username, upload } of results) {
        if ("data" in upload && upload.data === null) continue;
        const uData = (upload as { data: api.UsageData }).data;
        if (!uData) continue;

        const summaryRow = uData.summary?.find((r) => r.Period === period);
        if (summaryRow) {
          totalSessions += summaryRow.Sessions || 0;
          totalCostUsd += summaryRow["Cost (USD)"] || 0;
          totalSavedUsd += summaryRow["Saved (USD)"] || 0;
          totalApiCalls += summaryRow["API Calls"] || 0;
          totalProjects += summaryRow.Projects || 0;
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

        const activityRows = uData.activity?.filter((r) => r.Period === period) || [];
        for (const a of activityRows) {
          const cost = a["Cost (USD)"] || 0;
          byActivityMap.set(a.Activity, (byActivityMap.get(a.Activity) || 0) + cost);
        }

        const toolRows = uData.tools || [];
        for (const t of toolRows) {
          byToolMap.set(t.Tool, (byToolMap.get(t.Tool) || 0) + (t.Calls || 0));
        }

        const dailyRows = uData.daily?.filter((r) => r.Period === period) || [];
        for (const d of dailyRows) {
          const dt = d.Date;
          if (!dt) continue;
          const curr = dailyMap.get(dt) || { cost: 0, sessions: 0, input: 0, output: 0 };
          curr.cost += d["Cost (USD)"] || 0;
          curr.sessions += d.Sessions || 0;
          curr.input += (d["Input Tokens"] || 0) + (d["Cache Write Tokens"] || 0);
          curr.output += d["Output Tokens"] || 0;
          dailyMap.set(dt, curr);
        }
      }

      const byUser = Array.from(byUserMap.entries())
        .map(([name, val]) => ({ name, value: val || 1, cost: val }))
        .sort((a, b) => (b.cost || 0) - (a.cost || 0));

      const byModel = Array.from(byModelMap.entries())
        .map(([name, val]) => ({ name, value: val || 1, cost: val }))
        .sort((a, b) => (b.cost || 0) - (a.cost || 0));

      const byActivity = Array.from(byActivityMap.entries())
        .map(([name, val]) => ({ name, value: val || 1, cost: val }))
        .sort((a, b) => (b.cost || 0) - (a.cost || 0));

      const byTool = Array.from(byToolMap.entries())
        .map(([name, val]) => ({ name, value: val || 1, cost: val }))
        .sort((a, b) => (b.cost || 0) - (a.cost || 0));

      const daily = Array.from(dailyMap.entries())
        .map(([Date, vals]) => ({
          Date,
          "Cost (USD)": vals.cost,
          Sessions: vals.sessions,
          "Input Tokens": vals.input,
          "Output Tokens": vals.output,
        }))
        .sort((a, b) => a.Date.localeCompare(b.Date));

      return {
        totalSessions,
        totalCostUsd,
        totalSavedUsd,
        totalApiCalls,
        totalProjects,
        totalTokens,
        byUser,
        byModel,
        byActivity,
        byTool,
        daily,
      };
    },
    enabled: users.length > 0,
  });
}

export function useAgentSessions(filters: api.AgentSessionFilters = {}) {
  return useQuery({
    queryKey: ["agent-sessions", filters],
    queryFn: () => api.listAgentSessions(filters),
  });
}

export function useAgentSessionAggregate(
  filters: Omit<api.AgentSessionFilters, "limit" | "offset"> = {},
) {
  return useQuery({
    queryKey: ["agent-sessions", "aggregate", filters],
    queryFn: () => api.aggregateAgentSessions(filters),
  });
}

export function useAgentSession(id: string | null) {
  return useQuery({
    queryKey: ["agent-sessions", "detail", id],
    queryFn: () => api.getAgentSession(id!),
    enabled: !!id,
  });
}

// ─── Mutation hooks ──────────────────────────────────────────────────────────

export function useControlJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "stop" | "pause" | "resume" }) =>
      api.controlJob(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retryJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useDecideApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, optionId }: { id: string; optionId: string }) =>
      api.decideApproval(id, optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });
}

// ─── Config mutations ────────────────────────────────────────────────────────

export function useCreateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: api.CredentialCreateBody) => api.createCredential(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "credentials"] }),
  });
}

export function useUpdateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<api.CredentialCreateBody, "kind"> }) =>
      api.updateCredential(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "credentials"] }),
  });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteCredential(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "credentials"] }),
  });
}

export function useCreateRepoMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<api.RepoMappingItem, "id" | "agentTemplate">) => api.createRepoMapping(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "repo-mappings"] }),
  });
}

export function useUpdateRepoMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<api.RepoMappingItem, "id" | "agentTemplate"> }) =>
      api.updateRepoMapping(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "repo-mappings"] }),
  });
}

export function useDeleteRepoMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRepoMapping(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "repo-mappings"] }),
  });
}

export function useCreateAgentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<api.AgentTemplateItem, "id">) => api.createAgentTemplate(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "agent-templates"] }),
  });
}

export function useUpdateAgentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Omit<api.AgentTemplateItem, "id"> }) =>
      api.updateAgentTemplate(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "agent-templates"] }),
  });
}

export function useDeleteAgentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAgentTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "agent-templates"] }),
  });
}

export function useCreateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: api.McpServerInput) => api.createMcpServer(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "mcp-servers"] }),
  });
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: api.McpServerInput }) =>
      api.updateMcpServer(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "mcp-servers"] }),
  });
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMcpServer(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", "mcp-servers"] }),
  });
}

