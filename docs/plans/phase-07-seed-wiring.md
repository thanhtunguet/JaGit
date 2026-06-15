# Phase 7 — Seed Script + Full Wiring

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.

**Goal:** Wire all services together into a runnable system:
- A seed script (`pnpm seed`) that inserts an agent template, one credential row
  per integration, and a repo mapping.
- The API `main.ts` mounts the Telegram bot and serves the built dashboard.
- A manual smoke-run confirming `/health` + Swagger UI + `/jobs` all work.

**Prerequisites:** All prior phases complete and building.

---

## Acceptance Criteria

- [ ] `pnpm seed` upserts one `AgentTemplate`, four `Credential` rows
  (jira, gitlab, telegram, anthropic), one `RepoMapping` — without error.
- [ ] `pnpm dev:api` starts on `PORT` without crashing; `curl /health` → `{ ok: true }`.
- [ ] `curl http://localhost:3000/api/docs` returns HTML (Swagger UI).
- [ ] `curl http://localhost:3000/jobs` returns `[]` (empty array; no jobs yet).
- [ ] Dashboard loads at `http://localhost:5173` (run `pnpm --filter @jigit/dashboard dev`).

---

## Steps

### Step 1 — Seed script

- [ ] Create `scripts/seed.ts`:
```ts
import { z } from "zod";
import { prisma, encrypt, loadConfig } from "@jigit/shared";

const cfg = loadConfig();

// ─── Seed data ────────────────────────────────────────────────────────────────
// Edit this object to match your real integration credentials before running.
// Secrets are encrypted with APP_ENCRYPTION_KEY before being stored.

const SEED = {
  agentTemplate: {
    name: "default",
    model: "claude-opus-4-5",
    systemPrompt: [
      "You are an expert software engineer.",
      "You implement Jira issues by writing clean, well-tested TypeScript code.",
      "You follow the repository's existing conventions and style.",
      "You create focused, minimal changes that address the issue requirements.",
    ].join("\n"),
    maxConcurrent: 1,
    allowedTools: ["read_file", "write_file", "bash", "search"],
    skills: [],
  },

  credentials: [
    {
      kind: "jira" as const,
      name: "default",
      secrets: { email: "bot@example.com", token: "REPLACE_ME" },
      meta: { baseUrl: "https://your-org.atlassian.net", botAccountId: "REPLACE_ME" },
    },
    {
      kind: "gitlab" as const,
      name: "default",
      secrets: { token: "glpat-REPLACE_ME" },
      meta: { baseUrl: "https://gitlab.com" },
    },
    {
      kind: "telegram" as const,
      name: "default",
      secrets: { botToken: "REPLACE_ME" },
      meta: { chatId: "REPLACE_ME" },
    },
    {
      kind: "anthropic" as const,
      name: "default",
      secrets: { apiKey: cfg.anthropicApiKey },
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
};

// ─── Validate seed shape ──────────────────────────────────────────────────────
const SeedSchema = z.object({
  agentTemplate: z.object({
    name: z.string().min(1),
    model: z.string().min(1),
    systemPrompt: z.string().min(10),
    maxConcurrent: z.number().int().positive(),
    allowedTools: z.array(z.string()),
    skills: z.array(z.string()),
  }),
  credentials: z.array(z.object({
    kind: z.enum(["jira", "gitlab", "telegram", "anthropic"]),
    name: z.string().min(1),
    secrets: z.record(z.string()),
    meta: z.record(z.string()),
  })),
  repoMapping: z.object({
    jiraProjectKey: z.string().min(1),
    gitlabProjectId: z.string().min(1),
    defaultBaseBranch: z.string().min(1),
    branchPrefixRules: z.record(z.string()),
    agentTemplateName: z.string().min(1),
  }),
});

async function seed() {
  const data = SeedSchema.parse(SEED);
  console.log("🌱 Seeding JiGit database …");

  // 1. Agent template
  const template = await prisma.agentTemplate.upsert({
    where: { name: data.agentTemplate.name },
    update: data.agentTemplate,
    create: data.agentTemplate,
  });
  console.log(`  ✓ AgentTemplate: ${template.name} (${template.id})`);

  // 2. Credentials (encrypt secrets)
  for (const cred of data.credentials) {
    const encryptedSecrets = Object.fromEntries(
      Object.entries(cred.secrets).map(([k, v]) => [k, encrypt(v, cfg.encryptionKey)])
    );
    await prisma.credential.upsert({
      where: { kind_name: { kind: cred.kind, name: cred.name } },
      update: { secrets: encryptedSecrets, meta: cred.meta },
      create: { kind: cred.kind, name: cred.name, secrets: encryptedSecrets, meta: cred.meta },
    });
    console.log(`  ✓ Credential: ${cred.kind}/${cred.name}`);
  }

  // 3. Repo mapping
  const mapping = await prisma.repoMapping.upsert({
    where: { jiraProjectKey: data.repoMapping.jiraProjectKey },
    update: {
      gitlabProjectId: data.repoMapping.gitlabProjectId,
      defaultBaseBranch: data.repoMapping.defaultBaseBranch,
      branchPrefixRules: data.repoMapping.branchPrefixRules,
      agentTemplateId: template.id,
    },
    create: {
      jiraProjectKey: data.repoMapping.jiraProjectKey,
      gitlabProjectId: data.repoMapping.gitlabProjectId,
      defaultBaseBranch: data.repoMapping.defaultBaseBranch,
      branchPrefixRules: data.repoMapping.branchPrefixRules,
      agentTemplateId: template.id,
    },
  });
  console.log(`  ✓ RepoMapping: ${mapping.jiraProjectKey} → ${mapping.gitlabProjectId}`);

  await prisma.$disconnect();
  console.log("✅ Seed complete.");
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
```

