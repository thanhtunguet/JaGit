# Changelog

## 2026-06-15

**Phase 4 — Worker Service** (`worktree-phase-04-worker`): Implemented full `@jigit/worker` package — adapter interfaces, JiraAdapter + GitlabAdapter + GitAdapter (all TDD), AcpSession JSON-RPC client with permission bridge (TDD), LangGraph StateGraph with stop-signal conditional edge (TDD), PrismaJobSink, BullMQ worker entrypoint. 7 tests passing, build clean.

**Phase 3 — NestJS API Backend** (`worktree-phase-03-nestjs-api`): Implemented full NestJS API with Fastify adapter — webhook ingestion (Jira), job control, SSE streaming, approvals, config-view endpoints, Swagger UI at `/api/docs`, health check. 9 tests passing (TDD), build clean. Added `unplugin-swc` for Vitest decorator metadata support.

**Phase 2 — Shared Package** (`worktree-phase-02-shared-package`): Implemented all `@jigit/shared` utilities via TDD — AES-256-GCM crypto, Zod config loader, bounded retry, branch-name derivation, BullMQ factory, Redis pub/sub helpers, shared types, and barrel export. 16 tests passing, build clean.


**Phase 1 — Database Design** (`feat/phase-01-database`): Added full Prisma 7 schema (6 models, 3 enums), migration, PrismaPg adapter singleton, smoke tests, and barrel exports in `@jigit/shared`. Adapted plan for Prisma 7's breaking changes (adapter pattern, `prisma.config.ts`).

**Phase 0 — Monorepo Scaffolding** (`feat/phase-00-scaffolding`): Set up pnpm workspace with `@jigit/shared`, `@jigit/api`, `@jigit/worker`, `@jigit/dashboard`. All packages build and typecheck cleanly. Added tsconfig.base.json, .env.example, Vite config for dashboard.
