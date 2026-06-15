# Configuration UI & Awaiting-Approval Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable configuration UI (full CRUD for credentials, repo mappings, agent templates with write-only masked secrets), a dedicated live "awaiting approval" page across all jobs, and a minimal swappable bearer-token auth guard on mutating endpoints.

**Architecture:** Extend the existing NestJS API (`packages/api`) with an `auth` guard and a full `config` module replacing the read-only `config-view`; add a global `approvals` Redis pub/sub channel relayed over a new SSE endpoint; add CRUD + list endpoints for approvals. Reuse `shared/crypto.ts` for secrets via a new `mergeSecrets` helper and per-kind Zod schemas in `packages/shared`. Extend the React dashboard (`packages/dashboard`) with editable Config dialogs, a new Approvals page, a token store, and a global approvals SSE hook.

**Tech Stack:** TypeScript, NestJS, Zod, Prisma + Postgres, Redis (ioredis pub/sub), Vitest, React + Vite + react-router-dom + shadcn/ui.

**Reference spec:** `docs/superpowers/specs/2026-06-15-config-ui-and-approvals-design.md`

---

## Conventions (read before starting)

- **TDD mandatory:** write the failing test first, watch it fail, then minimal implementation, watch it pass, commit.
- **Commits:** scoped per task, stage files by name (never `git add -A`/`.`), never `--no-verify`. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Tests:** `pnpm --filter @jigit/shared test`, `pnpm --filter @jigit/api test`, `pnpm --filter @jigit/dashboard test`. Run `pnpm -r build` before finishing.
- **NestJS** patterns: one module per domain, controllers thin, services hold logic, Swagger decorators on controllers, `class-validator` DTOs.
- **Secrets** are never returned by the API or logged.

---

## File structure (locked before tasks)

```
packages/shared/src/
├── credentials.ts          # NEW: per-kind Zod schemas + mergeSecrets helper
├── credentials.test.ts     # NEW
├── config.ts               # MODIFY: add dashboardApiToken
├── events.ts               # MODIFY: add approvalsChannel constant
└── index.ts                # MODIFY: export new symbols

packages/api/src/
├── auth/
│   ├── auth.guard.ts       # NEW: bearer-token guard (swappable verify step)
│   └── auth.guard.test.ts  # NEW
├── config/                 # NEW: replaces config-view/
│   ├── config.module.ts
│   ├── credentials.controller.ts
│   ├── credentials.service.ts
│   ├── credentials.service.test.ts
│   ├── repo-mappings.controller.ts
│   ├── repo-mappings.service.ts
│   ├── agent-templates.controller.ts
│   └── agent-templates.service.ts
├── config-view/            # DELETE after config/ lands
├── approvals/
│   ├── approvals.controller.ts   # MODIFY: add GET list, guard decide
│   ├── approvals.service.ts      # MODIFY: listPending + publish approval_resolved
│   ├── approvals.service.test.ts # MODIFY
│   └── approvals.stream.controller.ts  # NEW: GET /approvals/stream
└── app.module.ts           # MODIFY: swap ConfigView→Config, register stream controller

packages/dashboard/src/
├── api/
│   ├── client.ts           # MODIFY: token store, bearer header, config+approval CRUD, useApprovalsSSE
│   └── client.test.ts      # MODIFY
├── pages/
│   ├── Config.tsx          # MODIFY: editable dialogs
│   └── Approvals.tsx       # NEW
├── components/
│   ├── CredentialDialog.tsx     # NEW
│   ├── RepoMappingDialog.tsx    # NEW
│   ├── AgentTemplateDialog.tsx  # NEW
│   └── layout/AppShell.tsx      # MODIFY: add Approvals nav + badge
└── App.tsx                 # MODIFY: add /approvals route
```

---

### Task 1: Shared — per-kind credential schemas + `mergeSecrets`

**Goal:** A single source of truth for credential validation and a secret-merge helper (decrypt → merge → encrypt) reused by API and seed.

**Files:**
- Create: `packages/shared/src/credentials.ts`
- Create: `packages/shared/src/credentials.test.ts`
- Modify: `packages/shared/src/index.ts`

**Acceptance Criteria:**
- [ ] Zod schema validates required meta/secret fields per kind (jira, gitlab, anthropic, telegram).
- [ ] `mergeSecrets(existingEncrypted | null, provided, key)` returns a new encrypted blob: provided non-empty fields overwrite, omitted/blank fields keep existing.
- [ ] `mergeSecrets` never returns plaintext; output is the `.`-segmented ciphertext from `encrypt`.

**Verify:** `pnpm --filter @jigit/shared test` → credentials tests pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

`packages/shared/src/credentials.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto.js";
import { credentialSecretKeys, validateCredential, mergeSecrets } from "./credentials.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("credentialSecretKeys", () => {
  it("lists required secret keys per kind", () => {
    expect(credentialSecretKeys("gitlab")).toEqual(["token"]);
    expect(credentialSecretKeys("jira").sort()).toEqual(["email", "token"]);
    expect(credentialSecretKeys("anthropic")).toEqual(["apiKey"]);
    expect(credentialSecretKeys("telegram")).toEqual(["botToken"]);
  });
});

describe("validateCredential", () => {
  it("accepts a valid gitlab credential", () => {
    const r = validateCredential({
      kind: "gitlab", name: "default",
      meta: { baseUrl: "https://gitlab.com" }, secrets: { token: "glpat-x" },
    });
    expect(r.kind).toBe("gitlab");
  });
  it("rejects gitlab missing baseUrl", () => {
    expect(() => validateCredential({
      kind: "gitlab", name: "default", meta: {}, secrets: { token: "glpat-x" },
    })).toThrow();
  });
});

describe("mergeSecrets", () => {
  it("keeps existing fields when provided value is blank/omitted", () => {
    const existing = encrypt(JSON.stringify({ token: "old", email: "a@b.c" }), KEY);
    const merged = mergeSecrets(existing, { token: "" }, KEY);
    expect(JSON.parse(decrypt(merged, KEY))).toEqual({ token: "old", email: "a@b.c" });
  });
  it("overwrites provided non-empty fields and adds new ones", () => {
    const existing = encrypt(JSON.stringify({ token: "old" }), KEY);
    const merged = mergeSecrets(existing, { token: "new", email: "x@y.z" }, KEY);
    expect(JSON.parse(decrypt(merged, KEY))).toEqual({ token: "new", email: "x@y.z" });
  });
  it("creates a fresh blob when there is no existing secret", () => {
    const merged = mergeSecrets(null, { token: "new" }, KEY);
    expect(JSON.parse(decrypt(merged, KEY))).toEqual({ token: "new" });
    expect(merged.split(".")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/shared test credentials`
Expected: FAIL — `credentials.js` not found / exports undefined.

- [ ] **Step 3: Write minimal implementation**

