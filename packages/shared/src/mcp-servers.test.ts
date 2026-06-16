import { describe, it, expect } from "vitest";
import { buildAcpMcpServers } from "./mcp-servers.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const jigitServerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "worker",
  "dist",
  "mcp",
  "jigit-server.js",
);

describe("buildAcpMcpServers", () => {
  it("always includes built-in jigit server", async () => {
    const servers = await buildAcpMcpServers({
      template: { mcpServerIds: [], requireReviewBeforeCommit: true },
      dbConfigs: [],
      jobContext: {
        jobId: "job-1",
        redisUrl: "redis://localhost",
        publicBaseUrl: "http://localhost:3000",
        dashboardApiToken: "tok",
        jigitServerPath,
        approvalTimeoutMs: 1800000,
      },
      resolveCredential: async () => ({}),
    });

    expect(servers.some((s) => s.name === "jigit")).toBe(true);
    const jigit = servers.find((s) => s.name === "jigit")!;
    expect(jigit.command).toBe("node");
    expect(jigit.args[0]).toBe(jigitServerPath);
    expect(jigit.env.find((e) => e.name === "JIGIT_JOB_ID")?.value).toBe("job-1");
  });

  it("appends enabled template MCP configs with resolved env", async () => {
    const servers = await buildAcpMcpServers({
      template: { mcpServerIds: ["mcp-1"], requireReviewBeforeCommit: false },
      dbConfigs: [
        {
          id: "mcp-1",
          name: "extra",
          command: "npx",
          args: ["-y", "some-mcp"],
          env: {
            KEY: "literal",
            TOKEN: { type: "credential", kind: "gitlab", name: "default", secretKey: "token" },
          },
          enabled: true,
        },
      ],
      jobContext: {
        jobId: "job-2",
        redisUrl: "redis://x",
        publicBaseUrl: "http://localhost:3000",
        dashboardApiToken: "tok",
        jigitServerPath,
        approvalTimeoutMs: 1800000,
      },
      resolveCredential: async () => ({ token: "resolved" }),
    });

    const extra = servers.find((s) => s.name === "extra");
    expect(extra).toBeDefined();
    expect(extra!.env).toEqual(
      expect.arrayContaining([
        { name: "KEY", value: "literal" },
        { name: "TOKEN", value: "resolved" },
      ]),
    );
  });

  it("skips disabled MCP configs", async () => {
    const servers = await buildAcpMcpServers({
      template: { mcpServerIds: ["mcp-2"], requireReviewBeforeCommit: false },
      dbConfigs: [
        {
          id: "mcp-2",
          name: "disabled",
          command: "echo",
          args: [],
          env: {},
          enabled: false,
        },
      ],
      jobContext: {
        jobId: "job-3",
        redisUrl: "redis://x",
        publicBaseUrl: "http://localhost:3000",
        dashboardApiToken: "tok",
        jigitServerPath,
        approvalTimeoutMs: 1800000,
      },
      resolveCredential: async () => ({}),
    });

    expect(servers.find((s) => s.name === "disabled")).toBeUndefined();
  });
});
