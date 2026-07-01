# Phase 7 Post-Review Fixes — 2026-06-15 15:12

## Task

Fix 8 findings from high-effort code review of Phase 7 commits before proceeding to Phase 8.

## Changes

### P0 Blockers

**`packages/worker/src/main.ts` line 51** — decrypt crash on every credential read
- Before: `decrypt(JSON.stringify(cred.secrets), cfg.encryptionKey)` — serialised the wrapper object `{encrypted:'...'}`
  instead of passing the cipher string, causing `decrypt()` to throw `Invalid ciphertext format` on every job.
- After: `decrypt((cred.secrets as { encrypted: string }).encrypted, cfg.encryptionKey)`

**`packages/api/src/main.ts` + new `spa.controller.ts`** — SPA fallback missing
- `wildcard: false` with no catch-all meant React Router routes (e.g. `/jobs`) returned 404 JSON on direct navigation.
- Added `SpaController` with `@All('*path')` that calls `reply.sendFile('index.html')`.
- Registered in `AppModule` as the last controller.
- Changed `decorateReply: false` → `decorateReply: true` so `reply.sendFile` is available in the controller.
- Removed redundant `__filename`/`__dirname` re-computation inside `bootstrap()`; now uses module-scope `__rootDir`.

### Medium Findings

**`scripts/seed.ts`** — raw relative import → package name
- Before: `import ... from '../packages/shared/src/index.js'`
- After: `import ... from '@jigit/shared'`
- Also removed dead `export` keyword from `async function main()`.

**`packages/shared/src/seed.ts`** — double Zod parse
- Removed `SeedDataSchema.parse(rawSeedData)` from `seedDatabase()` body; renamed parameter from `rawSeedData` to `seedData`.
- `buildSeedData()` (the only caller) already validates via `SeedDataSchema.parse()` internally.

**`packages/shared/src/seed.ts`** — hardcoded credential count
- Changed `.length(4)` to `.min(1)` on the credentials array schema.

### Test improvements

**`packages/api/src/main.test.ts`** — replaced disk-only assertions with HTTP integration tests
- Old tests only checked `existsSync(index.html)` — the SPA fallback was broken but tests still passed.
- New tests spin up a bare Fastify instance with `@fastify/static` + SPA catch-all route and verify:
  - `GET /` → 200 HTML
  - `GET /jobs` → 200 HTML (SPA fallback)
  - `GET /some/deep/route` → 200 HTML (SPA fallback)
- Disk existence and package.json dependency checks retained.

## Files Changed

- `packages/worker/src/main.ts`
- `packages/api/src/main.ts`
- `packages/api/src/app.module.ts`
- `packages/api/src/spa.controller.ts` (new)
- `packages/api/src/main.test.ts`
- `packages/shared/src/seed.ts`
- `scripts/seed.ts`

## Tests

All 49 tests pass across 5 packages (0 failures, 2 skipped Prisma integration tests requiring a live DB).

## Follow-ups

- None — ready for Phase 8.
