# 2026-06-20 20:50 — AuthGuard: accept x-api-key alongside Bearer token

## Task

Improve `AuthGuard` so it accepts either a `Bearer` token (Authorization header)
or an `x-api-key` header, temporarily verifying both against the same
`DASHBOARD_API_TOKEN` value (`loadConfig().dashboardApiToken`).

## Changes

- `packages/api/src/auth/auth.guard.ts` — `canActivate` now checks the existing
  `Authorization: Bearer <token>` path first, and falls back to an
  `x-api-key: <token>` header, using the same constant-time `verifyToken`
  comparison against `this.token` for both. Throws `UnauthorizedException` only
  if neither check passes. No constructor/API change, so all 10 existing
  `@UseGuards(new AuthGuard(loadConfig().dashboardApiToken))` call sites in
  `config/*.controller.ts`, `usage/usage.controller.ts`, and
  `approvals/review-requests.controller.ts` are unaffected.
- `packages/api/src/auth/auth.guard.ts` — added a `TODO` noting the API key
  currently reuses `dashboardApiToken` and should get its own secret later.

## Tests

TDD: wrote 3 new tests first (correct `x-api-key`, wrong `x-api-key`, `x-api-key`
wins over a malformed `Authorization` header), watched them fail with
`UnauthorizedException` (RED), then implemented the minimal fallback (GREEN).

- `pnpm --filter @jigit/api test -- auth.guard` → 16/16 passing (was 13).
- `pnpm --filter @jigit/api test` (full suite) → 82/84 passing; the 2 failures
  are the pre-existing, unrelated `webhooks.controller.test.ts` 401 issue
  already tracked in `CLAUDE.md`/prior changelogs — untouched by this change.

## GitNexus

- `impact({target: "AuthGuard", direction: "upstream"})` → risk `MEDIUM`
  (10 direct callers, 0 affected processes), all `@UseGuards(...)` sites — safe
  since the constructor signature didn't change.
- `detect_changes()` → risk `low`, 4 touched symbols confined to
  `auth.guard.ts` / `auth.guard.test.ts`, 0 affected processes.

## Follow-ups

- Issue a dedicated API key secret instead of reusing `dashboardApiToken` once
  a real consumer needs one (see TODO in `auth.guard.ts`).
