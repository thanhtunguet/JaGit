# JiGit — Configuration UI & Awaiting-Approval Page Design

**Date:** 2026-06-15
**Status:** Approved
**Reference MVP spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md`

## Background

The MVP loop is complete, but two operational gaps remain:

1. **No configuration UI.** Credentials for GitLab, Jira, the AI provider (base URL +
   auth token), and Telegram, plus repo mappings and agent templates, can only be
   set via the `pnpm seed` script. The dashboard `Config` page is read-only and tells
   the user to run the seed script.
2. **No dedicated "awaiting approval" view.** Approvals exist (`Approval` model,
   `ApprovalsService.decide()`, `ApprovalCard`) but are only visible buried inside an
   individual job's detail page. There is no cross-job list of approvals awaiting a
   decision.

This design adds editable configuration (full CRUD) and a live, cross-job approvals
page, plus a minimal authentication gate for the new mutating endpoints.

## Goals

- Editable configuration UI: full CRUD for credentials, repo mappings, and agent
  templates, with credential secrets handled write-only (never returned to the
  browser).
- A dedicated page listing all approvals awaiting a decision across jobs, updating
  live, with inline approve/reject.
- A minimal, swappable authentication gate on mutating endpoints.

## Non-Goals (YAGNI)

- Full user management / login / SSO / multi-tenant auth (spec defers to Phase 2;
  we ship a static bearer token designed to be swapped for JWT later).
- Approval history / audit view, bulk approval actions, approval filtering by job.
- A general-purpose global event bus; the approvals SSE channel is approvals-only.
- Changing the existing per-job approval UI in `JobDetail` (stays as-is).

## Current Architecture Notes (verified)

- **API is NestJS** (with Swagger), one module per domain — not Fastify as the older
  CLAUDE.md/plan text says. New work follows the NestJS module/controller/service
  pattern.
- **Secrets** are stored as `Credential.secrets = { encrypted }`, an AES-256-GCM blob
  produced by `shared/crypto.ts` `encrypt()` keyed by `APP_ENCRYPTION_KEY`. Secrets
  are never returned by the API.
- **SSE** is currently per-job: the worker publishes to Redis channel `job:<id>`; the
  API's `SseController` subscribes and relays. Control signals use `control:<id>`.
- **Approvals**: `ApprovalsService.decide()` is idempotent (first writer wins),
  publishes a control signal to the worker, and is callable from Telegram and the
  dashboard.
- **No authentication** exists on any endpoint today.

## Design

### 1. Authentication (shared foundation)

A minimal bearer-token guard, structured so the verification step can later be
replaced by JWT validation without touching call sites.

- **Env:** `DASHBOARD_API_TOKEN` added to `.env.example` and to the Zod-validated
  config loader in `shared/config.ts`.
- **Guard:** a NestJS `AuthGuard` (`packages/api/src/auth/`) that:
  1. Extracts a bearer token from the `Authorization` header (separate, reusable step).
  2. Verifies it against `DASHBOARD_API_TOKEN` using a constant-time comparison.
  - The two steps are separate functions so "verify static token" can be swapped for
    "verify JWT signature" later. Throws `401` on missing/invalid token.
- **Scope:** applied to mutating routes only — `POST`/`PATCH`/`DELETE` on config
  entities and `POST /approvals/:id/decide`. Read endpoints and existing job
  endpoints remain open for the MVP (matches current posture). Tightening reads is a
  documented follow-up.
- **Dashboard:** a small token store (localStorage) and a settings field to enter the
  token. The API client attaches `Authorization: Bearer <token>` on mutating calls.
  A `401` surfaces a clear "set/refresh your API token" message.

### 2. Configuration UI (full CRUD)

Replace the read-only `config-view` module with a full `config` module. Reads stay
public; writes require the auth guard.

#### Credentials (`/credentials`)
- `GET /credentials` → list of `{ id, kind, name, meta, secretKeys }` where
  `secretKeys: string[]` reports which secret fields are set. **Never returns secret
  values.**
- `POST /credentials`, `PATCH /credentials/:id`, `DELETE /credentials/:id`.
- **Write-only masked secrets:** on create/update the body's `secrets` is a partial
  map. Omitted/blank field → keep existing; provided field → overwrite. On update the
  server decrypts the current blob, merges provided fields, re-encrypts. Plaintext
  never leaves the server. A shared `mergeSecrets` helper (decrypt → merge → encrypt)
  is reused by both seed and API.
- **Per-kind validation (Zod, in `shared`):**
  - `jira`: `meta.baseUrl`; secrets `email`, `token`.
  - `gitlab`: `meta.baseUrl`; secret `token`.
  - `anthropic`: secret `apiKey`; optional `meta.baseUrl`.
  - `telegram`: secret `botToken`; `meta.chatId`.

#### Repo mappings (`/repo-mappings`)
- Full CRUD. Validate `agentTemplateId` exists and `jiraProjectKey` is unique.
  `branchPrefixRules` edited as key/value rows.

#### Agent templates (`/agent-templates`)
- Full CRUD. (The MVP spec defers agent-template CRUD to Phase 2; included here per
  the explicit "full CRUD" decision and flagged as beyond original MVP scope.)

#### Frontend (`pages/Config.tsx`)
- Keep the three-section layout, make each section editable.
- shadcn `Dialog` form for create/edit per entity; delete confirmation dialog.
- Credential forms render per-kind fields; secret inputs show a masked "set / not set"
  state with placeholder; blank means keep existing.
- Remove the "read-only / run seed" alert. `pnpm seed` remains valid for first-run
  bootstrap.

### 3. Awaiting-approval page (live, inline decide)

#### Global approvals SSE channel
- New Redis channel `approvals` (a constant in `shared/events.ts`, e.g.
  `approvalsChannel`).
- **Worker** publishes `{ type: "approval_requested", approval, job }` to `approvals`
  at the same point it creates an `Approval` and publishes the per-job event.
- **API** publishes `{ type: "approval_resolved", approvalId, status }` to `approvals`
  from `ApprovalsService.decide()`, so a decision made via Telegram or the job page
  instantly removes the row everywhere.
- New endpoint `GET /approvals/stream` (`@Sse`) subscribing to `approvals`, mirroring
  the existing `SseController` pattern.

#### List endpoint
- `GET /approvals?status=pending` → pending approvals joined with job context:
  `{ id, prompt, options, createdAt, job: { id, jiraIssueKey, status } }`. Backed by a
  new `ApprovalsService.listPending()`.

#### Decide endpoint
- `POST /approvals/:id/decide` unchanged in behavior, now behind the auth guard.

#### Frontend
- New page `pages/Approvals.tsx`, route `/approvals`, nav entry in `AppShell` with a
  pending-count badge.
- Rich rows: Jira issue key (links to job), job status badge, prompt, inline
  Approve/Reject buttons (`decideApproval`), relative age.
- Initial load via `GET /approvals?status=pending`; live updates via a global
  `useApprovalsSSE` hook — `approval_requested` adds a row, `approval_resolved`
  removes it.
- Empty state: "No approvals awaiting decision."

## Data Flow

**Config write:**
`Dashboard form → API client (Bearer token) → AuthGuard → Config controller → Zod
validate → (credentials: mergeSecrets decrypt+merge+encrypt) → Prisma upsert/update`.

**Approval lifecycle:**
`Worker creates Approval + publishes job:<id> and approvals channels → API
/approvals/stream relays → Approvals page adds row`. On decision:
`Approvals page (or JobDetail or Telegram) → decide endpoint → DB update + control
signal to worker + publish approval_resolved on approvals channel → all clients
remove the row`.

## Error Handling

- Auth: `401` on missing/invalid token; dashboard prompts to set the token.
- Validation: `400` with field-level messages from Zod for malformed config bodies.
- Not found: `404` on missing credential/mapping/template/approval ids.
- Uniqueness: `409` (or surfaced `400`) on duplicate `kind+name` credential or
  duplicate `jiraProjectKey`.
- Decide remains idempotent: deciding an already-decided approval returns the existing
  outcome (no error).
- SSE: clients reconnect on drop; initial REST fetch reconciles state on (re)connect.

## Testing

- **shared:** unit tests for `mergeSecrets` (keep/overwrite/merge semantics, never
  emits plaintext) and per-kind credential Zod schemas.
- **api:** AuthGuard (valid/invalid/missing token, constant-time path); Config
  controllers (CRUD happy paths, secret redaction in `GET`, blank-means-keep on
  update, per-kind validation failures); `ApprovalsService.listPending()`; decide
  publishes `approval_resolved`.
- **dashboard:** API client attaches bearer header on mutating calls and handles
  `401`; Approvals page renders rows, applies SSE add/remove, and decides inline;
  Config dialogs submit partial secrets correctly.
- Keep the existing E2E smoke test green.

## Security Considerations

- Secrets remain encrypted at rest and are never serialized to API responses or logs;
  `GET /credentials` exposes only `secretKeys`, not values.
- The bearer token gates mutations; documented as interim until JWT/login lands.
- Constant-time token comparison to avoid timing leaks.
- Read endpoints remain open for the MVP — documented as a follow-up to tighten.

## Follow-ups (documented, not in scope)

- Replace static bearer token with JWT/login; gate read endpoints.
- Approval history/audit view.
- Optional "reveal secret" endpoint if operationally needed.