`packages/shared/src/credentials.ts`:
```ts
import { z } from "zod";
import { encrypt, decrypt } from "./crypto.js";

export const CREDENTIAL_KINDS = ["jira", "gitlab", "telegram", "anthropic"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

const nonEmpty = z.string().min(1);

const KIND_SCHEMAS = {
  jira: z.object({
    meta: z.object({ baseUrl: z.string().url() }).catchall(z.string()),
    secrets: z.object({ email: nonEmpty, token: nonEmpty }),
  }),
  gitlab: z.object({
    meta: z.object({ baseUrl: z.string().url() }).catchall(z.string()),
    secrets: z.object({ token: nonEmpty }),
  }),
  anthropic: z.object({
    meta: z.object({ baseUrl: z.string().url().optional() }).catchall(z.string()),
    secrets: z.object({ apiKey: nonEmpty }),
  }),
  telegram: z.object({
    meta: z.object({ chatId: nonEmpty }).catchall(z.string()),
    secrets: z.object({ botToken: nonEmpty }),
  }),
} as const;

const REQUIRED_SECRET_KEYS: Record<CredentialKind, string[]> = {
  jira: ["email", "token"],
  gitlab: ["token"],
  anthropic: ["apiKey"],
  telegram: ["botToken"],
};

export function credentialSecretKeys(kind: CredentialKind): string[] {
  return REQUIRED_SECRET_KEYS[kind];
}

export interface CredentialInput {
  kind: CredentialKind;
  name: string;
  meta: Record<string, string>;
  secrets: Record<string, string>;
}

/** Full validation — for create. */
export function validateCredential(input: CredentialInput): CredentialInput {
  if (!CREDENTIAL_KINDS.includes(input.kind)) throw new Error(`Unknown kind: ${input.kind}`);
  if (!input.name) throw new Error("name is required");
  KIND_SCHEMAS[input.kind].parse({ meta: input.meta, secrets: input.secrets });
  return input;
}

/**
 * Decrypt the existing blob (if any), overwrite with non-empty provided fields,
 * drop blank provided fields, re-encrypt. Returns a new ciphertext string.
 */
export function mergeSecrets(
  existingEncrypted: string | null,
  provided: Record<string, string>,
  keyB64: string,
): string {
  const current: Record<string, string> = existingEncrypted
    ? JSON.parse(decrypt(existingEncrypted, keyB64))
    : {};
  for (const [k, v] of Object.entries(provided)) {
    if (v !== undefined && v !== "") current[k] = v;
  }
  return encrypt(JSON.stringify(current), keyB64);
}
```

- [ ] **Step 4: Export from index**

Add to `packages/shared/src/index.ts`:
```ts
export * from "./credentials.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @jigit/shared test credentials`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/credentials.ts packages/shared/src/credentials.test.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): per-kind credential schemas and mergeSecrets helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared — add `dashboardApiToken` config + `approvalsChannel`

**Goal:** Expose the auth token via config and a global approvals Redis channel constant.

**Files:**
- Modify: `packages/shared/src/config.ts`
- Modify: `packages/shared/src/config.test.ts`
- Modify: `packages/shared/src/events.ts`
- Modify: `.env.example`

**Acceptance Criteria:**
- [ ] `parseConfig` returns `dashboardApiToken` from `DASHBOARD_API_TOKEN`.
- [ ] `approvalsChannel` constant equals `"approvals"`.
- [ ] `.env.example` documents `DASHBOARD_API_TOKEN`.

**Verify:** `pnpm --filter @jigit/shared test config` → passes.

**Steps:**

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/src/config.test.ts` (inside the existing describe, reuse the existing valid-env fixture object — add the field):
```ts
it("parses DASHBOARD_API_TOKEN", () => {
  const cfg = parseConfig({ ...validEnv, DASHBOARD_API_TOKEN: "secret-token" });
  expect(cfg.dashboardApiToken).toBe("secret-token");
});
```
> If the existing test file builds env inline per-test, add `DASHBOARD_API_TOKEN: "secret-token"` to that fixture so existing tests keep passing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/shared test config`
Expected: FAIL — `dashboardApiToken` undefined / schema rejects extra-required field.

- [ ] **Step 3: Implement**

In `packages/shared/src/config.ts`, add to `Schema`:
```ts
  DASHBOARD_API_TOKEN:    z.string().min(1),
```
and to the returned object in `parseConfig`:
```ts
    dashboardApiToken:    p.DASHBOARD_API_TOKEN,
```

In `packages/shared/src/events.ts`, add:
```ts
/** Global channel for cross-job approval lifecycle events (dashboard SSE) */
export const approvalsChannel = "approvals";
```

In `.env.example`, add:
```
# Bearer token required for dashboard mutating endpoints (config writes, approval decisions).
# Interim until JWT/login lands; rotate as needed.
DASHBOARD_API_TOKEN=change-me
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jigit/shared test`
Expected: PASS (all shared tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config.ts packages/shared/src/config.test.ts packages/shared/src/events.ts .env.example
git commit -m "$(cat <<'EOF'
feat(shared): add DASHBOARD_API_TOKEN config and approvals channel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: API — bearer-token AuthGuard

**Goal:** A NestJS guard that gates mutating endpoints, with a separate, swappable verify step.

**Files:**
- Create: `packages/api/src/auth/auth.guard.ts`
- Create: `packages/api/src/auth/auth.guard.test.ts`

**Acceptance Criteria:**
- [ ] Missing/malformed `Authorization` header → throws `UnauthorizedException`.
- [ ] Wrong token → throws `UnauthorizedException`.
- [ ] Correct `Bearer <token>` → returns `true`.
- [ ] Comparison uses `crypto.timingSafeEqual`.

**Verify:** `pnpm --filter @jigit/api test auth.guard` → passes.

**Steps:**

- [ ] **Step 1: Write the failing test**

`packages/api/src/auth/auth.guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";

function ctx(headerValue?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: headerValue ? { authorization: headerValue } : {} }),
    }),
  } as any;
}

describe("AuthGuard", () => {
  const guard = new AuthGuard("right-token");

  it("allows a correct bearer token", () => {
    expect(guard.canActivate(ctx("Bearer right-token"))).toBe(true);
  });
  it("rejects a wrong token", () => {
    expect(() => guard.canActivate(ctx("Bearer wrong"))).toThrow(UnauthorizedException);
  });
  it("rejects a missing header", () => {
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });
  it("rejects a non-bearer scheme", () => {
    expect(() => guard.canActivate(ctx("Basic right-token"))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/api test auth.guard`
Expected: FAIL — `auth.guard.js` not found.

- [ ] **Step 3: Implement**

`packages/api/src/auth/auth.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { loadConfig } from "@jigit/shared";

/** Extracts a bearer token, or null if absent/malformed. Separate step so the
 *  scheme parsing can be reused when swapping to JWT. */
export function extractBearer(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [scheme, value] = authHeader.split(" ");
  if (scheme !== "Bearer" || !value) return null;
  return value;
}

/** Verifies a static token in constant time. Swap this body for JWT later
 *  without touching call sites. */
export function verifyToken(token: string, expected: string): boolean {
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly expected: string;
  constructor(expected?: string) {
    this.expected = expected ?? loadConfig().dashboardApiToken;
  }
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = extractBearer(req.headers?.authorization);
    if (!token || !verifyToken(token, this.expected)) {
      throw new UnauthorizedException("Invalid or missing API token");
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jigit/api test auth.guard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/auth/auth.guard.ts packages/api/src/auth/auth.guard.test.ts
git commit -m "$(cat <<'EOF'
feat(api): bearer-token AuthGuard with swappable verify step

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: API — Credentials CRUD service + controller

**Goal:** Full credential CRUD with redacted reads, write-only merged secrets, per-kind validation.

**Files:**
- Create: `packages/api/src/config/credentials.service.ts`
- Create: `packages/api/src/config/credentials.service.test.ts`
- Create: `packages/api/src/config/credentials.controller.ts`

**Acceptance Criteria:**
- [ ] `list()` returns `{ id, kind, name, meta, secretKeys }` — no secret values.
- [ ] `create()` validates per-kind and stores an encrypted blob.
- [ ] `update()` merges secrets (blank keeps existing) and re-validates meta.
- [ ] `remove()` deletes by id.
- [ ] Controller mutations are decorated with `@UseGuards(AuthGuard)`; GET is open.

**Verify:** `pnpm --filter @jigit/api test credentials.service` → passes.

**Steps:**

- [ ] **Step 1: Write the failing test** (service, with a fake Prisma)

`packages/api/src/config/credentials.service.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt } from "@jigit/shared";
import { CredentialsService } from "./credentials.service.js";

