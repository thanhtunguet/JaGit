# Session: Task 1 — Shared credential schemas + mergeSecrets

**Date:** 2026-06-15  
**Task:** Implement shared credential validation schemas and `mergeSecrets` helper for API and seed reuse.

## What changed

- **Created:** `packages/shared/src/credentials.ts`
  - `CredentialKindSchema` — Zod enum matching Prisma `CredentialKind`
  - Per-kind schemas: `JiraCredentialSchema`, `GitLabCredentialSchema`, `AnthropicCredentialSchema`, `TelegramCredentialSchema`
  - `mergeSecrets(existingEncrypted | null, provided, keyB64)` — decrypts existing, merges with provided (non-empty overwrites, blank/omitted keeps existing), re-encrypts

- **Created:** `packages/shared/src/credentials.test.ts`
  - 18 tests covering schema validation (valid/invalid per kind) and `mergeSecrets` edge cases

- **Modified:** `packages/shared/src/index.ts`
  - Added `export * from "./credentials.js"`

## Tests

- `pnpm --filter @jigit/shared test credentials` → 18/18 pass
- Full shared suite: 37 pass, 2 skipped

## Follow-ups

- Task 2 will use `mergeSecrets` in the API credentials CRUD endpoint.
