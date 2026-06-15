# Phase 2 — Shared Package

**Date:** 2026-06-15  
**Branch:** `worktree-phase-02-shared-package`  
**Commit:** `1a5a89c`

## Task

Implement all shared utilities in `@jigit/shared`: AES-256-GCM crypto, Zod config loader,
bounded retry policy, branch-name derivation, BullMQ factory, Redis pub/sub helpers, shared
types, and barrel export — all via TDD.

## What Changed

### Files Added

| File | Purpose |
|------|---------|
| `packages/shared/src/crypto.ts` | AES-256-GCM encrypt/decrypt; uses base64url (no padding) so tamper detection is reliable |
| `packages/shared/src/crypto.test.ts` | 3 tests: round-trip, unique IV, tamper detection |
| `packages/shared/src/config.ts` | Zod schema + `parseConfig` / `loadConfig`; coerces numeric env vars |
| `packages/shared/src/config.test.ts` | 3 tests: rejects empty env, parses full env, rejects bad URL |
| `packages/shared/src/retry.ts` | `withRetry` — exponential back-off, stops at `maxRetries + 1` attempts |
| `packages/shared/src/retry.test.ts` | 3 tests: immediate success, retries until success, throws after limit |
| `packages/shared/src/branch.ts` | `deriveBranchName` (slugify with Unicode diacritic stripping, 40-char cap) + `extractIssueKey` |
| `packages/shared/src/branch.test.ts` | 7 tests: type prefixes, default prefix, truncation, Unicode, key extraction |
| `packages/shared/src/types.ts` | `JOB_QUEUE`, `JigitJobData`, `ControlSignalType`, `ControlSignal` |
| `packages/shared/src/queue.ts` | `createQueue` / `createWorker` BullMQ factories |
| `packages/shared/src/events.ts` | `makeRedis`, `publishEvent`, `publishControl`, channel name helpers |

### Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Replaced placeholder with full barrel re-export of all 8 modules |
| `packages/shared/package.json` | Added `zod`, `ioredis`, `bullmq` as runtime dependencies |
| `pnpm-lock.yaml` | Lockfile updated |

## Tests

- **16 tests passing** across 4 test files (branch, crypto, retry, config)
- 2 tests skipped (prisma.test.ts — require live Postgres, unchanged from Phase 1)
- Build: `tsc -p tsconfig.json` exits 0

## Notable Decisions

- **base64url encoding** in crypto.ts instead of base64 — avoids the problem where
  `Buffer.from(enc + "XX", "base64")` silently ignores characters after `=` padding,
  which would have broken the tamper-detection test.
- **`import { Redis } from "ioredis"`** — named import required under `moduleResolution: NodeNext`;
  default import caused TS2709/TS2351 errors.
- **`\p{M}/gu`** Unicode property escape in slugify — more reliable than a hard-coded
  combining-diacritics range for stripping accents from non-ASCII characters.

## Follow-ups

- Phase 3: API package (`packages/api`) — Fastify server, webhook receivers, Telegram bot.
