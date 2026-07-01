# 2026-06-28-1137 — Use ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL for Claude Code agent

## Task
Switch the worker's Claude Code agent spawn from the legacy `ANTHROPIC_API_KEY` env var to
the canonical pair `ANTHROPIC_AUTH_TOKEN` (required) and `ANTHROPIC_BASE_URL` (optional
proxy/override), and propagate that change through config, credentials, seed, dashboard UI,
and docs.

## What changed

### `packages/shared/src/config.ts`
- `ANTHROPIC_API_KEY` is now optional.
- Added optional `ANTHROPIC_AUTH_TOKEN` (preferred) and `ANTHROPIC_BASE_URL`.
- A Zod `.refine()` guard requires at least one of the two token vars.
- `parseConfig` exposes `anthropicAuthToken` (= `ANTHROPIC_AUTH_TOKEN ?? ANTHROPIC_API_KEY`),
  `anthropicBaseUrl`, and keeps `anthropicApiKey` as an alias pointing at the same resolved
  token for any existing callers.

### `packages/shared/src/credentials.ts`
- `AnthropicCredentialSchema.secrets` now accepts `authToken` (preferred) OR `apiKey` (legacy).
- `credentialSecretKeys("anthropic")` returns `["authToken", "apiKey"]`.

### `packages/shared/src/seed.ts`
- `buildSeedData` input renamed `anthropicApiKey → anthropicAuthToken`; accepts optional
  `anthropicBaseUrl` and stores it in the credential `meta`.
- Seeded secrets use `authToken` key instead of `apiKey`.

### `scripts/seed.ts`
- Updated call to `buildSeedData` to pass `cfg.anthropicAuthToken` and `cfg.anthropicBaseUrl`.

### `packages/worker/src/main.ts`
- `AcpSession.env` now sets `ANTHROPIC_AUTH_TOKEN` (from `authToken ?? apiKey` in stored
  credential) and conditionally sets `ANTHROPIC_BASE_URL` when the credential's `meta.baseUrl`
  is present.
- `ANTHROPIC_API_KEY` is no longer set in the subprocess environment.

### `packages/dashboard (v1)/src/pages/Config.tsx`
- `SECRET_KEYS.anthropic` updated to `["authToken"]`.
- Form field value/onChange binding changed from `secrets.apiKey` → `secrets.authToken`.

### `packages/dashboard-v2/src/routes/config.tsx`
- `CredentialForm` now branches on `credential.kind === "anthropic"`.
- Anthropic branch shows a dedicated **Auth Token** (`ANTHROPIC_AUTH_TOKEN`) password field and a
  **Base URL** (`ANTHROPIC_BASE_URL`) URL field (pre-populated from `credential.meta.baseUrl`).
- On save, writes `{ authToken }` to secrets and updates `meta.baseUrl` (or removes it if blank).
- All other credential kinds keep the existing generic Metadata (JSON) + "Rotate secret" flow.

### `.env.example`
- Replaced `ANTHROPIC_API_KEY=` with `ANTHROPIC_AUTH_TOKEN=`; added commented-out legacy
  alias and `ANTHROPIC_BASE_URL` hint.

## Tests added / run
- `packages/shared/src/config.test.ts`: new case "parses ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL" — passes.
- `packages/shared/src/credentials.test.ts`: new case "accepts valid anthropic credentials with authToken"; updated `credentialSecretKeys` assertion — passes.
- `packages/shared/src/seed.test.ts`: updated 3 call-sites and the decrypted-secrets assertion — passes.
- `pnpm --filter @jagit/shared test`: 74/76 passing (2 skipped as before).
- `pnpm --filter @jagit/worker test`: 25/25 passing.
- `pnpm -r build`: clean (no TS errors).

## Follow-ups
- Existing DB records that still store `apiKey` in encrypted secrets will continue to work
  (worker reads `authToken ?? apiKey`). Operators should re-seed or update the credential via
  the dashboard to migrate to `authToken`.
- `docker-compose.yml` still references `ANTHROPIC_API_KEY`; update when refreshing the
  compose file.
