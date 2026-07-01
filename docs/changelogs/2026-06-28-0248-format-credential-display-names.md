# Format Credential Display Names in Dashboard V2

**Date:** 2026-06-28 02:48 UTC
**Task:** Display credential types (Jira, GitLab, Telegram, Anthropic, Claude Code) when credential names are set to `"default"` in `dashboard-v2`.

## Changes Made
- **API Helper (`packages/dashboard-v2/src/lib/api.ts`)**: Created `formatCredentialName` helper function that formats raw credential kinds into human-readable labels (`jira` → `Jira`, `gitlab` → `GitLab`, etc.). Automatically replaces the generic `"default"` name or redundant kind-matching names with the formatted credential type title, while preserving custom naming schemes as `Type (Custom Name)`.
- **UI Wiring (`packages/dashboard-v2/src/routes/config.tsx`)**: Applied `formatCredentialName` to the primary title in the credentials list and inside the `CredentialForm` edit dialog header. Added `useMcpServers` hook and built `mcpServerMap` lookup table to display MCP server names instead of raw IDs inside the Agent Templates column.
- **Unit Tests (`packages/dashboard-v2/src/lib/api.test.ts`)**: Added unit tests verifying display formatting across default and custom credential names.

## Verification
- Ran unit tests: `pnpm --filter @jagit/dashboard-v2 test` (33/33 passing).
- Verified backend builds: `pnpm --filter @jagit/shared build && pnpm --filter @jagit/api build` completed cleanly without errors.
