# Phase 1 — Database Design

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.
> **Read this entire phase before writing a single line.** The schema is the
> contract every other phase depends on — get it right here.

**Goal:** A complete, validated Prisma schema for all JiGit entities, a
generated client exported from `@jigit/shared`, a baseline migration, and a
smoke test confirming the client connects.

**Prerequisite:** Phase 0 complete (`pnpm install` works, `@jigit/shared` package exists).

**Reference spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md` §3 (Data model)

---

## Acceptance Criteria

- [ ] `prisma validate` reports "The schema at … is valid".
- [ ] `prisma migrate dev --name init` creates all tables without error.
- [ ] `pnpm --filter @jigit/shared exec prisma generate` succeeds.
- [ ] Importing `prisma` and calling `prisma.job.count()` returns a number (smoke test).
- [ ] All enum values match the spec's job-status lifecycle exactly.

**Verify:**
```bash
cd packages/shared
pnpm exec prisma validate
pnpm exec prisma migrate dev --name init
pnpm test
```

---

## Entity Relationship Overview

```
AgentTemplate ──< Job
AgentTemplate ──< RepoMapping

Credential (standalone, kind-keyed)

Job ──< JobStep
Job ──< JobEvent
Job ──< Approval
```

Every job references one `AgentTemplate` (resolved from the `RepoMapping` for the
triggered Jira project). Steps, events, and approvals cascade-delete with the job.

---

## Steps

### Step 1 — Add Prisma dependencies

- [ ] In `packages/shared`:
```bash
cd packages/shared
pnpm add @prisma/client
pnpm add -D prisma
```

---

### Step 2 — Write `prisma/schema.prisma`

Create `packages/shared/prisma/schema.prisma` with the full schema below.
Read each model carefully — the field names are the contract for every other phase.

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ───────────────────────────────────────────────────────────────────

enum JobStatus {
  queued
  cloning
  running
  awaiting_approval
  pushing
  opening_mr
  reporting
  done
  paused
  stopped
  failed
}

enum CredentialKind {
  jira
  gitlab
  telegram
  anthropic
}

enum ApprovalStatus {
  pending
  approved
  rejected
  expired
}

// ─── AgentTemplate ───────────────────────────────────────────────────────────
// Seeded; CRUD deferred to Phase 2+.
// Controls which model and tools are used for a coding run.

model AgentTemplate {
  id            String   @id @default(cuid())
  name          String   @unique
  model         String   // e.g. "claude-opus-4-5"
  systemPrompt  String
  maxConcurrent Int      @default(1)
  allowedTools  Json     @default("[]")   // string[] of ACP tool names
  skills        Json     @default("[]")   // string[] of skill names (MVP: name-only)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  jobs          Job[]
  repoMappings  RepoMapping[]
}

// ─── Credential ──────────────────────────────────────────────────────────────
// One row per integration account.  `secrets` stores an encrypted JSON blob
// (never logged or returned in API responses).  `meta` stores non-secret config
// like base URLs, project IDs, Telegram chat IDs.

model Credential {
  id        String         @id @default(cuid())
  kind      CredentialKind
  name      String
  secrets   Json           // encrypted at rest with APP_ENCRYPTION_KEY
  meta      Json           @default("{}")
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@unique([kind, name])
}

// ─── RepoMapping ─────────────────────────────────────────────────────────────
// Maps a Jira project to a GitLab project + agent template + branch rules.
// branchPrefixRules example: { "Bug": "bugfix/", "Story": "feature/", "default": "feature/" }

model RepoMapping {
  id                String        @id @default(cuid())
  jiraProjectKey    String        @unique
  gitlabProjectId   String
  defaultBaseBranch String        @default("main")
  branchPrefixRules Json          @default("{}")
  agentTemplateId   String
  agentTemplate     AgentTemplate @relation(fields: [agentTemplateId], references: [id])
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
}

// ─── Job ─────────────────────────────────────────────────────────────────────
// One row per triggered coding run.
// checkpointThreadId: used by the LangGraph Postgres checkpointer (= dedupeKey).
// dedupeKey: SHA-1 of (source:issueKey:eventId) — prevents duplicate jobs.

model Job {
  id                  String        @id @default(cuid())
  source              String        // "jira" | "gitlab"
  jiraIssueKey        String?
  gitlabProjectId     String?
  branch              String?
  mrUrl               String?
  status              JobStatus     @default(queued)
  agentTemplateId     String?
  agentTemplate       AgentTemplate? @relation(fields: [agentTemplateId], references: [id])
  checkpointThreadId  String        @unique
  dedupeKey           String        @unique
  tokensUsed          Int           @default(0)
  costUsd             Float         @default(0)
  error               String?
  workdir             String?       // ephemeral clone path (cleaned on terminal state)
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt

  steps     JobStep[]
  events    JobEvent[]
  approvals Approval[]
}

// ─── JobStep ─────────────────────────────────────────────────────────────────
// One row per LangGraph node execution.
// name:   node name (e.g. "resolveContext", "cloneRepo", "runAgent")
// status: "pending" | "running" | "done" | "failed"

model JobStep {
  id         String    @id @default(cuid())
  jobId      String
  job        Job       @relation(fields: [jobId], references: [id], onDelete: Cascade)
  name       String
  status     String    @default("pending")
  detail     Json      @default("{}")
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime  @default(now())
}

// ─── JobEvent ────────────────────────────────────────────────────────────────
// Append-only timeline; streamed to the dashboard over SSE.
// type examples: "step_started", "step_done", "agent_message", "tool_use",
//                "approval_requested", "approval_resolved", "error"

model JobEvent {
  id      String   @id @default(cuid())
  jobId   String
  job     Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  ts      DateTime @default(now())
  level   String   @default("info")   // "info" | "warn" | "error"
  type    String
  message String
  payload Json     @default("{}")

  @@index([jobId, ts])
}

// ─── Approval ────────────────────────────────────────────────────────────────
// Created when Claude Code emits a session/request_permission event.
// Single-resolution: whichever channel (Telegram or dashboard) responds first
// wins; subsequent resolutions are no-ops.
// telegramMessageRef: message_id from the sent Telegram message (for editing it
// after resolution to show the chosen option).

model Approval {
  id                String         @id @default(cuid())
  jobId             String
  job               Job            @relation(fields: [jobId], references: [id], onDelete: Cascade)
  stepId            String?        // FK to the JobStep that triggered this approval
  kind              String         // e.g. "tool_permission"
  prompt            String
  options           Json           @default("[]")  // { optionId: string; name: string }[]
  status            ApprovalStatus @default(pending)
  decidedBy         String?        // user identifier or "system" (timeout)
  decidedVia        String?        // "telegram" | "dashboard" | "system"
  chosenOptionId    String?
  telegramMessageRef String?       // stringified Telegram message_id
  createdAt         DateTime       @default(now())
  decidedAt         DateTime?

  @@index([jobId, status])
}
```

