import { describe, it, expect } from "vitest";
import {
  McpServerConfigBodySchema,
  resolveMcpEnv,
  isApproveOptionId,
} from "./mcp-config.js";

describe("McpServerConfigBodySchema", () => {
  it("parses a valid stdio MCP server config", () => {
    const body = McpServerConfigBodySchema.parse({
      name: "filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: {
        FOO: "bar",
        TOKEN: { type: "credential", kind: "gitlab", name: "default", secretKey: "token" },
      },
      enabled: true,
    });
    expect(body.name).toBe("filesystem");
    expect(body.transport).toBe("stdio");
    expect(body.args).toHaveLength(3);
  });

  it("parses a valid http MCP server config", () => {
    const body = McpServerConfigBodySchema.parse({
      name: "remote-mcp",
      transport: "http",
      url: "https://mcp.example.com/v1",
      headers: {
        Authorization: { type: "credential", kind: "anthropic", name: "default", secretKey: "apiKey" },
      },
      enabled: true,
    });
    expect(body.transport).toBe("http");
    expect(body.url).toBe("https://mcp.example.com/v1");
  });

  it("defaults transport to stdio when omitted", () => {
    const body = McpServerConfigBodySchema.parse({
      name: "legacy",
      command: "npx",
      args: [],
    });
    expect(body.transport).toBe("stdio");
  });

  it("rejects http without url", () => {
    expect(() =>
      McpServerConfigBodySchema.parse({
        name: "bad",
        transport: "http",
      }),
    ).toThrow();
  });
});

describe("resolveMcpEnv", () => {
  it("resolves literal and credential ref values", async () => {
    const resolved = await resolveMcpEnv(
      {
        PLAIN: "hello",
        SECRET: { type: "credential", kind: "gitlab", name: "default", secretKey: "token" },
      },
      async (kind, name) => {
        expect(kind).toBe("gitlab");
        expect(name).toBe("default");
        return { token: "secret-token" };
      },
    );
    expect(resolved).toEqual({ PLAIN: "hello", SECRET: "secret-token" });
  });

  it("throws when credential secret key is missing", async () => {
    await expect(
      resolveMcpEnv(
        { X: { type: "credential", kind: "jira", name: "default", secretKey: "missing" } },
        async () => ({ email: "a@b.c" }),
      ),
    ).rejects.toThrow(/missing/);
  });
});

describe("isApproveOptionId", () => {
  it("treats approve as approved", () => {
    expect(isApproveOptionId("approve")).toBe(true);
    expect(isApproveOptionId("allow")).toBe(true);
  });

  it("treats deny/reject as not approved", () => {
    expect(isApproveOptionId("reject")).toBe(false);
    expect(isApproveOptionId("deny")).toBe(false);
    expect(isApproveOptionId("deny_once")).toBe(false);
  });
});
