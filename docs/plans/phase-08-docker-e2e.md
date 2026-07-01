# Phase 8 — Docker + E2E Smoke Test

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.

**Goal:** `docker-compose up` brings up the full system (Postgres, Redis, API, Worker).
An E2E smoke test fires a synthetic Jira webhook and asserts the job progresses
through to `opening_mr` — using fake adapters so no real Jira/GitLab credentials
are needed in CI.

**Prerequisites:** All prior phases complete.

---

## Acceptance Criteria

- [ ] `docker-compose up -d postgres redis && docker-compose up api worker` — all services start.
- [ ] `docker-compose up` from scratch (no local DB) runs migration automatically.
- [ ] `JIGIT_FAKE_ADAPTERS=1 pnpm test:e2e` → passes within 60 seconds.
- [ ] E2E test: synthetic Jira webhook → job created → job status reaches `opening_mr` or `done`.

---

## Steps

### Step 1 — Dockerfiles

- [ ] Create `packages/api/Dockerfile`:
```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/worker/package.json ./packages/worker/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS builder
COPY . .
RUN pnpm --filter @jigit/shared build
RUN pnpm --filter @jigit/dashboard build
RUN pnpm --filter @jigit/api build

# Runtime
FROM base AS runner
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/shared/prisma ./packages/shared/prisma
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist

EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
```

- [ ] Create `packages/worker/Dockerfile`:
```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/worker/package.json ./packages/worker/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter @jigit/shared build
RUN pnpm --filter @jigit/worker build

FROM base AS runner
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/shared/prisma ./packages/shared/prisma
COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder /app/packages/worker/node_modules ./packages/worker/node_modules

CMD ["node", "packages/worker/dist/main.js"]
```

---

### Step 2 — docker-compose.yml

- [ ] Create `docker-compose.yml` at repo root:
```yaml
version: "3.9"

x-env: &env
  DATABASE_URL: postgresql://jigit:jigit@postgres:5432/jigit
  REDIS_URL: redis://redis:6379
  APP_ENCRYPTION_KEY: ${APP_ENCRYPTION_KEY:-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=}
  MAX_CONCURRENT_AGENTS: "3"
  MAX_RETRIES: "3"
  APPROVAL_TIMEOUT_MS: "1800000"
  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-placeholder}
  TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-placeholder}
  PUBLIC_BASE_URL: http://localhost:3000
  API_PORT: "3000"
  API_WEBHOOK_SECRET: ${API_WEBHOOK_SECRET:-dev-secret}
  JIRA_BOT_ACCOUNT_ID: ${JIRA_BOT_ACCOUNT_ID:-bot-account-1}
  JIGIT_FAKE_ADAPTERS: ${JIGIT_FAKE_ADAPTERS:-0}

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: jigit
      POSTGRES_USER: jigit
      POSTGRES_PASSWORD: jigit
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jigit"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  migrate:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
      target: builder
    command: >
      sh -c "cd packages/shared && pnpm exec prisma migrate deploy"
    environment:
      DATABASE_URL: postgresql://jigit:jigit@postgres:5432/jigit
    depends_on:
      postgres:
        condition: service_healthy

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    environment:
      <<: *env
    ports:
      - "3000:3000"
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile: packages/worker/Dockerfile
    environment:
      <<: *env
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy

volumes:
  postgres_data:
```

---

### Step 3 — Fake adapters flag

When `JIGIT_FAKE_ADAPTERS=1`, the worker should use in-memory fakes instead of
real Jira/GitLab/Git adapters. This lets E2E tests run without credentials.

- [ ] In `packages/worker/src/main.ts`, wrap adapter construction:
```ts
const useFakeAdapters = process.env["JIGIT_FAKE_ADAPTERS"] === "1";

const jira: IJiraAdapter = useFakeAdapters
  ? {
      getIssue: async (key) => ({ key, type: "Bug", summary: "E2E test issue", description: "Auto-generated" }),
      addWorklog: async () => {},
    }
  : new JiraAdapter({ ... });

const gitlab: IGitlabAdapter = useFakeAdapters
  ? {
      cloneUrlWithToken: () => "fake://url",
      openMergeRequest: async () => ({ webUrl: "https://fake-mr/1", iid: 1 }),
    }
  : new GitlabAdapter({ ... });

const git: IGitAdapter = useFakeAdapters
  ? {
      clone: async () => {},
      createBranch: async () => {},
      hasChanges: async () => true,
      commitAll: async () => {},
      push: async () => {},
    }
  : new GitAdapter();
```

---

### Step 4 — E2E smoke test

- [ ] Create `e2e/smoke.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * E2E smoke test: POST a synthetic Jira webhook and poll until the job
 * reaches `opening_mr` or `done` within 30 seconds.
 *
 * Requires:
 *   - API running on http://localhost:3000 (or E2E_API_URL)
 *   - Worker running with JIGIT_FAKE_ADAPTERS=1
 *   - DATABASE_URL, REDIS_URL set
 */

const API = process.env["E2E_API_URL"] ?? "http://localhost:3000";
const SECRET = process.env["API_WEBHOOK_SECRET"] ?? "dev-secret";
const BOT_ID = process.env["JIRA_BOT_ACCOUNT_ID"] ?? "bot-account-1";

const TERMINAL_STATUSES = new Set(["done", "opening_mr", "stopped", "failed"]);

async function pollJob(jobId: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/jobs/${jobId}`);
    if (res.ok) {
      const job = await res.json() as { status: string };
      if (TERMINAL_STATUSES.has(job.status)) return job.status;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Job ${jobId} did not reach a terminal status within ${timeoutMs}ms`);
}

describe.skipIf(!process.env["DATABASE_URL"])("E2E smoke", () => {
  let jobId: string;

  it("health check passes", async () => {
    const res = await fetch(`${API}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("Jira webhook creates a job", async () => {
    const payload = {
      webhookEvent: "jira:issue_updated",
      timestamp: Date.now(),
      issue: {
        key: `E2E-${Date.now()}`,
        fields: {
          project: { key: "E2E" },
          issuetype: { name: "Bug" },
          summary: "E2E smoke test issue",
          description: "Created by E2E smoke test",
          assignee: { accountId: BOT_ID },
        },
      },
    };

    const res = await fetch(`${API}/webhooks/jira`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-jigit-secret": SECRET },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(202);
    const body = await res.json() as { jobId: string };
    expect(body.jobId).toBeTruthy();
    jobId = body.jobId;
  });

  it("job progresses to opening_mr or done", async () => {
    const status = await pollJob(jobId);
    expect(["opening_mr", "done"]).toContain(status);
  }, 35_000);
});
```

- [ ] Add `test:e2e` to root `package.json`:
```json
"test:e2e": "vitest run --config e2e/vitest.config.ts"
```

- [ ] Create `e2e/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 10_000,
  },
});
```

---

### Step 5 — Verify locally

- [ ] Run:
```bash
docker-compose up -d postgres redis
pnpm seed
# In two terminals:
JIGIT_FAKE_ADAPTERS=1 pnpm dev:api &
JIGIT_FAKE_ADAPTERS=1 pnpm dev:worker &
# Then:
JIGIT_FAKE_ADAPTERS=1 DATABASE_URL=postgresql://jigit:jigit@localhost:5432/jigit pnpm test:e2e
```

All tests must pass.

---

### Step 6 — Commit

- [ ] Stage and commit:
```bash
git add docker-compose.yml \
        packages/api/Dockerfile \
        packages/worker/Dockerfile \
        e2e/ \
        package.json
git commit -m "chore: docker-compose, Dockerfiles, and E2E smoke test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
