# MCP HTTP + stdio transport support

## Task

Extend MCP server configuration to support both `stdio` and `http` transports; update dashboard UI accordingly.

## Changes

### Schema / migration
- `McpServerConfig`: `transport` (`stdio`|`http`), optional `url`, `headers` JSON; `command` default `""`
- Migration: `20260616100000_mcp_http_transport`

### Shared
- `mcp-config.ts`: Zod validation — stdio requires `command`, http requires `url`
- `mcp-servers.ts`: `AcpMcpServer` union (stdio vs `{ type: "http", ... }`), `buildAcpMcpServers` branches on transport

### API
- `mcp-servers.service.ts`: CRUD returns `transport`, `url`, `headers`; `toCreateData` per transport

### Dashboard
- `McpServerDialog`: transport selector; stdio fields vs http url/headers
- `McpServers` page: Transport + Endpoint columns
- `client.ts`: types and CRUD payloads updated

## Tests

- `packages/shared`: mcp-config + mcp-servers (64 passed)
- `packages/api`: mcp-servers.service (4 passed)
- `packages/worker`: 19 passed
- `packages/dashboard`: client.test (17 passed)
- `pnpm -r build` — pass

## Deploy

Run `prisma migrate deploy` for `20260616100000_mcp_http_transport`.

## Follow-ups

None.
