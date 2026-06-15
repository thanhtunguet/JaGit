# Phase 7 Step 1 — Seed Script

## Task

Implement Phase 7 Step 1: add a seed script for the JiGit database using TDD.

## Changes

- Added testable seed helpers in `packages/shared/src/seed.ts`:
  - zod validation for the full seed shape.
  - default `AgentTemplate` data using `claude-opus-4-5` as specified by the plan.
  - four default credentials: Jira, GitLab, Telegram, Anthropic.
  - encrypted credential secret persistence using shared `encrypt` and `APP_ENCRYPTION_KEY` supplied by the script.
  - Repo mapping upsert tied to the upserted template id.
- Exported seed helpers from `packages/shared/src/index.ts`.
- Added executable wrapper `scripts/seed.ts` for `pnpm seed` that loads config via shared `loadConfig`, calls `seedDatabase`, and disconnects Prisma.
- Added focused TDD coverage in `packages/shared/src/seed.test.ts` using a fake Prisma-like client.
- Updated Phase 7 plan/task progress and CLAUDE.md resume pointers.

## Tests

- RED: `pnpm --filter @jigit/shared test -- seed.test.ts` failed because `scripts/seed.js` did not exist.
- GREEN: `pnpm --filter @jigit/shared test -- seed.test.ts` passed with 3 tests.
- `pnpm --filter @jigit/shared test` passed: 19 tests passed, 2 skipped.
- `pnpm --filter @jigit/shared typecheck` passed after moving helpers inside the shared package boundary.
- `pnpm -r test` passed across shared, dashboard, worker, and api packages.

## Follow-ups

- `pnpm seed` still needs a real configured Postgres database and required environment variables; full runtime smoke verification belongs to Phase 7 Step 3.
- Next implementation step: serve the built dashboard from the API.
