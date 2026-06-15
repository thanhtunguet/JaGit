# Phase 0 — Monorepo Scaffolding

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans` to work through the steps below.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.

**Goal:** A working pnpm monorepo with four packages, shared TypeScript config, and
dev tooling. `pnpm install && pnpm -r build` must exit 0 before this phase is
considered done.

**Packages:**
| Package | Name | Role |
|---------|------|------|
| `packages/shared` | `@jigit/shared` | Types, config, crypto, Prisma client, helpers |
| `packages/api` | `@jigit/api` | NestJS backend (REST + SSE + Telegram bot) |
| `packages/worker` | `@jigit/worker` | BullMQ consumer + LangGraph job graph |
| `packages/dashboard` | `@jigit/dashboard` | React + Vite + shadcn/ui frontend |

**Reference spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md`

---

## Acceptance Criteria

- [ ] `pnpm install` succeeds at repo root.
- [ ] `pnpm -r build` compiles all packages with no TypeScript errors.
- [ ] `pnpm -r typecheck` passes.
- [ ] Each package has an empty but valid `src/index.ts` barrel.

**Verify:**
```bash
pnpm install && pnpm -r build && pnpm -r typecheck
```

---

## Steps

### Step 1 — Root workspace files

- [ ] Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

- [ ] Create `package.json` at repo root:
```json
{
  "name": "jigit",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "dev:api": "pnpm --filter @jigit/api dev",
    "dev:worker": "pnpm --filter @jigit/worker dev",
    "seed": "tsx scripts/seed.ts"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "composite": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

> `experimentalDecorators` and `emitDecoratorMetadata` are required by NestJS.

---

### Step 2 — Per-package manifests

- [ ] Create `packages/shared/package.json`:
```json
{
  "name": "@jigit/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] Create `packages/api/package.json`:
```json
{
  "name": "@jigit/api",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "tsx watch src/main.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@jigit/shared": "workspace:*"
  }
}
```

- [ ] Create `packages/worker/package.json`:
```json
{
  "name": "@jigit/worker",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "tsx watch src/main.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@jigit/shared": "workspace:*"
  }
}
```

- [ ] Create `packages/dashboard/package.json`:
```json
{
  "name": "@jigit/dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "preview": "vite preview"
  }
}
```

- [ ] Create `packages/*/tsconfig.json` for `shared`, `api`, `worker`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] Create `packages/dashboard/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

---

### Step 3 — Placeholder source files

- [ ] Create `packages/shared/src/index.ts`:
```ts
// @jigit/shared — barrel (populated in Phase 2)
export {};
```

- [ ] Create `packages/api/src/main.ts`:
```ts
// @jigit/api — entrypoint (populated in Phase 3)
export {};
```

- [ ] Create `packages/worker/src/main.ts`:
```ts
// @jigit/worker — entrypoint (populated in Phase 4)
export {};
```

- [ ] Create `packages/dashboard/src/main.tsx`:
```tsx
// @jigit/dashboard — entrypoint (populated in Phase 6)
export {};
```

---

### Step 4 — Environment example

- [ ] Create `.env.example`:
```dotenv
# Postgres
DATABASE_URL=postgresql://jigit:jigit@localhost:5432/jigit

# Redis
REDIS_URL=redis://localhost:6379

# Encryption (32-byte base64 random string)
APP_ENCRYPTION_KEY=

# Agent concurrency
MAX_CONCURRENT_AGENTS=3
MAX_RETRIES=3
APPROVAL_TIMEOUT_MS=1800000

# Anthropic
ANTHROPIC_API_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=

# Public URL (used for dashboard links in Telegram messages)
PUBLIC_BASE_URL=http://localhost:3000

# NestJS
API_PORT=3000
API_WEBHOOK_SECRET=
```

- [ ] Append to `.gitignore`:
```
.env
.env.*
!.env.example
dist/
node_modules/
*.js.map
```

---

### Step 5 — Verify & commit

- [ ] Run:
```bash
pnpm install
pnpm -r build
pnpm -r typecheck
```
All must exit 0.

- [ ] Commit (stage by name, never `git add -A`):
```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example .gitignore \
        packages/shared packages/api packages/worker packages/dashboard
git commit -m "chore: scaffold pnpm monorepo with NestJS api, worker, dashboard packages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## File tree after this phase

```
jigit/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
└── packages/
    ├── shared/src/index.ts + package.json + tsconfig.json
    ├── api/src/main.ts + package.json + tsconfig.json
    ├── worker/src/main.ts + package.json + tsconfig.json
    └── dashboard/src/main.tsx + package.json + tsconfig.json
```
