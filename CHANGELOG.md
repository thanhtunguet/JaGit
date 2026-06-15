# Changelog

## 2026-06-15 (phase-07 post-review fixes)

**Post-review fixes** (8 findings from high-effort code review): Fixed P0 worker decrypt crash (wrong JSON.stringify wrapping), added SpaController for SPA fallback, removed duplicate path computation, fixed seed import to use @jigit/shared, removed double Zod parse, relaxed .length(4) to .min(1), removed dead export, replaced disk-only test with HTTP integration tests. All 49 tests pass.

## 2026-06-15

**Phase 7 — Seed Script + Full Wiring** (`worktree-phase-07-seed-wiring`): Completed Phase 7 — seed script (TDD, encrypted secrets, zod validation), dashboard static serving from API (`@fastify/static`), SPA integration, and full smoke-run verified (`/health`, `/api/docs`, `/jobs` all pass). 46 tests passing.

**Phase 7 Step 1 — Seed Script** (`worktree-phase-07-seed-wiring`): Added TDD-covered seed helpers plus `scripts/seed.ts` wrapper for validated AgentTemplate, Credential, and RepoMapping upserts with encrypted credential secrets.

**Phase 6 — Dashboard Frontend** (`worktree-phase-06-dashboard`): Implemented full React + Vite + TailwindCSS + shadcn/ui dashboard with Overview (mock metrics + Recharts), Jobs list, Job Detail (tabs, timeline, SSE events, approvals), and read-only Config. API client TDD (4 tests passing), build clean, all shadcn/ui UI rules followed.

**Phase 5 — Telegram Bot + Approval Bridge** (`worktree-phase-05-telegram-approval`): Implemented full approval lifecycle — `awaitApproval` Redis helper (TDD), `TelegramService` with inline-keyboard callbacks and idempotent `ApprovalsService.decide` tests (TDD), wired into LangGraph `runAgent` `onPermission`. API: 11 tests passing; Worker: 9 tests passing.

**Phase 4 — Worker Service** (`worktree-phase-04-worker`): Implemented full `@jigit/worker` package — adapter interfaces, JiraAdapter + GitlabAdapter + GitAdapter (all TDD), AcpSession JSON-RPC client with permission bridge (TDD), LangGraph StateGraph with stop-signal conditional edge (TDD), PrismaJobSink, BullMQ worker entrypoint. 7 tests passing, build clean.

**Phase 3 — NestJS API Backend** (`worktree-phase-03-nestjs-api`): Implemented full NestJS API with Fastify adapter — webhook ingestion (Jira), job control, SSE streaming, approvals, config-view endpoints, Swagger UI at `/api/docs`, health check. 9 tests passing (TDD), build clean. Added `unplugin-swc` for Vitest decorator metadata support.

**Phase 2 — Shared Package** (`worktree-phase-02-shared-package`): Implemented all `@jigit/shared` utilities via TDD — AES-256-GCM crypto, Zod config loader, bounded retry, branch-name derivation, BullMQ factory, Redis pub/sub helpers, shared types, and barrel export. 16 tests passing, build clean.


**Phase 1 — Database Design** (`feat/phase-01-database`): Added full Prisma 7 schema (6 models, 3 enums), migration, PrismaPg adapter singleton, smoke tests, and barrel exports in `@jigit/shared`. Adapted plan for Prisma 7's breaking changes (adapter pattern, `prisma.config.ts`).

**Phase 0 — Monorepo Scaffolding** (`feat/phase-00-scaffolding`): Set up pnpm workspace with `@jigit/shared`, `@jigit/api`, `@jigit/worker`, `@jigit/dashboard`. All packages build and typecheck cleanly. Added tsconfig.base.json, .env.example, Vite config for dashboard.