- [ ] Run:
```bash
pnpm seed
```

Fix any errors (likely missing env vars — set `DATABASE_URL` and `APP_ENCRYPTION_KEY`).

---

### Step 2 — Serve dashboard from API

The NestJS API should serve the built dashboard static files so the whole system
is deployable as one container.

- [ ] Install `@fastify/static` in `packages/api`:
```bash
cd packages/api
pnpm add @fastify/static
```

- [ ] In `packages/api/src/main.ts`, after Swagger setup:
```ts
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Serve dashboard static files (built by packages/dashboard)
const dashboardDist = path.resolve(
  fileURLToPath(import.meta.url), "..", "..", "..", "..", "dashboard", "dist"
);
await app.register(fastifyStatic, { root: dashboardDist, prefix: "/", decorateReply: false });
// SPA fallback — send index.html for unknown routes so react-router works
app.getHttpAdapter().getInstance().setNotFoundHandler((_req: any, res: any) => {
  res.sendFile("index.html", dashboardDist);
});
```

---

### Step 3 — Verify full stack

- [ ] Run the full build:
```bash
pnpm -r build
```

- [ ] Start Postgres + Redis:
```bash
docker-compose up -d postgres redis
```

- [ ] Run the seed:
```bash
pnpm seed
```

- [ ] Start the API:
```bash
pnpm dev:api
```

- [ ] In another terminal, verify:
```bash
curl http://localhost:3000/health
# → {"ok":true,"version":"1.0.0"}

curl http://localhost:3000/api/docs
# → HTML containing "JiGit API"

curl http://localhost:3000/jobs
# → []
```

- [ ] Start the worker:
```bash
pnpm dev:worker
```
Should log "JiGit worker started (concurrency=3)".

---

### Step 4 — Commit

- [ ] Stage and commit:
```bash
git add scripts/seed.ts \
        packages/api/src/main.ts
git commit -m "feat: seed script and full service wiring (api + dashboard + worker)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
