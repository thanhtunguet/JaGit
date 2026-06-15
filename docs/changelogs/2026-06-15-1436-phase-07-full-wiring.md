# Phase 7 — Seed Script + Full Wiring (Part 2)

**Date:** 2026-06-15 14:36  
**Branch:** `worktree-phase-07-seed-wiring`

## Task

Phase 7 steps 2–3: serve dashboard static files from the API, verify full stack smoke-run.

## What Changed

### packages/api/src/main.ts
- Added `@fastify/static` import and `path` / `fileURLToPath` imports at top.
- Refactored top-level `__dirname` to `__rootDir` to avoid name collision.
- Registered `fastifyStatic` plugin after Swagger setup to serve `packages/dashboard/dist` at `/`.
- Fixed NestJS + Fastify compatibility: removed `setNotFoundHandler` call (conflicts with NestJS's own handler) and use `@fastify/static`'s built-in `index: 'index.html'` instead.

### packages/api/src/main.test.ts (new)
- Two focused tests:
  1. Verifies the dashboard dist path resolves correctly relative to `main.ts`.
  2. Verifies `@fastify/static` is declared in `packages/api/package.json` dependencies.

### packages/shared/src/seed.ts (inherited from Step 1)
- `seedDatabase()` function: upserts AgentTemplate, four Credentials (jira/gitlab/telegram/anthropic), RepoMapping. Secrets encrypted via shared `encrypt`.

### packages/shared/src/seed.test.ts (inherited from Step 1)
- 3 tests: parse validates seed data shape, credentials get encrypted secrets, upsert calls use correct unique keys.

### scripts/seed.ts
- Added `console.log` for start ("🌱 Seeding JiGit database …") and completion ("✅ Seed complete.") to match plan spec.

### package.json (root)
- Changed `seed` script from `tsx scripts/seed.ts` to `dotenv -e .env -- tsx scripts/seed.ts` so it loads env vars automatically.

## Tests Added / Run

- `pnpm --filter @jigit/api test` — 4 files, 13 tests passed (includes 2 new main.test.ts tests)
- `pnpm -r test` — 46 tests across 15 test files passed, 2 skipped by design (DB integration)
- `pnpm -r build` — all 4 packages built cleanly

## Smoke Run Results

With Postgres + Redis running via docker-compose:
- `pnpm seed` — exits 0, logs "🌱 Seeding JiGit database … ✅ Seed complete."
- `pnpm dev:api` — API starts on port 3000
- `curl /health` → `{"ok":true,"version":"1.0.0"}`
- `curl /api/docs` → 200 (Swagger UI HTML)
- `curl /jobs` → `[]` (empty, no jobs)

## Follow-Ups

- Worker smoke-run (start worker, confirm "JiGit worker started (concurrency=3)" log) not verified in this session — worker needs DATABASE_URL + REDIS_URL.
- Dashboard dev server at `localhost:5173` not verified (no browser in this environment); `pnpm --filter @jigit/dashboard dev` starts Vite from `packages/dashboard`.
- The `.env` symlink in the worktree (`ln -sf /path/to/.env`) is the pattern to document for worktree-based dev.
