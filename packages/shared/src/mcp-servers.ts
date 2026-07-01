import { resolveMcpEnv, type CredentialResolver, type McpEnvValue } from "./mcp-config.js";

export interface AcpMcpServerStdio {
  name: string;
  command: string;
  args: string[];
  env: { name: string; value: string }[];
}

export interface AcpMcpServerHttp {
  type: "http";
  name: string;
  url: string;
  headers: { name: string; value: string }[];
}

export type AcpMcpServer = AcpMcpServerStdio | AcpMcpServerHttp;

export function isAcpMcpServerHttp(server: AcpMcpServer): server is AcpMcpServerHttp {
  return "type" in server && server.type === "http";
}

export interface McpServerConfigRow {
  id: string;
  name: string;
  transport: string;
  command: string;
  args: unknown;
  env: unknown;
  url: string | null;
  headers: unknown;
  enabled: boolean;
}

export interface BuildAcpMcpServersOpts {
  template: {
    mcpServerIds: string[];
    requireReviewBeforeCommit: boolean;
  };
  dbConfigs: McpServerConfigRow[];
  jobContext: {
    jobId: string;
    redisUrl: string;
    publicBaseUrl: string;
    dashboardApiToken: string;
    jagitServerPath: string;
    approvalTimeoutMs: number;
  };
  resolveCredential: CredentialResolver;
}

function toKeyValueArray(map: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

function parseKeyValues(raw: unknown): Record<string, McpEnvValue> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, McpEnvValue>;
  }
  return {};
}

function buildJagitServer(opts: BuildAcpMcpServersOpts): AcpMcpServerStdio {
  const { jobContext } = opts;
  return {
    name: "jagit",
    command: "node",
    args: [jobContext.jagitServerPath],
    env: toKeyValueArray({
      JAGIT_JOB_ID: jobContext.jobId,
      REDIS_URL: jobContext.redisUrl,
      PUBLIC_BASE_URL: jobContext.publicBaseUrl,
      DASHBOARD_API_TOKEN: jobContext.dashboardApiToken,
      APPROVAL_TIMEOUT_MS: String(jobContext.approvalTimeoutMs),
    }),
  };
}

/** Build ACP session/new mcpServers: built-in jagit + template-linked configs. */
export async function buildAcpMcpServers(
  opts: BuildAcpMcpServersOpts,
): Promise<AcpMcpServer[]> {
  const servers: AcpMcpServer[] = [buildJagitServer(opts)];

  const idSet = new Set(opts.template.mcpServerIds);
  const selected = opts.dbConfigs.filter((c) => idSet.has(c.id) && c.enabled);

  for (const config of selected) {
    const transport = config.transport === "http" ? "http" : "stdio";

    if (transport === "http") {
      if (!config.url) continue;
      const resolvedHeaders = await resolveMcpEnv(
        parseKeyValues(config.headers),
        opts.resolveCredential,
      );
      servers.push({
        type: "http",
        name: config.name,
        url: config.url,
        headers: toKeyValueArray(resolvedHeaders),
      });
      continue;
    }

    const args = Array.isArray(config.args) ? (config.args as string[]) : [];
    const resolvedEnv = await resolveMcpEnv(
      parseKeyValues(config.env),
      opts.resolveCredential,
    );

    servers.push({
      name: config.name,
      command: config.command,
      args,
      env: toKeyValueArray(resolvedEnv),
    });
  }

  return servers;
}

/** Instruction appended to agent prompt when review before commit is required. */
export function buildReviewInstruction(): string {
  return [
    "Before you finish your work, you MUST call the MCP tool `jagit_request_review`",
    "with a summary of your changes and wait for human approval.",
    "Do not consider the task complete until review is approved.",
  ].join(" ");
}

/** Instruction appended to every agent prompt so its final message can be relayed as the job's status report. */
export function buildReportInstruction(): string {
  return [
    "End your final message with a concise 2-4 sentence summary of what you changed",
    "and why, written for a non-technical reader — it will be relayed to them directly.",
  ].join(" ");
}