const KEY = Buffer.alloc(32, 9).toString("base64");

function fakePrisma(rows: any[]) {
  return {
    client: {
      credential: {
        findMany: async () => rows,
        findUnique: async ({ where: { id } }: any) => rows.find((r) => r.id === id) ?? null,
        create: async ({ data }: any) => { const row = { id: "c1", ...data }; rows.push(row); return row; },
        update: async ({ where: { id }, data }: any) => {
          const row = rows.find((r) => r.id === id); Object.assign(row, data); return row;
        },
        delete: async ({ where: { id } }: any) => {
          const i = rows.findIndex((r) => r.id === id); return rows.splice(i, 1)[0];
        },
      },
    },
  } as any;
}

describe("CredentialsService", () => {
  let rows: any[];
  let svc: CredentialsService;
  beforeEach(() => {
    rows = [{
      id: "c1", kind: "gitlab", name: "default",
      meta: { baseUrl: "https://gitlab.com" },
      secrets: { encrypted: encrypt(JSON.stringify({ token: "old" }), KEY) },
    }];
    svc = new CredentialsService(fakePrisma(rows), KEY);
  });

  it("redacts secrets in list, exposing only secretKeys", async () => {
    const out = await svc.list();
    expect(out[0]).toMatchObject({ id: "c1", kind: "gitlab", name: "default" });
    expect(out[0]).not.toHaveProperty("secrets");
    expect(out[0].secretKeys).toEqual(["token"]);
  });

  it("update keeps existing secret when field is blank", async () => {
    await svc.update("c1", { meta: { baseUrl: "https://gitlab.com" }, secrets: { token: "" } });
    expect(JSON.parse(decrypt(rows[0].secrets.encrypted, KEY))).toEqual({ token: "old" });
  });

  it("update overwrites secret when provided", async () => {
    await svc.update("c1", { meta: { baseUrl: "https://gitlab.com" }, secrets: { token: "new" } });
    expect(JSON.parse(decrypt(rows[0].secrets.encrypted, KEY))).toEqual({ token: "new" });
  });

  it("create validates per-kind and encrypts", async () => {
    const created = await svc.create({
      kind: "anthropic", name: "ai", meta: {}, secrets: { apiKey: "sk-x" },
    });
    expect(created.id).toBeDefined();
    const stored = rows.find((r) => r.id === created.id);
    expect(JSON.parse(decrypt(stored.secrets.encrypted, KEY))).toEqual({ apiKey: "sk-x" });
  });

  it("create rejects invalid kind shape", async () => {
    await expect(svc.create({ kind: "gitlab", name: "x", meta: {}, secrets: {} } as any))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/api test credentials.service`
Expected: FAIL — service not found.

- [ ] **Step 3: Implement the service**

`packages/api/src/config/credentials.service.ts`:
```ts
import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import {
  loadConfig, validateCredential, mergeSecrets, credentialSecretKeys,
  type CredentialKind,
} from "@jigit/shared";

export interface CredentialBody {
  kind: CredentialKind;
  name: string;
  meta: Record<string, string>;
  secrets: Record<string, string>;
}

@Injectable()
export class CredentialsService {
  private readonly key: string;
  constructor(
    private readonly prisma: PrismaService,
    key?: string,
  ) {
    this.key = key ?? loadConfig().encryptionKey;
  }

  async list() {
    const rows = await this.prisma.client.credential.findMany();
    return rows.map(({ id, kind, name, meta }: any) => ({
      id, kind, name, meta,
      secretKeys: credentialSecretKeys(kind as CredentialKind),
    }));
  }

  async create(body: CredentialBody) {
    try {
      validateCredential(body);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    const encrypted = mergeSecrets(null, body.secrets, this.key);
    return this.prisma.client.credential.create({
      data: { kind: body.kind, name: body.name, meta: body.meta, secrets: { encrypted } },
    }).then(({ id }: any) => ({ id }));
  }

  async update(id: string, body: Omit<CredentialBody, "kind" | "name">) {
    const existing = await this.prisma.client.credential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Credential ${id} not found`);
    const currentEncrypted = (existing.secrets as any)?.encrypted ?? null;
    const encrypted = mergeSecrets(currentEncrypted, body.secrets ?? {}, this.key);
    // re-validate the merged result against the kind schema
    try {
      validateCredential({
        kind: existing.kind, name: existing.name,
        meta: body.meta, secrets: JSON.parse(decryptForValidation(encrypted, this.key)),
      });
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    return this.prisma.client.credential.update({
      where: { id }, data: { meta: body.meta, secrets: { encrypted } },
    }).then(() => ({ updated: true }));
  }

  async remove(id: string) {
    const existing = await this.prisma.client.credential.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Credential ${id} not found`);
    await this.prisma.client.credential.delete({ where: { id } });
    return { deleted: true };
  }
}

// local import to avoid leaking decrypt into the public surface
import { decrypt as decryptForValidation } from "@jigit/shared";
```
> Note: keep the `decrypt` import at the top of the file in the final code (move the bottom import up). It is shown at the bottom here only to flag that validation decrypts the merged blob in-memory; the value is never returned.

- [ ] **Step 4: Implement the controller**

`packages/api/src/config/credentials.controller.ts`:
```ts
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { CredentialsService, type CredentialBody } from "./credentials.service.js";

@ApiTags("Config")
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly svc: CredentialsService) {}

  @Get()
  @ApiOperation({ summary: "List credentials (secrets redacted)" })
  list() { return this.svc.list(); }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Create a credential" })
  create(@Body() body: CredentialBody) { return this.svc.create(body); }

  @Patch(":id")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Update a credential (blank secret keeps existing)" })
  update(@Param("id") id: string, @Body() body: Omit<CredentialBody, "kind" | "name">) {
    return this.svc.update(id, body);
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Delete a credential" })
  remove(@Param("id") id: string) { return this.svc.remove(id); }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @jigit/api test credentials.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/config/credentials.service.ts packages/api/src/config/credentials.service.test.ts packages/api/src/config/credentials.controller.ts
git commit -m "$(cat <<'EOF'
feat(api): credentials CRUD with redacted reads and merged secrets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: API — Repo mappings & agent templates CRUD + Config module

**Goal:** Full CRUD for repo mappings and agent templates, and a `ConfigModule` that wires all three; delete the old read-only `config-view`.

**Files:**
- Create: `packages/api/src/config/repo-mappings.service.ts`
- Create: `packages/api/src/config/repo-mappings.controller.ts`
- Create: `packages/api/src/config/agent-templates.service.ts`
- Create: `packages/api/src/config/agent-templates.controller.ts`
- Create: `packages/api/src/config/config.module.ts`
- Create: `packages/api/src/config/repo-mappings.service.test.ts`
- Modify: `packages/api/src/app.module.ts`
- Delete: `packages/api/src/config-view/config-view.controller.ts`, `packages/api/src/config-view/config-view.module.ts`

**Acceptance Criteria:**
- [ ] Repo mappings: list/create/update/delete; `create`/`update` validate `agentTemplateId` exists; duplicate `jiraProjectKey` → `409`.
- [ ] Agent templates: list/create/update/delete.
- [ ] `GET /agent-templates`, `/credentials`, `/repo-mappings` still work (compatible shapes for the dashboard).
- [ ] `app.module.ts` imports `ConfigModule` and no longer imports `ConfigViewModule`.

**Verify:** `pnpm --filter @jigit/api test repo-mappings.service` and `pnpm --filter @jigit/api build` pass.

**Steps:**

- [ ] **Step 1: Write the failing test**

`packages/api/src/config/repo-mappings.service.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ConflictException, BadRequestException } from "@nestjs/common";
import { RepoMappingsService } from "./repo-mappings.service.js";

function fakePrisma(mappings: any[], templates: any[]) {
  return { client: {
    repoMapping: {
      findMany: async () => mappings,
      findUnique: async ({ where }: any) =>
        mappings.find((m) => m.id === where.id || m.jiraProjectKey === where.jiraProjectKey) ?? null,
      create: async ({ data }: any) => { const row = { id: "m1", ...data }; mappings.push(row); return row; },
      update: async ({ where: { id }, data }: any) => {
        const m = mappings.find((r) => r.id === id); Object.assign(m, data); return m;
      },
      delete: async ({ where: { id } }: any) => {
        const i = mappings.findIndex((r) => r.id === id); return mappings.splice(i, 1)[0];
      },
    },
    agentTemplate: { findUnique: async ({ where: { id } }: any) => templates.find((t) => t.id === id) ?? null },
  } } as any;
}

describe("RepoMappingsService", () => {
  let mappings: any[]; let svc: RepoMappingsService;
  beforeEach(() => {
    mappings = [];
    svc = new RepoMappingsService(fakePrisma(mappings, [{ id: "t1", name: "default" }]));
  });

  it("creates a mapping when the template exists", async () => {
    const out = await svc.create({
      jiraProjectKey: "ABC", gitlabProjectId: "ns/repo",
      defaultBaseBranch: "main", branchPrefixRules: {}, agentTemplateId: "t1",
    });
    expect(out.id).toBe("m1");
  });

  it("rejects an unknown agentTemplateId", async () => {
    await expect(svc.create({
      jiraProjectKey: "ABC", gitlabProjectId: "ns/repo",
      defaultBaseBranch: "main", branchPrefixRules: {}, agentTemplateId: "nope",
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a duplicate jiraProjectKey", async () => {
    await svc.create({
      jiraProjectKey: "ABC", gitlabProjectId: "ns/repo",
      defaultBaseBranch: "main", branchPrefixRules: {}, agentTemplateId: "t1",
    });
    await expect(svc.create({
      jiraProjectKey: "ABC", gitlabProjectId: "ns/other",
      defaultBaseBranch: "main", branchPrefixRules: {}, agentTemplateId: "t1",
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/api test repo-mappings.service`
Expected: FAIL — service not found.

- [ ] **Step 3: Implement repo-mappings service**

`packages/api/src/config/repo-mappings.service.ts`:
```ts
import { Injectable, NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

export interface RepoMappingBody {
  jiraProjectKey: string;
  gitlabProjectId: string;
  defaultBaseBranch: string;
  branchPrefixRules: Record<string, string>;
  agentTemplateId: string;
}

@Injectable()
export class RepoMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.client.repoMapping.findMany({
      include: { agentTemplate: { select: { id: true, name: true } } },
    });
  }

  private async assertTemplate(id: string) {
    const t = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!t) throw new BadRequestException(`Agent template ${id} not found`);
  }

  async create(body: RepoMappingBody) {
    await this.assertTemplate(body.agentTemplateId);
    const dup = await this.prisma.client.repoMapping.findUnique({
      where: { jiraProjectKey: body.jiraProjectKey },
    });
    if (dup) throw new ConflictException(`Mapping for ${body.jiraProjectKey} already exists`);
    return this.prisma.client.repoMapping.create({ data: body });
  }

  async update(id: string, body: RepoMappingBody) {
    const existing = await this.prisma.client.repoMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Repo mapping ${id} not found`);
    await this.assertTemplate(body.agentTemplateId);
    return this.prisma.client.repoMapping.update({ where: { id }, data: body });
  }

  async remove(id: string) {
    const existing = await this.prisma.client.repoMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Repo mapping ${id} not found`);
    await this.prisma.client.repoMapping.delete({ where: { id } });
    return { deleted: true };
  }
}
```

- [ ] **Step 4: Implement repo-mappings controller**

`packages/api/src/config/repo-mappings.controller.ts`:
```ts
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { RepoMappingsService, type RepoMappingBody } from "./repo-mappings.service.js";

@ApiTags("Config")
@Controller("repo-mappings")
export class RepoMappingsController {
  constructor(private readonly svc: RepoMappingsService) {}

  @Get() list() { return this.svc.list(); }

  @Post() @UseGuards(AuthGuard)
  create(@Body() body: RepoMappingBody) { return this.svc.create(body); }

  @Patch(":id") @UseGuards(AuthGuard)
  update(@Param("id") id: string, @Body() body: RepoMappingBody) { return this.svc.update(id, body); }

  @Delete(":id") @UseGuards(AuthGuard)
  remove(@Param("id") id: string) { return this.svc.remove(id); }
}
```

- [ ] **Step 5: Implement agent-templates service + controller**

`packages/api/src/config/agent-templates.service.ts`:
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";

export interface AgentTemplateBody {
  name: string;
  model: string;
  systemPrompt: string;
  maxConcurrent: number;
  allowedTools: string[];
  skills: string[];
}

@Injectable()
export class AgentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() { return this.prisma.client.agentTemplate.findMany(); }

  create(body: AgentTemplateBody) { return this.prisma.client.agentTemplate.create({ data: body }); }

  async update(id: string, body: AgentTemplateBody) {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    return this.prisma.client.agentTemplate.update({ where: { id }, data: body });
  }

  async remove(id: string) {
    const existing = await this.prisma.client.agentTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Agent template ${id} not found`);
    await this.prisma.client.agentTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
```

`packages/api/src/config/agent-templates.controller.ts`:
```ts
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard.js";
import { AgentTemplatesService, type AgentTemplateBody } from "./agent-templates.service.js";

@ApiTags("Config")
@Controller("agent-templates")
export class AgentTemplatesController {
  constructor(private readonly svc: AgentTemplatesService) {}

  @Get() list() { return this.svc.list(); }

  @Post() @UseGuards(AuthGuard)
  create(@Body() body: AgentTemplateBody) { return this.svc.create(body); }

  @Patch(":id") @UseGuards(AuthGuard)
  update(@Param("id") id: string, @Body() body: AgentTemplateBody) { return this.svc.update(id, body); }

  @Delete(":id") @UseGuards(AuthGuard)
  remove(@Param("id") id: string) { return this.svc.remove(id); }
}
```

- [ ] **Step 6: Wire the module**

`packages/api/src/config/config.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma.module.js";
import { CredentialsController } from "./credentials.controller.js";
import { CredentialsService } from "./credentials.service.js";
import { RepoMappingsController } from "./repo-mappings.controller.js";
import { RepoMappingsService } from "./repo-mappings.service.js";
import { AgentTemplatesController } from "./agent-templates.controller.js";
import { AgentTemplatesService } from "./agent-templates.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CredentialsController, RepoMappingsController, AgentTemplatesController],
  providers: [CredentialsService, RepoMappingsService, AgentTemplatesService],
})
export class ConfigModule {}
```

In `packages/api/src/app.module.ts`: replace the `ConfigViewModule` import/registration with `ConfigModule` (read the file first to match its exact import list). Then delete the `config-view/` directory files.

- [ ] **Step 7: Run tests + build**

Run: `pnpm --filter @jigit/api test repo-mappings.service && pnpm --filter @jigit/api build`
Expected: PASS, builds clean.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/config packages/api/src/app.module.ts
git rm packages/api/src/config-view/config-view.controller.ts packages/api/src/config-view/config-view.module.ts
git commit -m "$(cat <<'EOF'
feat(api): full config CRUD module; remove read-only config-view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: API — Approvals list endpoint + global SSE + publish on decide

**Goal:** A cross-job pending-approvals list, a global `approvals` SSE stream, and `decide()` publishing `approval_resolved`. Guard the decide endpoint.

**Files:**
- Modify: `packages/api/src/approvals/approvals.service.ts`
- Modify: `packages/api/src/approvals/approvals.service.test.ts`
- Modify: `packages/api/src/approvals/approvals.controller.ts`
- Create: `packages/api/src/approvals/approvals.stream.controller.ts`
- Modify: `packages/api/src/approvals/approvals.module.ts`

**Acceptance Criteria:**
- [ ] `listPending()` returns pending approvals with `{ id, prompt, options, createdAt, job: { id, jiraIssueKey, status } }`.
- [ ] `decide()` publishes `{ type: "approval_resolved", approvalId, status }` to the `approvals` channel.
- [ ] `GET /approvals?status=pending` returns the list; `GET /approvals/stream` streams the channel.
- [ ] `POST /approvals/:id/decide` is guarded by `AuthGuard`.

**Verify:** `pnpm --filter @jigit/api test approvals.service` → passes.

**Steps:**

- [ ] **Step 1: Extend the failing test**

Add to `packages/api/src/approvals/approvals.service.test.ts` (follow the file's existing fake-prisma/publish setup; capture published channels):
```ts
it("listPending returns approvals with job context", async () => {
  // arrange: fake prisma returns one pending approval joined with job
  const svc = makeService({
    approvals: [{
      id: "a1", prompt: "Allow tool: bash", options: [{ optionId: "allow", name: "Allow" }],
      status: "pending", createdAt: new Date("2026-06-15T00:00:00Z"),
      job: { id: "j1", jiraIssueKey: "ABC-1", status: "awaiting_approval" },
    }],
  });
  const out = await svc.listPending();
  expect(out[0]).toMatchObject({
    id: "a1", prompt: "Allow tool: bash",
    job: { id: "j1", jiraIssueKey: "ABC-1", status: "awaiting_approval" },
  });
});

it("decide publishes approval_resolved on the approvals channel", async () => {
  const { svc, published } = makeServiceCapturing({
    approvals: [{ id: "a1", jobId: "j1", status: "pending" }],
  });
  await svc.decide("a1", "allow", "dashboard");
  expect(published).toContainEqual(
    expect.objectContaining({ channel: "approvals", data: expect.objectContaining({ type: "approval_resolved", approvalId: "a1", status: "approved" }) }),
  );
});
```
> Adapt `makeService`/`makeServiceCapturing` to the file's existing helpers. The key behaviors to assert: `listPending` shape, and that decide publishes to the `approvals` channel via `publishEvent(redisUrl, approvalsChannel, ...)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/api test approvals.service`
Expected: FAIL — `listPending` undefined / no `approvals` publish.

- [ ] **Step 3: Implement `listPending` + publish in service**

In `packages/api/src/approvals/approvals.service.ts`:
- Add imports: `import { publishControl, publishEvent, approvalsChannel, loadConfig } from "@jigit/shared";` (extend the existing import).
- Add method:
```ts
  async listPending() {
    const rows = await this.prisma.client.approval.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { job: { select: { id: true, jiraIssueKey: true, status: true } } },
    });
    return rows.map((a: any) => ({
      id: a.id, prompt: a.prompt, options: a.options, createdAt: a.createdAt, job: a.job,
    }));
  }
```
- At the end of `decide()`, after the existing `publishControl(...)`, add:
```ts
    await publishEvent(this.cfg.redisUrl, approvalsChannel, {
      type: "approval_resolved", approvalId, status,
    });
```

- [ ] **Step 4: Add GET list + guard decide in controller**

In `packages/api/src/approvals/approvals.controller.ts`:
- Add imports: `Get`, `Query`, `UseGuards`, `AuthGuard`.
- Add:
```ts
  @Get()
  @ApiOperation({ summary: "List approvals (default: pending) with job context" })
  list(@Query("status") status = "pending") {
    return status === "pending" ? this.svc.listPending() : this.svc.listPending();
  }
```
- Decorate the existing `decide` handler with `@UseGuards(AuthGuard)`.

- [ ] **Step 5: Add the global SSE controller**

`packages/api/src/approvals/approvals.stream.controller.ts`:
```ts
import { Controller, Get, Sse, MessageEvent } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Observable } from "rxjs";
import { makeRedis, approvalsChannel, loadConfig } from "@jigit/shared";

@ApiTags("Approvals")
@Controller("approvals")
export class ApprovalsStreamController {
  private readonly cfg = loadConfig();

  @Get("stream")
  @Sse()
  @ApiOperation({ summary: "SSE stream of cross-job approval lifecycle events" })
  stream(): Observable<MessageEvent> {
    const redis = makeRedis(this.cfg.redisUrl);
    redis.subscribe(approvalsChannel);
    return new Observable<MessageEvent>((observer) => {
      redis.on("message", (_ch: string, msg: string) => observer.next({ data: msg } as MessageEvent));
      return () => { redis.unsubscribe(approvalsChannel); redis.quit(); };
    });
  }
}
```
> Route ordering: register `ApprovalsStreamController` so `GET /approvals/stream` is matched before any `:id` route. In NestJS, `stream` is a static segment and will not collide with `POST /approvals/:id/decide` (different method/path), but keep both controllers in the module's `controllers` array.

- [ ] **Step 6: Wire the module**

In `packages/api/src/approvals/approvals.module.ts`, add `ApprovalsStreamController` to `controllers`.

- [ ] **Step 7: Run tests + build**

Run: `pnpm --filter @jigit/api test approvals && pnpm --filter @jigit/api build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/approvals
git commit -m "$(cat <<'EOF'
feat(api): approvals list endpoint, global SSE channel, resolved event

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Worker — publish `approval_requested` to the global channel

**Goal:** When the worker creates an Approval, also publish it to the global `approvals` channel so the dashboard list updates live.

**Files:**
- Modify: `packages/worker/src/graph.ts` (around lines 88–103)
- Modify: `packages/worker/src/graph.test.ts` (assert the global publish)

**Acceptance Criteria:**
- [ ] On approval creation, the worker publishes `{ type: "approval_requested", approval: { id, prompt, options, createdAt }, job: { id, jiraIssueKey, status } }` to `approvalsChannel`.
- [ ] Existing per-job `sink.addEvent("approval_requested")` behavior is unchanged.

**Verify:** `pnpm --filter @jigit/worker test graph` → passes.

**Steps:**

- [ ] **Step 1: Write/extend the failing test**

In `packages/worker/src/graph.test.ts`, in the approval path test, assert that `publishEvent` is called with the `approvals` channel. If the test harness injects a publish spy, assert:
```ts
expect(publishSpy).toHaveBeenCalledWith(
  expect.any(String), // redisUrl
  "approvals",
  expect.objectContaining({ type: "approval_requested", approval: expect.objectContaining({ id: expect.any(String) }) }),
);
```
> If `graph.ts` currently imports `publishEvent` only indirectly, add a direct import so it can be spied/mocked the same way other shared functions are in this test file. Match the file's existing mocking style.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/worker test graph`
Expected: FAIL — no publish to `approvals`.

- [ ] **Step 3: Implement**

In `packages/worker/src/graph.ts`, extend the imports from `@jigit/shared` to include `publishEvent, approvalsChannel, loadConfig` (reuse existing if present). After the `sink.addEvent(...)` block (line ~103), add:
```ts
      // Notify the global approvals stream (cross-job dashboard list)
      await publishEvent(loadConfig().redisUrl, approvalsChannel, {
        type: "approval_requested",
        approval: {
          id: approval.id,
          prompt: approval.prompt,
          options: req.options,
          createdAt: approval.createdAt,
        },
        job: {
          id: state.jobId,
          jiraIssueKey: state.jiraIssueKey,
          status: "awaiting_approval",
        },
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jigit/worker test graph`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/graph.ts packages/worker/src/graph.test.ts
git commit -m "$(cat <<'EOF'
feat(worker): publish approval_requested to global approvals channel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Dashboard — API client: token store, bearer header, config + approval CRUD, useApprovalsSSE

**Goal:** Extend the API client with a token store, bearer header on mutations, typed config/approval CRUD calls, and a global approvals SSE hook.

**Files:**
- Modify: `packages/dashboard/src/api/client.ts`
- Modify: `packages/dashboard/src/api/client.test.ts`

**Acceptance Criteria:**
- [ ] `setApiToken`/`getApiToken` persist to `localStorage` under key `jigit_api_token`.
- [ ] Mutating helpers send `Authorization: Bearer <token>`; reads do not require it.
- [ ] A `401` response throws an error whose message mentions the token.
- [ ] New typed helpers: credentials/repoMappings/agentTemplates CRUD; `listPendingApprovals`; `useApprovalsSSE`.

**Verify:** `pnpm --filter @jigit/dashboard test client` → passes.

**Steps:**

- [ ] **Step 1: Write the failing test**

Add to `packages/dashboard/src/api/client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setApiToken, getApiToken, createCredential } from "./client";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("api token store", () => {
  it("persists and reads the token", () => {
    setApiToken("abc");
    expect(getApiToken()).toBe("abc");
    expect(localStorage.getItem("jigit_api_token")).toBe("abc");
  });
});

describe("mutations send bearer header", () => {
  it("attaches Authorization on createCredential", async () => {
    setApiToken("abc");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "c1" }), { status: 200 }) as any);
    await createCredential({ kind: "gitlab", name: "d", meta: { baseUrl: "https://gitlab.com" }, secrets: { token: "x" } });
    const [, init] = fetchMock.mock.calls[0];
    expect((init!.headers as any).Authorization).toBe("Bearer abc");
  });

  it("surfaces a token hint on 401", async () => {
    setApiToken("bad");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }) as any);
    await expect(createCredential({ kind: "gitlab", name: "d", meta: { baseUrl: "https://gitlab.com" }, secrets: { token: "x" } }))
      .rejects.toThrow(/token/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @jigit/dashboard test client`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Implement**

In `packages/dashboard/src/api/client.ts`, add near the top:
```ts
const TOKEN_KEY = "jigit_api_token";
export const getApiToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setApiToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);

async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiToken()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("Unauthorized — set or refresh your API token in Config.");
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}
```
Then add typed helpers + interfaces:
```ts
export interface CredentialView { id: string; kind: string; name: string; meta: Record<string, string>; secretKeys: string[]; }
export interface CredentialInput { kind: string; name: string; meta: Record<string, string>; secrets: Record<string, string>; }
export const listCredentials = () => request<CredentialView[]>("/credentials");
export const createCredential = (b: CredentialInput) => mutate<{ id: string }>("/credentials", "POST", b);
export const updateCredential = (id: string, b: Omit<CredentialInput, "kind" | "name">) => mutate<void>(`/credentials/${id}`, "PATCH", b);
export const deleteCredential = (id: string) => mutate<void>(`/credentials/${id}`, "DELETE");

export interface RepoMappingInput { jiraProjectKey: string; gitlabProjectId: string; defaultBaseBranch: string; branchPrefixRules: Record<string, string>; agentTemplateId: string; }
export const listRepoMappings = () => request<any[]>("/repo-mappings");
export const createRepoMapping = (b: RepoMappingInput) => mutate<any>("/repo-mappings", "POST", b);
export const updateRepoMapping = (id: string, b: RepoMappingInput) => mutate<any>(`/repo-mappings/${id}`, "PATCH", b);
export const deleteRepoMapping = (id: string) => mutate<void>(`/repo-mappings/${id}`, "DELETE");

export interface AgentTemplateInput { name: string; model: string; systemPrompt: string; maxConcurrent: number; allowedTools: string[]; skills: string[]; }
export const listAgentTemplates = () => request<any[]>("/agent-templates");
export const createAgentTemplate = (b: AgentTemplateInput) => mutate<any>("/agent-templates", "POST", b);
export const updateAgentTemplate = (id: string, b: AgentTemplateInput) => mutate<any>(`/agent-templates/${id}`, "PATCH", b);
export const deleteAgentTemplate = (id: string) => mutate<void>(`/agent-templates/${id}`, "DELETE");

export interface PendingApproval {
  id: string; prompt: string; options: { optionId: string; name: string }[];
  createdAt: string; job: { id: string; jiraIssueKey: string | null; status: string };
}
export const listPendingApprovals = () => request<PendingApproval[]>("/approvals?status=pending");
```
Update the existing `decideApproval` to go through `mutate` so it sends the bearer header:
```ts
export const decideApproval = (id: string, optionId: string) =>
  mutate<void>(`/approvals/${id}/decide`, "POST", { optionId });
```
Add the global SSE hook:
```ts
export function useApprovalsSSE(onEvent: (e: { type: string; approvalId?: string; approval?: PendingApproval; status?: string }) => void) {
  useEffect(() => {
    const es = new EventSource("/approvals/stream");
    es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch { /* ignore */ } };
    return () => es.close();
  }, [onEvent]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @jigit/dashboard test client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/api/client.ts packages/dashboard/src/api/client.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): api client token store, config/approval CRUD, approvals SSE

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Dashboard — Approvals page + nav + route

**Goal:** A live page listing pending approvals across jobs with inline approve/reject, plus a nav entry with a count badge.

**Files:**
- Create: `packages/dashboard/src/pages/Approvals.tsx`
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/components/layout/AppShell.tsx`

**Acceptance Criteria:**
- [ ] Page loads pending approvals on mount and renders rich rows (issue key linking to job, status badge, prompt, option buttons, relative age).
- [ ] `approval_requested` SSE adds a row; `approval_resolved` removes it.
- [ ] Inline buttons call `decideApproval` and optimistically remove the row.
- [ ] Empty state shows "No approvals awaiting decision."
- [ ] AppShell has an "Approvals" nav item with a pending-count badge; `/approvals` route renders the page.

**Verify:** `pnpm --filter @jigit/dashboard build` succeeds; manual: visit `/approvals`.

**Steps:**

- [ ] **Step 1: Implement the page**

`packages/dashboard/src/pages/Approvals.tsx`:
```tsx
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listPendingApprovals, decideApproval, useApprovalsSSE, type PendingApproval,
} from "@/api/client";

function age(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function Approvals() {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listPendingApprovals().then(setItems).catch((e) => setError(e.message)); }, []);

  const onEvent = useCallback((e: { type: string; approvalId?: string; approval?: PendingApproval }) => {
    if (e.type === "approval_requested" && e.approval) {
      setItems((prev) => prev.some((x) => x.id === e.approval!.id) ? prev : [...prev, e.approval!]);
    } else if (e.type === "approval_resolved" && e.approvalId) {
      setItems((prev) => prev.filter((x) => x.id !== e.approvalId));
    }
  }, []);
  useApprovalsSSE(onEvent);

  const decide = async (id: string, optionId: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id)); // optimistic
    try { await decideApproval(id, optionId); }
    catch (e: any) { setError(e.message); listPendingApprovals().then(setItems); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Awaiting Approval</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {items.length === 0 ? (
        <p className="text-muted-foreground">No approvals awaiting decision.</p>
      ) : (
        items.map((a) => (
          <Card key={a.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">
                <Link to={`/jobs/${a.job.id}`} className="font-mono underline">
                  {a.job.jiraIssueKey ?? a.job.id}
                </Link>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{a.job.status}</Badge>
                <span className="text-xs text-muted-foreground">{age(a.createdAt)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{a.prompt}</p>
              <div className="flex gap-2">
                {a.options.map((o) => (
                  <Button
                    key={o.optionId}
                    variant={o.optionId.includes("deny") ? "destructive" : "default"}
                    size="sm"
                    onClick={() => decide(a.id, o.optionId)}
                  >
                    {o.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `packages/dashboard/src/App.tsx`: import `Approvals` and add `<Route path="/approvals" element={<Approvals />} />`.

- [ ] **Step 3: Add nav + badge**

In `packages/dashboard/src/components/layout/AppShell.tsx`:
- Import `Inbox` from `lucide-react`, `useEffect`/`useState`, and `listPendingApprovals` + `useApprovalsSSE`.
- Add `{ to: "/approvals", label: "Approvals", icon: Inbox }` to `NAV`.
- Track a `pendingCount` (initial fetch + SSE add/remove) and render a small badge next to the Approvals item when `pendingCount > 0`:
```tsx
// inside the component
const [pendingCount, setPendingCount] = useState(0);
useEffect(() => { listPendingApprovals().then((a) => setPendingCount(a.length)).catch(() => {}); }, []);
useApprovalsSSE((e) => {
  if (e.type === "approval_requested") setPendingCount((c) => c + 1);
  else if (e.type === "approval_resolved") setPendingCount((c) => Math.max(0, c - 1));
});
```
Render badge in the nav map: when `to === "/approvals" && pendingCount > 0`, append
`<span className="ml-auto rounded-full bg-primary px-2 text-xs">{pendingCount}</span>`.

- [ ] **Step 4: Build**

Run: `pnpm --filter @jigit/dashboard build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/Approvals.tsx packages/dashboard/src/App.tsx packages/dashboard/src/components/layout/AppShell.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): live awaiting-approval page with nav badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Dashboard — Editable Config page + dialogs

**Goal:** Make the Config page fully editable with create/edit/delete dialogs for all three entities and write-only masked secret inputs, plus an API-token field.

**Files:**
- Create: `packages/dashboard/src/components/CredentialDialog.tsx`
- Create: `packages/dashboard/src/components/RepoMappingDialog.tsx`
- Create: `packages/dashboard/src/components/AgentTemplateDialog.tsx`
- Modify: `packages/dashboard/src/pages/Config.tsx`

**Acceptance Criteria:**
- [ ] Each section has an "Add" button and per-row Edit/Delete actions.
- [ ] Credential dialog renders per-kind fields; secret inputs show "set / not set" placeholder and submit only changed (non-blank) secrets.
- [ ] Repo-mapping dialog has an agent-template dropdown and key/value branch rules editor.
- [ ] Agent-template dialog edits name/model/systemPrompt/maxConcurrent/allowedTools/skills.
- [ ] A "Settings" area lets the user set the API token (`setApiToken`).
- [ ] The old "read-only / run seed" alert is removed.

**Verify:** `pnpm --filter @jigit/dashboard build` succeeds; manual: add/edit/delete each entity.

**Steps:**

- [ ] **Step 1: CredentialDialog**

`packages/dashboard/src/components/CredentialDialog.tsx` — a shadcn `Dialog` with:
- A `kind` select (only on create; fixed on edit).
- Per-kind field map:
  - `jira`: meta `baseUrl`; secrets `email`, `token`.
  - `gitlab`: meta `baseUrl`; secret `token`.
  - `anthropic`: meta `baseUrl` (optional); secret `apiKey`.
  - `telegram`: meta `chatId`; secret `botToken`.
- Secret inputs `type="password"` with placeholder `"•••••• (leave blank to keep)"` when `secretKeys` indicates a value is set.
- On submit: build `{ meta, secrets }` sending only non-blank secret fields; call `createCredential` or `updateCredential`; call an `onSaved()` prop to refresh.
```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createCredential, updateCredential, type CredentialView } from "@/api/client";

const FIELDS: Record<string, { meta: { key: string; optional?: boolean }[]; secrets: string[] }> = {
  jira: { meta: [{ key: "baseUrl" }], secrets: ["email", "token"] },
  gitlab: { meta: [{ key: "baseUrl" }], secrets: ["token"] },
  anthropic: { meta: [{ key: "baseUrl", optional: true }], secrets: ["apiKey"] },
  telegram: { meta: [{ key: "chatId" }], secrets: ["botToken"] },
};

export function CredentialDialog({ existing, onSaved, trigger }: {
  existing?: CredentialView; onSaved: () => void; trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(existing?.kind ?? "gitlab");
  const [name, setName] = useState(existing?.name ?? "default");
  const [meta, setMeta] = useState<Record<string, string>>(existing?.meta ?? {});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const spec = FIELDS[kind];

  const save = async () => {
    try {
      const cleanSecrets = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== ""));
      if (existing) await updateCredential(existing.id, { meta, secrets: cleanSecrets });
      else await createCredential({ kind, name, meta, secrets: cleanSecrets });
      setOpen(false); onSaved();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Credential</DialogTitle></DialogHeader>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {!existing && (
          <select className="border rounded p-2" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.keys(FIELDS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        {!existing && (
          <input className="border rounded p-2" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        {spec.meta.map((m) => (
          <input key={m.key} className="border rounded p-2" placeholder={m.key + (m.optional ? " (optional)" : "")}
            value={meta[m.key] ?? ""} onChange={(e) => setMeta({ ...meta, [m.key]: e.target.value })} />
        ))}
        {spec.secrets.map((s) => (
          <input key={s} type="password" className="border rounded p-2"
            placeholder={existing?.secretKeys.includes(s) ? `${s}: •••••• (leave blank to keep)` : s}
            value={secrets[s] ?? ""} onChange={(e) => setSecrets({ ...secrets, [s]: e.target.value })} />
        ))}
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: RepoMappingDialog**

`packages/dashboard/src/components/RepoMappingDialog.tsx` — fields `jiraProjectKey`, `gitlabProjectId`, `defaultBaseBranch`, an `agentTemplateId` `<select>` (populated from a `templates` prop), and a simple key/value list editor for `branchPrefixRules`. On submit call `createRepoMapping`/`updateRepoMapping`, then `onSaved()`. (Mirror the CredentialDialog structure; render rules as rows of two inputs + an "add row" button, serializing to an object on save.)

- [ ] **Step 3: AgentTemplateDialog**

`packages/dashboard/src/components/AgentTemplateDialog.tsx` — fields `name`, `model`, `systemPrompt` (textarea), `maxConcurrent` (number), `allowedTools` and `skills` (comma-separated inputs split to arrays on save). On submit call `createAgentTemplate`/`updateAgentTemplate`, then `onSaved()`.

- [ ] **Step 4: Rewrite Config.tsx**

Replace `packages/dashboard/src/pages/Config.tsx` to:
- Use `listCredentials`, `listRepoMappings`, `listAgentTemplates` from the client.
- Remove the read-only `Info` alert.
- Add a "Settings" card with an API-token password input wired to `getApiToken`/`setApiToken`.
- For each section: an "Add" button rendering the matching dialog with a refresh callback, and per-row Edit (dialog with `existing`) + Delete (calls `deleteCredential`/`deleteRepoMapping`/`deleteAgentTemplate` then refresh) actions.
- Keep the existing table layout and skeleton/empty states.
```tsx
// Example of a refresh pattern reused per section:
const reload = () => {
  listCredentials().then(setCredentials);
  listRepoMappings().then(setMappings);
  listAgentTemplates().then(setTemplates);
};
useEffect(reload, []);
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @jigit/dashboard build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/pages/Config.tsx packages/dashboard/src/components/CredentialDialog.tsx packages/dashboard/src/components/RepoMappingDialog.tsx packages/dashboard/src/components/AgentTemplateDialog.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): editable Config page with CRUD dialogs and token field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Integration — wiring check, full build/test, changelog

**Goal:** Verify the whole feature builds and tests pass end-to-end, and record the session.

**Files:**
- Create: `docs/changelogs/2026-06-15-HHMM-config-ui-and-approvals.md`
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (update "Current plan progress")

**Acceptance Criteria:**
- [ ] `pnpm -r build` succeeds.
- [ ] `pnpm -r test` passes (unit) and the existing E2E smoke test still passes.
- [ ] Changelog files written; plan progress updated.

**Verify:** `pnpm -r build && pnpm -r test` → exits 0.

**Steps:**

- [ ] **Step 1: Full build + test**

Run:
```bash
pnpm -r build
pnpm -r test
```
Expected: all green. Fix any cross-package type mismatches (e.g. the `decrypt` import position in `credentials.service.ts`, NAV badge types).

- [ ] **Step 2: Manual smoke (document, do not claim browser-tested)**

Note in the changelog that UI was verified by build only unless run manually:
```
docker-compose up -d postgres redis
pnpm dev:api & pnpm dev:worker
# Visit http://localhost:5173/config and /approvals
```

- [ ] **Step 3: Write changelog + update progress**

Create `docs/changelogs/2026-06-15-HHMM-config-ui-and-approvals.md` with: task summary, files/packages touched, tests added/run, follow-ups (tighten read auth, JWT, approval history). Prepend a one/two-line entry under a dated heading at the top of `CHANGELOG.md`. Update the **Current plan progress** section in `CLAUDE.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/changelogs/2026-06-15-HHMM-config-ui-and-approvals.md CHANGELOG.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: changelog and plan progress for config UI and approvals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes (author)

- **Spec coverage:** Auth (Task 3, env in Task 2) ✓; credentials CRUD + write-only secrets (Tasks 1, 4) ✓; repo-mappings + agent-templates CRUD (Task 5) ✓; approvals list + global SSE + resolved event (Task 6) ✓; worker requested event (Task 7) ✓; dashboard client + token (Task 8) ✓; approvals page + nav badge (Task 9) ✓; editable Config UI (Task 10) ✓; integration/changelog (Task 11) ✓.
- **Type consistency:** `CredentialInput`/`CredentialBody`, `mergeSecrets`, `approvalsChannel`, `PendingApproval`, `useApprovalsSSE` used consistently across tasks.
- **Known adaptation points (flagged in steps):** exact `app.module.ts` import list, exact shapes of existing test helpers in `approvals.service.test.ts` and `graph.test.ts`, and shadcn dialog imports — the implementer should match the files' current conventions.
```
