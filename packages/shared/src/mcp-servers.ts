import { resolveMcpEnv, type CredentialResolver, type McpEnvValue } from "./mcp-config.js";

export interface AcpMcpServer {
  name: string;
  command: string;
  args: string[];
  env: { name: string; value: string }[];
}

export interface McpServerConfigRow {
  id: string;
  name: string;
  command: string;
  args: unknown;
  env: unknown;
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
    jigitServerPath: string;
    approvalTimeoutMs: number;
  };
  resolveCredential: CredentialResolver;
}

function toEnvArray(env: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(env).map(([name, value]) => ({ name, value }));
}

function buildJigitServer(opts: BuildAcpMcpServersOpts): AcpMcpServer {
  const { jobContext } = opts;
  return {
    name: "jigit",
    command: "node",
    args: [jobContext.jigitServerPath],
    env: toEnvArray({
      JIGIT_JOB_ID: jobContext.jobId,
      REDIS_URL: jobContext.redisUrl,
      PUBLIC_BASE_URL: jobContext.publicBaseUrl,
      DASHBOARD_API_TOKEN: jobContext.dashboardApiToken,
      APPROVAL_TIMEOUT_MS: String(jobContext.approvalTimeoutMs),
    }),
  };
}

/** Build ACP session/new mcpServers: built-in jigit + template-linked configs. */
export async function buildAcpMcpServers(
  opts: BuildAcpMcpServersOpts,
): Promise<AcpMcpServer[]> {
  const servers: AcpMcpServer[] = [buildJigitServer(opts)];

  const idSet = new Set(opts.template.mcpServerIds);
  const selected = opts.dbConfigs.filter((c) => idSet.has(c.id) && c.enabled);

  for (const config of selected) {
    const args = Array.isArray(config.args) ? (config.args as string[]) : [];
    const envRecord: Record<string, McpEnvValue> =
      config.env && typeof config.env === "object" && !Array.isArray(config.env)
        ? (config.env as Record<string, McpEnvValue>)
        : {};

    const resolved = await resolveMcpEnv(envRecord, opts.resolveCredential);

    servers.push({
      name: config.name,
      command: config.command,
      args,
      env: toEnvArray(resolved),
    });
  }

  return servers;
}

/** Instruction appended to agent prompt when review before commit is required. */
export function buildReviewInstruction(): string {
  return [
    "Before you finish your work, you MUST call the MCP tool `jigit_request_review`",
    "with a summary of your changes and wait for human approval.",
    "Do not consider the task complete until review is approved.",
  ].join(" ");
}
