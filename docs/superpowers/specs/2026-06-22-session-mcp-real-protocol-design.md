# `session-mcp` Real MCP Protocol — Design

## Problem

`POST /api/session-mcp` was built to be configured as an MCP server in Claude
Code's `.claude.json` (`"type": "http"`), per
`docs/superpowers/specs/2026-06-21-agent-session-tracking-enhancement-design.md`.
In practice it is a plain REST endpoint: `SessionMcpController.executeTool`
destructures `body.name` / `body.arguments` directly off the raw HTTP body,
assuming a body shape of `{ name: "activate-jira", arguments: {...} }`.

Claude Code's MCP client does not send that shape. It speaks the real MCP
JSON-RPC protocol over Streamable HTTP — `initialize`, `tools/list`,
`tools/call` — wrapping the tool name and arguments inside a JSON-RPC envelope
(`{"jsonrpc":"2.0","method":"tools/call","params":{"name":...,"arguments":...}}`).
Reading `body.name` off that envelope yields `undefined`, so the controller's
`if (body.name !== "activate-jira")` check always fails, producing:

```json
{"message":"Unknown tool: undefined","error":"Bad Request","statusCode":400}
```

This is a protocol mismatch, not a config or auth problem — confirmed by
checking that no `@modelcontextprotocol/sdk` dependency exists anywhere in
`packages/api`. Root cause: the endpoint was named/specced as "MCP" but never
implemented on top of the MCP SDK or protocol.

## Goal

Make `/api/session-mcp` a genuine MCP-over-Streamable-HTTP server so it works
as configured in `.claude.json`, while preserving existing auth
(`AuthGuard`: `Authorization: Bearer` or `x-api-key`) and the
`x-git-username` header contract, and keeping the `activate-jira` tool's
business behavior unchanged.

## Decisions

- **Tool registry, not a single hardcoded check.** Build the MCP server from
  a small array of `{ name, description, inputSchema (zod), handler }`
  entries. Today it holds exactly one entry (`activate-jira`); adding a
  second session-related tool later means appending to the array, not
  touching dispatch logic.
- **Stateless transport.** Each `POST /api/session-mcp` builds a fresh
  `McpServer` + `StreamableHTTPServerTransport({ sessionIdGenerator:
  undefined })`, handles one JSON-RPC request, then closes both. No
  session-ID bookkeeping, no GET/DELETE session endpoints — matches the
  tool's actual one-shot usage pattern and fits NestJS's per-request model
  cleanly.
- **Fastify raw req/res inside the existing Nest controller.** The SDK's
  `transport.handleRequest(req, res, body)` expects Node's raw
  `IncomingMessage`/`ServerResponse`. Get these via `request.raw` /
  `reply.raw` on Fastify's request/reply objects, injected into the
  controller method with `@Req()`/`@Res()`. This keeps the route inside the
  normal Nest controller/module/guard/Swagger structure rather than
  registering a bypass Fastify plugin.
- **Error semantics split by layer.** Transport-level checks (`AuthGuard`,
  missing `x-git-username` header) happen before MCP dispatch and continue
  to throw real Nest HTTP exceptions (401/400), exactly as today. Once
  inside the `activate-jira` tool handler, business errors (session not
  found, ticket already associated with a different ticket) are caught and
  returned as an MCP `CallToolResult` with `isError: true` and a
  `content: [{type: "text", text: <message>}]`, per MCP convention — not as
  Nest `NotFoundException`/`ConflictException` propagating as raw HTTP
  404/409. This matches how MCP clients (including Claude Code) expect tool
  call failures to be reported: a 200 OK envelope with `isError: true`, not
  a non-200 HTTP status.

## Components

### `session-mcp.server.ts` (new)

Exports a factory, e.g. `createSessionMcpServer(ctx: { username: string;
service: SessionMcpService })`, that:

- Constructs a new `McpServer({ name: "jagit-session", version: "1.0.0" },
  { capabilities: { tools: {} } })`.
- Registers each tool from the registry via `server.registerTool(name,
  { description, inputSchema }, handler)`.
- `activate-jira` handler: calls `service.activateJira(sessionId, username,
  ticketId)`; on success returns `{ content: [{ type: "text", text:
  JSON.stringify(result) }] }`; on `NotFoundException`/`ConflictException`
  (or any thrown error) returns `{ isError: true, content: [{ type: "text",
  text: error.message }] }` instead of rethrowing.

### `session-mcp.controller.ts` (rewritten)

- Keeps `@UseGuards(new AuthGuard(loadConfig().dashboardApiToken))` and the
  `x-git-username` header check unchanged.
- On a valid request: builds a fresh server (via the factory, passing the
  resolved `username`) and a stateless `StreamableHTTPServerTransport`,
  connects them, then awaits `transport.handleRequest(request.raw,
  reply.raw, request.body)`.
- Closes transport + server after the response completes (e.g. on
  `reply.raw`'s `"close"` event), mirroring the SDK's own stateless example
  (`examples/server/simpleStatelessStreamableHttp.js`).
- No longer destructures `body.name`/`body.arguments` itself — the SDK owns
  all JSON-RPC parsing and dispatch.

### `session-mcp.module.ts`

Unchanged structurally; still wires `SessionMcpController` +
`SessionMcpService` + `PrismaService`.

### Dependency change

Add `@modelcontextprotocol/sdk` as a direct dependency of `packages/api`
(already resolved in `pnpm-lock.yaml` at `1.29.0` via the worker package;
this makes it an explicit, correct dependency rather than an incidental
hoist).

## Data Flow

```
POST /api/session-mcp  (real MCP JSON-RPC body)
  → AuthGuard                      (unchanged: Bearer or x-api-key) — HTTP 401 on failure
  → x-git-username header check    (unchanged)                      — HTTP 400 on failure
  → build fresh McpServer + StreamableHTTPServerTransport (stateless)
  → transport.handleRequest(raw req, raw res, body)
      → SDK parses JSON-RPC method
          initialize   → MCP handshake response
          tools/list   → registry's tool definitions (name/description/inputSchema)
          tools/call "activate-jira"
              → handler → SessionMcpService.activateJira()
                  success        → CallToolResult { content: [text] }
                  business error → CallToolResult { isError: true, content: [text] }
  → transport/server closed once response finishes
```

## Testing

Per CLAUDE.md, TDD is mandatory: write the failing test first.

Rewrite `session-mcp.controller.test.ts` to drive real MCP protocol exchanges
against the Nest+Fastify test app, either via the MCP SDK's
`StreamableHTTPClientTransport` + `Client`, or by hand-crafting JSON-RPC
bodies through `app.inject()` (`initialize`, `tools/list`, `tools/call`).
Cases to cover:

- `tools/list` returns `activate-jira` with its input schema.
- `tools/call activate-jira` success path returns a `CallToolResult` with
  the same success payload as today.
- `tools/call activate-jira` for a missing session returns
  `isError: true` (not a 404).
- `tools/call activate-jira` for a ticket conflict returns `isError: true`
  (not a 409).
- Auth guard rejection (no/invalid Bearer or `x-api-key`) — unchanged,
  still asserts raw HTTP 401.
- Missing `x-git-username` header — unchanged, still asserts raw HTTP 400.

## Out of scope

- Stateful MCP sessions (session-ID-keyed transport reuse) — not needed for
  this tool's one-shot usage pattern.
- Additional tools beyond `activate-jira` — the registry is built to make
  adding them easy later, but none are added in this change (YAGNI).
- Changing `AuthGuard` or the `x-git-username` contract.
