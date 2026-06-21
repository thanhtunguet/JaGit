import { describe, it, expect } from "vitest";
import { buildAcpMcpServers, isAcpMcpServerHttp, buildReportInstruction } from "./mcp-servers.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const jagitServerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "worker",
  "dist",
  "mcp",
  "jagit-server.js",
);

describe("buildAcpMcpServers", () => {
  it("always includes built-in jagit server", async () => {
    const servers = await buildAcpMcpServers({
      template: { mcpServerIds: [], requireReviewBeforeCommit: true },
      dbConfigs: [],
      jobContext: {
        jobId: "job-1",
        redisUrl: "redis://localhost",
        publicBaseUrl: "http://localhost:3000",
        dashboardApiToken: "tok",
        jagitServerPath,
        approvalTimeoutMs: 1800000,
      },
      resolveCredential: async () => ({}),
    });

    expect(servers.some((s) => s.name === "jagit")).toBe(true);
    const jagit = servers.find((s) => s.name === "jagit")!;
    expect(isAcpMcpServerHttp(jagit)).toBe(false);
    if (!isAcpMcpServerHttp(jagit)) {
      expect(jagit.command).toBe("node");
      expect(jagit.args[0]).toBe(jagitServerPath);
      expect(jagit.env.find((e) => e.name === "JAGIT_JOB_ID")?.value).toBe("job-1");
    }
  });

  it("appends enabled template MCP configs with resolved env", async () => {
    const servers = await buildAcpMcpServers({
      template: { mcpServerIds: ["mcp-1"], requireReviewBeforeCommit: false },
      dbConfigs: [
        {
          id: "mcp-1",
          name: "extra",
          transport: "stdio",
          command: "npx",
          args: ["-y", "some-mcp"],
          env: {
            KEY: "literal",
            TOKEN: { type: "credential", kind: "gitlab", name: "default", secretKey: "token" },
          },
          url: null,
          headers: {},
          enabled: true,
        },
      ],
      jobContext: {
        jobId: "job-2",
        redisUrl: "redis://x",
        publicBaseUrl: "http://localhost:3000",
        dashboardApiToken: "tok",
        jagitServerPath,
        approvalTimeoutMs: 1800000,
      },
      resolveCredential: async () => ({ token: "resolved" }),
    });

    const extra = servers.find((s) => s.name === "extra");
    expect(extra).toBeDefined();
    expect(isAcpMcpServerHttp(extra!)).toBe(false);
    if (!isAcpMcpServerHttp(extra!)) {
      expect(extra!.env).toEqual(
        expect.arrayContaining([
          { name: "KEY", value: "literal" },
          { name: "TOKEN", value: "resolved" },
        ]),
      );
    }
  });

  it("builds http MCP server with resolved headers", async () => {
    const servers = await buildAcpMcpServers({
      template: { mcpServerIds: ["mcp-http"], requireReviewBeforeCommit: false },
      dbConfigs: [
        {
          id: "mcp-http",
          name: "remote",
          transport: "http",
          command: "",
          args: [],
          env: {},
          url: "https://mcp.example.com/v1",
          headers: {
            Authorization: { type: "credential", kind: "anthropic", name: "default", secretKey: "apiKey" },
          },
          enabled: true,
        },
      ],
      jobContext: {
        jobId: "job-http",
        redisUrl: "redis://x",
        publicBaseUrl: "http://localhost:3000",
        dashboardApiToken: "tok",
        jagitServerPath,
        approvalTimeoutMs: 1800000,
      },
      resolveCredential: async () => ({ apiKey: "sk-test" }),
    });

    const remote = servers.find((s) => s.name === "remote");
    expect(remote).toBeDefined();
    expect(isAcpMcpServerHttp(remote!)).toBe(true);
    if (isAcpMcpServerHttp(remote!)) {
      expect(remote.url).toBe("https://mcp.example.com/v1");
      expect(remote.headers).toEqual([{ name: "Authorization", value: "sk-test" }]);
    }
  });

  it("skips disabled MCP configs", async () => {
    const servers = await buildAcpMcpServers({
      template: { mcpServerIds: ["mcp-2"], requireReviewBeforeCommit: false },
      dbConfigs: [
        {
          id: "mcp-2",
          name: "disabled",
          transport: "stdio",
          command: "echo",
          args: [],
          env: {},
          url: null,
          headers: {},
          enabled: false,
        },
      ],
      jobContext: {
        jobId: "job-3",
        redisUrl: "redis://x",
        publicBaseUrl: "http://localhost:3000",
        dashboardApiToken: "tok",
        jagitServerPath,
        approvalTimeoutMs: 1800000,
      },
      resolveCredential: async () => ({}),
    });

    expect(servers.find((s) => s.name === "disabled")).toBeUndefined();
  });
});

describe("buildReportInstruction", () => {
  it("instructs the agent to summarize its work for a non-technical reader", () => {
    const instruction = buildReportInstruction();
    expect(instruction).toContain("summary");
    expect(instruction).toContain("non-technical");
  });
});
