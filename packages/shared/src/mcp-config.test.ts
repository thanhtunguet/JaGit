import { describe, it, expect } from "vitest";
import {
  McpServerConfigBodySchema,
  resolveMcpEnv,
  isApproveOptionId,
} from "./mcp-config.js";

describe("McpServerConfigBodySchema", () => {
  it("parses a valid MCP server config", () => {
    const body = McpServerConfigBodySchema.parse({
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: {
        FOO: "bar",
        TOKEN: { type: "credential", kind: "gitlab", name: "default", secretKey: "token" },
      },
      enabled: true,
    });
    expect(body.name).toBe("filesystem");
    expect(body.args).toHaveLength(3);
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
