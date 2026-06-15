import { z } from "zod";
import { encrypt } from "./crypto.js";

const CredentialKindSchema = z.enum(["jira", "gitlab", "telegram", "anthropic"]);

const CredentialSeedSchema = z.object({
  kind: CredentialKindSchema,
  name: z.string().min(1),
  secrets: z.record(z.string(), z.string().min(1)),
  meta: z.record(z.string(), z.string()),
});

export const SeedDataSchema = z.object({
  agentTemplate: z.object({
    name: z.string().min(1),
    model: z.string().min(1),
    systemPrompt: z.string().min(1),
    maxConcurrent: z.number().int().positive(),
    allowedTools: z.array(z.string().min(1)),
    skills: z.array(z.string()),
  }),
  credentials: z.array(CredentialSeedSchema).length(4),
  repoMapping: z.object({
    jiraProjectKey: z.string().min(1),
    gitlabProjectId: z.string().min(1),
    defaultBaseBranch: z.string().min(1),
    branchPrefixRules: z.record(z.string(), z.string().min(1)),
    agentTemplateName: z.string().min(1),
  }),
});

export type SeedData = z.infer<typeof SeedDataSchema>;
export type SeedCredentialKind = z.infer<typeof CredentialKindSchema>;

export interface SeedPrismaClient {
  agentTemplate: {
    upsert(args: {
      where: { name: string };
      create: SeedData["agentTemplate"];
      update: Omit<SeedData["agentTemplate"], "name">;
    }): Promise<{ id: string }>;
  };
  credential: {
    upsert(args: {
      where: { kind_name: { kind: SeedCredentialKind; name: string } };
      create: {
        kind: SeedCredentialKind;
        name: string;
        secrets: { encrypted: string };
        meta: Record<string, string>;
      };
      update: {
        secrets: { encrypted: string };
        meta: Record<string, string>;
      };
    }): Promise<unknown>;
  };
  repoMapping: {
    upsert(args: {
      where: { jiraProjectKey: string };
      create: {
        jiraProjectKey: string;
        gitlabProjectId: string;
        defaultBaseBranch: string;
        branchPrefixRules: Record<string, string>;
        agentTemplateId: string;
      };
      update: {
        gitlabProjectId: string;
        defaultBaseBranch: string;
        branchPrefixRules: Record<string, string>;
        agentTemplateId: string;
      };
    }): Promise<unknown>;
  };
}

export function buildSeedData(input: { anthropicApiKey: string }): SeedData {
  return SeedDataSchema.parse({
    agentTemplate: {
      name: "default",
      model: "claude-opus-4-5",
      systemPrompt:
        "You are JiGit's default coding agent. Implement assigned Jira issues, verify changes, and report concise progress.",
      maxConcurrent: 1,
      allowedTools: ["read_file", "write_file", "bash", "search"],
      skills: [],
    },
    credentials: [
      {
        kind: "jira",
        name: "default",
        secrets: { email: "bot@example.com", token: "REPLACE_ME" },
        meta: {
          baseUrl: "https://your-org.atlassian.net",
          botAccountId: "REPLACE_ME",
        },
      },
      {
        kind: "gitlab",
        name: "default",
        secrets: { token: "glpat-REPLACE_ME" },
        meta: { baseUrl: "https://gitlab.com" },
      },
      {
        kind: "telegram",
        name: "default",
        secrets: { botToken: "REPLACE_ME" },
        meta: { chatId: "REPLACE_ME" },
      },
      {
        kind: "anthropic",
        name: "default",
        secrets: { apiKey: input.anthropicApiKey },
        meta: {},
      },
    ],
    repoMapping: {
      jiraProjectKey: "JIGIT",
      gitlabProjectId: "your-namespace/your-repo",
      defaultBaseBranch: "main",
      branchPrefixRules: {
        Bug: "bugfix/",
        Story: "feature/",
        Task: "feature/",
        default: "feature/",
      },
      agentTemplateName: "default",
    },
  });
}

function encryptedSecrets(secrets: Record<string, string>, encryptionKey: string): { encrypted: string } {
  return { encrypted: encrypt(JSON.stringify(secrets), encryptionKey) };
}

export async function seedDatabase(
  client: SeedPrismaClient,
  rawSeedData: SeedData,
  encryptionKey: string,
): Promise<void> {
  const seedData = SeedDataSchema.parse(rawSeedData);
  const { name, ...agentTemplateUpdate } = seedData.agentTemplate;

  const agentTemplate = await client.agentTemplate.upsert({
    where: { name },
    create: seedData.agentTemplate,
    update: agentTemplateUpdate,
  });

  for (const credential of seedData.credentials) {
    const secrets = encryptedSecrets(credential.secrets, encryptionKey);
    await client.credential.upsert({
      where: { kind_name: { kind: credential.kind, name: credential.name } },
      create: {
        kind: credential.kind,
        name: credential.name,
        secrets,
        meta: credential.meta,
      },
      update: {
        secrets,
        meta: credential.meta,
      },
    });
  }

  await client.repoMapping.upsert({
    where: { jiraProjectKey: seedData.repoMapping.jiraProjectKey },
    create: {
      jiraProjectKey: seedData.repoMapping.jiraProjectKey,
      gitlabProjectId: seedData.repoMapping.gitlabProjectId,
      defaultBaseBranch: seedData.repoMapping.defaultBaseBranch,
      branchPrefixRules: seedData.repoMapping.branchPrefixRules,
      agentTemplateId: agentTemplate.id,
    },
    update: {
      gitlabProjectId: seedData.repoMapping.gitlabProjectId,
      defaultBaseBranch: seedData.repoMapping.defaultBaseBranch,
      branchPrefixRules: seedData.repoMapping.branchPrefixRules,
      agentTemplateId: agentTemplate.id,
    },
  });
}