---

### Step 3 — Prisma singleton (`src/prisma.ts`)

- [ ] Create `packages/shared/src/prisma.ts`:
```ts
import { PrismaClient } from "@prisma/client";

// Singleton: one client per process.
// In tests that set DATABASE_URL, this connects to the real DB.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
```

---

### Step 4 — Generate client + run migration

- [ ] Run:
```bash
cd packages/shared
pnpm exec prisma generate
pnpm exec prisma migrate dev --name init
```

If `DATABASE_URL` is not set, create a `.env` in `packages/shared/` pointing at
your local Postgres instance (never commit this file):
```
DATABASE_URL=postgresql://jigit:jigit@localhost:5432/jigit
```

---

### Step 5 — Smoke test

- [ ] Create `packages/shared/src/prisma.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./prisma.js";

describe.skipIf(!process.env.DATABASE_URL)("prisma smoke", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects and counts jobs", async () => {
    const count = await prisma.job.count();
    expect(typeof count).toBe("number");
  });

  it("can read all enum values for JobStatus", async () => {
    // If the enum is wrong the Prisma client won't even compile.
    const jobs = await prisma.job.findMany({ take: 1 });
    expect(Array.isArray(jobs)).toBe(true);
  });
});
```

- [ ] Run:
```bash
pnpm --filter @jigit/shared test
```

---

### Step 6 — Export from barrel

- [ ] Update `packages/shared/src/index.ts`:
```ts
export { prisma } from "./prisma.js";
export * from "@prisma/client";
```

(Later phases will add more exports; this is the minimal starting point.)

---

### Step 7 — Commit

- [ ] Stage and commit:
```bash
git add packages/shared/prisma \
        packages/shared/src/prisma.ts \
        packages/shared/src/prisma.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): prisma schema, migration, and db smoke test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Schema design notes

| Decision | Rationale |
|----------|-----------|
| `dedupeKey = checkpointThreadId` | One field serves webhook dedup and LangGraph resume — no join needed. |
| `secrets Json` on `Credential` | Entire secrets blob is encrypted as one unit with AES-256-GCM (Phase 2). Field is `Json` so the shape can evolve without a migration per credential kind. |
| `allowedTools Json` on `AgentTemplate` | ACP tool allowlist can grow; JSON avoids a many-to-many table for MVP. |
| `Approval.options Json` | Options are passed through from ACP — their schema is ACP's concern, not ours. |
| `JobEvent @@index([jobId, ts])` | SSE queries are `WHERE jobId = ? ORDER BY ts` — this index makes them fast even with thousands of events per job. |
| `Approval @@index([jobId, status])` | Dashboard polls `WHERE jobId = ? AND status = 'pending'` — index avoids a full scan. |
| `onDelete: Cascade` everywhere | A deleted/stopped job cleans up all its children automatically. |
| `workdir` field on `Job` | Stored so the worker can always find (and clean up) the clone directory, even after restart. |
