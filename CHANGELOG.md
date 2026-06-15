# Changelog

## 2026-06-15

**Phase 1 — Database Design** (`feat/phase-01-database`): Added full Prisma 7 schema (6 models, 3 enums), migration, PrismaPg adapter singleton, smoke tests, and barrel exports in `@jigit/shared`. Adapted plan for Prisma 7's breaking changes (adapter pattern, `prisma.config.ts`).

**Phase 0 — Monorepo Scaffolding** (`feat/phase-00-scaffolding`): Set up pnpm workspace with `@jigit/shared`, `@jigit/api`, `@jigit/worker`, `@jigit/dashboard`. All packages build and typecheck cleanly. Added tsconfig.base.json, .env.example, Vite config for dashboard.
