import { describe, expect, it } from "vitest";
import { decrypt } from "./crypto.js";
import {
  buildSeedData,
  seedDatabase,
  SeedDataSchema,
  type SeedPrismaClient,
} from "./seed.js";

const KEY = Buffer.alloc(32, 11).toString("base64");

function createFakePrisma() {
  const calls = {
    agentTemplate: [] as unknown[],
    credential: [] as unknown[],
    repoMapping: [] as unknown[],
  };

  const client: SeedPrismaClient = {
    agentTemplate: {
      upsert: async (args) => {
        calls.agentTemplate.push(args);
        return { id: "agent-template-id", name: args.create.name };
      },
    },
    credential: {
      upsert: async (args) => {
        calls.credential.push(args);
        return { id: `${args.create.kind}-${args.create.name}` };
      },
    },
    repoMapping: {
      upsert: async (args) => {
        calls.repoMapping.push(args);
        return { id: "repo-mapping-id" };
      },
    },
  };

  return { client, calls };
}

describe("seed script", () => {
  it("builds seed data that matches the validated seed shape", () => {
    const seed = buildSeedData({ anthropicAuthToken: "sk-ant-test" });

    expect(() => SeedDataSchema.parse(seed)).not.toThrow();
    expect(seed.agentTemplate).toMatchObject({
      name: "default",
      model: "claude-opus-4-5",
      maxConcurrent: 1,
      allowedTools: ["read_file", "write_file", "bash", "search"],
      skills: [],
    });
    expect(seed.credentials.map((credential) => credential.kind)).toEqual([
      "jira",
      "gitlab",
      "telegram",
      "anthropic",
    ]);
    expect(seed.repoMapping).toMatchObject({
      jiraProjectKey: "JAGIT",
      gitlabProjectId: "your-namespace/your-repo",
      defaultBaseBranch: "main",
      agentTemplateName: "default",
    });
  });

  it("rejects invalid seed data with zod", () => {
    const seed = buildSeedData({ anthropicAuthToken: "sk-ant-test" });

    expect(() =>
      SeedDataSchema.parse({
        ...seed,
        credentials: [{ ...seed.credentials[0], kind: "unknown" }],
      }),
    ).toThrow();
  });

  it("upserts template, encrypted credentials, and repo mapping with expected unique keys", async () => {
    const seed = buildSeedData({ anthropicAuthToken: "sk-ant-test" });
    const { client, calls } = createFakePrisma();

    await seedDatabase(client, seed, KEY);

    expect(calls.agentTemplate).toHaveLength(1);
    expect(calls.agentTemplate[0]).toMatchObject({
      where: { name: "default" },
      create: {
        name: "default",
        model: "claude-opus-4-5",
        maxConcurrent: 1,
        allowedTools: ["read_file", "write_file", "bash", "search"],
        skills: [],
      },
      update: {
        model: "claude-opus-4-5",
        maxConcurrent: 1,
        allowedTools: ["read_file", "write_file", "bash", "search"],
        skills: [],
      },
    });

    expect(calls.credential).toHaveLength(4);
    expect(calls.credential.map((call: any) => call.where.kind_name)).toEqual([
      { kind: "jira", name: "default" },
      { kind: "gitlab", name: "default" },
      { kind: "telegram", name: "default" },
      { kind: "anthropic", name: "default" },
    ]);

    const anthropicCredential = calls.credential.find(
      (call: any) => call.create.kind === "anthropic",
    ) as any;
    expect(anthropicCredential.create.secrets).not.toEqual({ apiKey: "sk-ant-test" });
    expect(anthropicCredential.create.secrets).toEqual(anthropicCredential.update.secrets);
    expect(JSON.parse(decrypt(anthropicCredential.create.secrets.encrypted, KEY))).toEqual({
      authToken: "sk-ant-test",
    });

    expect(calls.repoMapping).toHaveLength(1);
    expect(calls.repoMapping[0]).toMatchObject({
      where: { jiraProjectKey: "JAGIT" },
      create: {
        jiraProjectKey: "JAGIT",
        gitlabProjectId: "your-namespace/your-repo",
        defaultBaseBranch: "main",
        branchPrefixRules: {
          Bug: "bugfix/",
          Story: "feature/",
          Task: "feature/",
          default: "feature/",
        },
        agentTemplateId: "agent-template-id",
      },
      update: {
        gitlabProjectId: "your-namespace/your-repo",
        defaultBaseBranch: "main",
        branchPrefixRules: {
          Bug: "bugfix/",
          Story: "feature/",
          Task: "feature/",
          default: "feature/",
        },
        agentTemplateId: "agent-template-id",
      },
    });
  });
});
