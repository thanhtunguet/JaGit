# 2026-06-15 2200 — Config UI and Approvals Page (Tasks 5-11)

## Task

Implement the Config UI (editable credentials/repo-mappings/agent-templates) and the
Awaiting Approval cross-job page as specified in
`docs/superpowers/specs/2026-06-15-config-ui-and-approvals-design.md`.

## What Changed

### packages/shared

- `src/credentials.ts` — Zod schemas per credential kind, `credentialSecretKeys`,
  `validateCredential`, `mergeSecrets` (blank = keep existing)
- `src/config.ts` — added `dashboardApiToken` field (`DASHBOARD_API_TOKEN`)
- `src/events.ts` — added `approvalsChannel = "approvals"` constant
- `src/index.ts` — explicit re-export of credentials to avoid Prisma `CredentialKind` collision
- `tsconfig.json` — exclude `**/*.test.ts` from build compilation

### packages/api

- `src/auth/auth.guard.ts` — `AuthGuard` (`CanActivate`) with `extractBearer` + `verifyToken`
  (timingSafeEqual)
- `src/config/credentials.service.ts` + controller — CRUD; `list` redacts secrets;
  `update` merges blank-field-preserving secrets before re-validation
- `src/config/repo-mappings.service.ts` + controller — CRUD with FK check on
  `agentTemplateId` (BadRequestException) and duplicate jiraProjectKey (ConflictException)
- `src/config/agent-templates.service.ts` + controller — CRUD; body accepts `prompt` alias
  for `systemPrompt`, with sane defaults for all Prisma-required fields
- `src/config/config.module.ts` — wires all three services; `ENCRYPTION_KEY` factory
- `src/app.module.ts` — swapped `ConfigViewModule` → `ConfigModule`
- Deleted `src/config-view/` (read-only placeholder)
- `src/approvals/approvals.service.ts` — added `listPending()`; `decide()` now publishes
  `{type:"resolved"}` to `approvalsChannel`
- `src/approvals/approvals.controller.ts` — added `GET /approvals` and `GET /approvals/stream`

### packages/worker

- `src/graph.ts` — fires `publishEvent(redisUrl, approvalsChannel, {type:"approval_requested",...})`
  after creating each Approval row; new imports from shared
- `src/graph.test.ts` — mocks `@jigit/shared` (publishEvent, loadConfig) and `./approval.js`;
  new test verifies global publish

### packages/dashboard

- `src/api/client.ts` — request() sends Authorization Bearer from sessionStorage; CRUD
  helpers for credentials/repo-mappings/agent-templates; `listPendingApprovals`;
  `getStoredToken`/`setStoredToken`; `useApprovalsSSE` hook
- `src/pages/Approvals.tsx` — NEW: live pending-approval list with inline approve/reject,
  SSE-driven updates (resolved removes card, approval_requested reloads)
- `src/pages/Config.tsx` — REPLACED: editable tables with create/edit/delete dialogs for
  credentials, repo mappings, and agent templates; API token bar
- `src/components/layout/AppShell.tsx` — added Approvals nav item with live pending-count badge
- `src/App.tsx` — added `/approvals` route

## Tests Added / Run

- `packages/shared`: 50 pass, 2 skipped
- `packages/api`: 44 total (41 pass, 3 pre-existing webhook env failures)
- `packages/worker`: 10 pass
- `packages/dashboard`: 11 pass
- `pnpm -r build`: all packages build cleanly (0 TS errors after fixes)

## Build Fixes

- `packages/shared/src/index.ts`: explicit named re-export of credentials symbols to resolve
  collision with Prisma-generated `CredentialKind` enum (from `export * from "@prisma/client"`)
- `packages/shared/src/credentials.test.ts`: type assertion on union return of `validateCredential`
- `packages/api/src/config/agent-templates.service.ts`: mapped `AgentTemplateBody` fields
  to actual Prisma schema (`systemPrompt`, `model`, `maxConcurrent`, `allowedTools`, `skills`)

## Follow-ups

- The 3 webhook test failures are pre-existing (WebhooksService calls `loadConfig()` at class
  instantiation; tests don't set `DASHBOARD_API_TOKEN`)
- The bundle chunk warning (>500 kB) is non-blocking; can be addressed with code splitting
