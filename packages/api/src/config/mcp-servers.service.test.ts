import { describe, it, expect, beforeEach } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { McpServersService } from "./mcp-servers.service.js";

function fakePrisma(rows: any[]) {
  return {
    client: {
      mcpServerConfig: {
        findMany: async () => rows,
        findUnique: async ({ where }: any) =>
          rows.find((r) => r.id === where.id || r.name === where.name) ?? null,
        create: async ({ data }: any) => {
          const row = { id: "mcp-1", createdAt: new Date(), updatedAt: new Date(), ...data };
          rows.push(row);
          return row;
        },
        update: async ({ where: { id }, data }: any) => {
          const row = rows.find((r) => r.id === id);
          Object.assign(row, data);
          return row;
        },
        delete: async ({ where: { id } }: any) => {
          const i = rows.findIndex((r) => r.id === id);
          return rows.splice(i, 1)[0];
        },
      },
    },
  } as any;
}

describe("McpServersService", () => {
  let rows: any[];
  let svc: McpServersService;

  beforeEach(() => {
    rows = [];
    svc = new McpServersService(fakePrisma(rows));
  });

  it("creates an MCP server config", async () => {
    const out = await svc.create({
      name: "filesystem",
      command: "npx",
      args: ["-y", "mcp-fs"],
      env: { FOO: "bar" },
      enabled: true,
    });
    expect(out.name).toBe("filesystem");
    expect(out.command).toBe("npx");
  });

  it("rejects duplicate name", async () => {
    await svc.create({ name: "dup", command: "echo", args: [], env: {} });
    await expect(
      svc.create({ name: "dup", command: "echo", args: [], env: {} }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("throws not found on update", async () => {
    await expect(
      svc.update("missing", { name: "x", command: "echo", args: [], env: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
