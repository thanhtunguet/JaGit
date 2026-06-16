# MCP Review + MCP Config Dashboard

**Date:** 2026-06-16  
**Task:** JiGit MCP Review + MCP Config Dashboard (plan implementation)

## Summary

Built-in `jigit` MCP server with `jigit_request_review` tool, MCP server CRUD + dashboard page, AgentTemplate MCP assignment, worker ACP session injection, and hard commit guard when review is required.

## Changes

### Shared (`packages/shared`)
- Prisma: `McpServerConfig` model; `AgentTemplate.mcpServerIds`, `requireReviewBeforeCommit`; `Job.reviewApprovedAt`
- Migration: `20260616000000_mcp_review`
- `mcp-config.ts` — Zod schemas, `resolveMcpEnv` (credential refs), `isApproveOptionId`
- `mcp-servers.ts` — `buildAcpMcpServers`, `buildReviewInstruction`
- `approval-bridge.ts` — `waitForApprovalDecision` (shared Redis subscribe)

### Worker (`packages/worker`)
- `mcp/jigit-server.ts` — stdio MCP with `jigit_request_review`
- `mcp/request-review.ts` — POST `/api/review-requests` + wait for decision
- `acp/client.ts` — `mcpServers` on `session/new`
- `main.ts` — build/inject MCP per job from template + credentials
- `graph.ts` — system prompt, review instruction, `reviewGuard` before commit
- `approval.ts` — uses shared `waitForApprovalDecision`

### API (`packages/api`)
- `config/mcp-servers.*` — CRUD `/api/mcp-servers`
- `approvals/review-requests.controller.ts` — `POST /api/review-requests`
- `approvals.service.ts` — `createReviewRequest`, `reviewApprovedAt` on human_review approve
- `agent-templates.service.ts` — expose new template fields

### Dashboard (`packages/dashboard`)
- Page `/mcp-servers` + `McpServerDialog` (env literal/credential ref)
- AgentTemplate dialog: MCP multi-select, require-review checkbox
- API client CRUD for MCP servers

## Tests

- `pnpm --filter @jigit/shared test` — 60 passed
- `pnpm --filter @jigit/worker test` — 19 passed
- `pnpm --filter @jigit/api test` (MCP/approvals/templates) — 15 passed
- `pnpm --filter @jigit/dashboard test` — 17 passed
- `pnpm -r build` — all packages clean

## Follow-ups

- Run migration on deploy: `prisma migrate deploy`
- Agent must call `jigit_request_review` before session ends when `requireReviewBeforeCommit` is true
