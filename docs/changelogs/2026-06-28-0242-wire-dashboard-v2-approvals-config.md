# Wire Dashboard V2 Approvals & Config Pages

**Date:** 2026-06-28 02:42 UTC
**Task:** Continue wiring the backend (`@jagit/api`) with new dashboard UI (`@jagit/dashboard-v2`) for Approvals and Config pages.

## Changes Made
- **Unit Test Infrastructure**: Added `packages/dashboard-v2/vitest.config.ts` configured for `jsdom` to isolate Vitest runner from `@lovable.dev/vite-tanstack-config` SSR build crashes.
- **API Client Tests (`lib/api.test.ts`)**: Added comprehensive unit tests covering API fetch wrappers for `listRepoMappings`, `createRepoMapping`, `updateRepoMapping`, `deleteRepoMapping`, `listAgentTemplates`, `createAgentTemplate`, `updateAgentTemplate`, `deleteAgentTemplate`, and `updateMcpServer`.
- **API Mutation Hooks (`hooks/use-api.ts`)**: Added React Query mutations for creating, updating, and deleting Agent Templates, Repo Mappings, Credentials, and MCP Servers, complete with query invalidation.
- **Config Page Wiring (`routes/config.tsx`)**: Replaced static `jigit-data` mock imports with live `useAgentTemplates`, `useRepoMappings`, and `useCredentials` hooks. Wired `AgentForm`, `RepoForm`, and `CredentialForm` dialogs to execute PUT/PATCH mutations against the backend API.
- **Approvals Page Wiring (`routes/approvals.tsx`)**: Replaced static mock imports with live `usePendingApprovals` and `useDecideApproval` hooks. Added real-time Server-Sent Events (SSE) listener (`useApprovalsSSE`) to automatically invalidate and refresh pending approvals upon arrival or decision. Dynamically parsed approval options and styled primary approve vs reject buttons.

## Verification
- Ran unit tests: `pnpm --filter @jagit/dashboard-v2 test` (32/32 passing).
- Verified backend builds: `pnpm --filter @jagit/shared build` and `pnpm --filter @jagit/api build` completed cleanly without errors.
