# Wire MCP Servers Page in Dashboard V2

## Task
Continue wiring dashboard v2 UI with backend API by implementing live query and mutation integration for the MCP Servers page (`/mcp-servers`).

## What Changed
- Replaced hardcoded mock `MCP_SERVERS` data in `packages/dashboard-v2/src/routes/mcp-servers.tsx` with real API queries (`useMcpServers`) and mutations (`useCreateMcpServer`, `useUpdateMcpServer`, `useDeleteMcpServer`).
- Added full interactive support for creating, editing, and deleting MCP server configurations across both Grid and List (table) view modes.
- Added support for dynamic key-value environment variables and headers, with helper functions (`parseEnvValue`, `formatEnvValue`) allowing seamless referencing of stored credentials using `credential:kind/name#secretKey` syntax.
- Updated server detail views and grid/table rows to display execution commands, arguments, and status tones correctly corresponding to real backend configuration schemas (`McpServerItem`).

## Verification & Tests
- Ran `pnpm --filter @jagit/dashboard-v2 test` — 33/33 tests passing.
- Ran full workspace test suite `pnpm -r test` — all packages passing (147/147 tests passing in api, all hooks passing).

## Follow-ups
- Resolve TanStack Router package mismatches in `dashboard-v2` SSR build (`@tanstack/router-core` missing exports during Vite/Nitro bundling).
