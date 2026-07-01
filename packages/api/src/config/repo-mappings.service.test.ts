import { describe, it, expect, beforeEach } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { RepoMappingsService } from "./repo-mappings.service.js";

function fakePrisma(mappings: any[], templates: any[]) {
  return {
    client: {
      repoMapping: {
        findMany: async () => mappings,
        findUnique: async ({ where }: any) =>
          mappings.find((m) => m.id === where.id || m.jiraProjectKey === where.jiraProjectKey) ?? null,
        create: async ({ data }: any) => {
          const row = { id: "m1", ...data };
          mappings.push(row);
          return row;
        },
        update: async ({ where: { id }, data }: any) => {
          const m = mappings.find((r) => r.id === id);
          Object.assign(m, data);
          return m;
        },
        delete: async ({ where: { id } }: any) => {
          const i = mappings.findIndex((r) => r.id === id);
          return mappings.splice(i, 1)[0];
        },
      },
      agentTemplate: {
        findUnique: async ({ where: { id } }: any) =>
          templates.find((t) => t.id === id) ?? null,
      },
    },
  } as any;
}

describe("RepoMappingsService", () => {
  let mappings: any[];
  let svc: RepoMappingsService;

  beforeEach(() => {
    mappings = [];
    svc = new RepoMappingsService(
      fakePrisma(mappings, [{ id: "t1", name: "default" }]),
    );
  });

  it("creates a mapping when template exists", async () => {
    const out = await svc.create({
      jiraProjectKey: "ABC",
      gitlabProjectId: "ns/repo",
      defaultBaseBranch: "main",
      branchPrefixRules: {},
      agentTemplateId: "t1",
    });
    expect(out.id).toBe("m1");
    expect(out.jiraProjectKey).toBe("ABC");
  });

  it("rejects an unknown agentTemplateId", async () => {
    await expect(
      svc.create({
        jiraProjectKey: "ABC",
        gitlabProjectId: "ns/repo",
        defaultBaseBranch: "main",
        branchPrefixRules: {},
        agentTemplateId: "nope",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a duplicate jiraProjectKey", async () => {
    await svc.create({
      jiraProjectKey: "ABC",
      gitlabProjectId: "ns/repo",
      defaultBaseBranch: "main",
      branchPrefixRules: {},
      agentTemplateId: "t1",
    });
    await expect(
      svc.create({
        jiraProjectKey: "ABC",
        gitlabProjectId: "ns/other",
        defaultBaseBranch: "main",
        branchPrefixRules: {},
        agentTemplateId: "t1",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates an existing mapping", async () => {
    mappings.push({ id: "m1", jiraProjectKey: "ABC", gitlabProjectId: "ns/old", defaultBaseBranch: "main", branchPrefixRules: {}, agentTemplateId: "t1" });
    const out = await svc.update("m1", {
      jiraProjectKey: "ABC",
      gitlabProjectId: "ns/new",
      defaultBaseBranch: "main",
      branchPrefixRules: {},
      agentTemplateId: "t1",
    });
    expect(out.gitlabProjectId).toBe("ns/new");
  });

  it("throws NotFoundException on update with unknown id", async () => {
    await expect(
      svc.update("missing", {
        jiraProjectKey: "ABC",
        gitlabProjectId: "ns/repo",
        defaultBaseBranch: "main",
        branchPrefixRules: {},
        agentTemplateId: "t1",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("removes a mapping by id", async () => {
    mappings.push({ id: "m1", jiraProjectKey: "ABC" });
    const out = await svc.remove("m1");
    expect(out).toEqual({ deleted: true });
    expect(mappings).toHaveLength(0);
  });

  it("throws NotFoundException on remove with unknown id", async () => {
    await expect(svc.remove("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
