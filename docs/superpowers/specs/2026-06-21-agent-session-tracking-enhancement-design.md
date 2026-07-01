# Agent Session Tracking Enhancement Design

**Date:** 2026-06-21
**Status:** Draft
**Author:** Claude

## Overview

Enhance the existing agent session reporting system to support Jira integration, time tracking, and lines of code (LOC) metrics. This enables automatic Jira worklog creation based on agent session activity.

## Goals

- Associate agent sessions with Jira tickets via MCP tool
- Track session duration from user prompts
- Capture lines of code changed during session
- Automatically create Jira worklogs with time and token metrics

## Non-Goals (Phase 2)

- Real-time worklog updates during active sessions
- Deactivation/disassociation of Jira tickets
- Multi-day worklog splitting
- Resume session state recovery
- Cleanup job for orphaned state files

---

## Architecture

### Components

**1. HTTP MCP Server** (`/api/session-mcp`)
- Exposes MCP tools for session management
- Authentication via `JAGIT_API_KEY` header
- User identification via `JAGIT_GIT_USERNAME` header
- Tool: `activate-jira(ticketId, sessionId)`

**2. Time Tracking Hook** (`@jigit/hook-claude-code-time-tracking`)
- Triggered by Claude Code `UserPromptSubmit` event
- Manages local state file for duration accumulation
- Captures initial commit SHA
- Syncs state to API asynchronously

**3. Enhanced Stop Hook** (`@jigit/hook-claude-code`)
- Extended to read time tracking state
- Calculates LOC via git diff
- Calculates Base Tokens (BT) from costUsd
- Creates Jira worklog if ticket associated

**4. Database Extensions**
- New optional fields on `AgentSession` model
- Jira ticket association
- Duration and LOC tracking

**5. Jira Worklog Service** (`packages/shared/src/jira-worklog.ts`)
- Jira API integration
- Worklog formatting and creation
- Retry logic for transient failures

### Data Flow

```
Session Start
    ↓
UserPromptSubmit hook fires
    ↓
Time tracking initialized (capture initial commit SHA)
    ↓
Subsequent UserPromptSubmit events accumulate duration
    ↓
MCP tool /activate-jira called (optional)
    ↓
Stop hook fires
    ↓
Calculate LOC, total duration, BT
    ↓
If Jira associated: create worklog
    ↓
Report session to API (existing flow)
    ↓
Cleanup state file
```

---

## Database Schema

### AgentSession Model Extensions

Add the following optional fields to the `AgentSession` model:

```prisma
model AgentSession {
  // ... existing fields ...
  
  // Jira association
  jiraTicketId    String?   // Jira issue key (e.g., "PROJ-123")
  
  // Time tracking
  initialCommitSha String?  // Git SHA at session start
  durationMs       Int?      // Total accumulated session duration in milliseconds
  
  // Lines of code
  linesAdded      Int?       // Lines added (from git diff)
  linesRemoved    Int?       // Lines removed (from git diff)
  
  // Indexes
  @@index([jiraTicketId])
}
```

**Migration:** `20260621120000_add_session_tracking_fields`

**Rationale for optional fields:**
- `jiraTicketId` - not all sessions have Jira tickets
- `initialCommitSha` - only captured if time tracking runs
- `durationMs`, `linesAdded`, `linesRemoved` - calculated at session end

---

## HTTP MCP Server

### Endpoint

**URL:** `POST /api/session-mcp`
**Headers:**
- `x-api-key: JAGIT_API_KEY` (authentication)
- `x-git-username: JAGIT_GIT_USERNAME` (user identification)

### MCP Tool Definition

```typescript
{
  name: "activate-jira",
  description: "Associate a Jira ticket with an active agent session for worklog tracking",
  inputSchema: {
    type: "object",
    properties: {
      ticketId: {
        type: "string",
        description: "Jira issue key (e.g., PROJ-123)"
      },
      sessionId: {
        type: "string", 
        description: "Agent session ID to associate"
      }
    },
    required: ["ticketId", "sessionId"]
  }
}
```

### Request Flow

1. Authenticate via `x-api-key` header
2. Extract user from `x-git-username` header
3. Validate session exists and belongs to user
4. Update `jiraTicketId` on AgentSession record
5. Return success response

### Response Format

```json
{
  "success": true,
  "sessionId": "abc-123",
  "jiraTicketId": "PROJ-123",
  "message": "Jira ticket associated with session"
}
```

### Error Cases

- **401** - Invalid/missing API key
- **400** - Invalid ticketId or sessionId format
- **404** - Session not found or doesn't belong to user
- **409** - Session already has a different Jira ticket associated

### Module Structure

```
packages/api/src/session-mcp/
├── session-mcp.controller.ts      # MCP endpoint
├── session-mcp.service.ts         # Business logic
├── session-mcp.module.ts          # NestJS module
└── session-mcp.controller.test.ts # Tests
```

---

## Time Tracking Hook

### Package: `@jigit/hook-claude-code-time-tracking`

### Event Trigger

Claude Code `UserPromptSubmit` event

### Input Format

```json
{
  "session_id": "abc-123",
  "timestamp": "2026-06-21T10:30:00Z",
  "cwd": "/path/to/repo"
}
```

### Algorithm

```
1. Parse stdin to extract session_id, timestamp, cwd
2. Determine state file path: {cwd}/.jigit-session-{session_id}.json
3. If state file doesn't exist:
   a. Capture initial commit SHA: git rev-parse HEAD
   b. Initialize state: { sessionId, initialCommitSha, totalDurationMs: 0, lastUpdateTime: timestamp }
   c. Write state file
   d. Async: PATCH /api/agent-sessions/{sessionId}/time-tracking (set initialCommitSha)
4. If state file exists:
   a. Read current state
   b. Calculate elapsed: currentTimestamp - lastUpdateTime
   c. totalDurationMs += elapsed
   d. Update state file
   e. Async: PATCH /api/agent-sessions/{sessionId}/time-tracking (update durationMs)
```

### State File Format

**File:** `.jigit-session-{sessionId}.json`

```json
{
  "sessionId": "abc-123",
  "initialCommitSha": "a1b2c3d4...",
  "totalDurationMs": 3600000,
  "lastUpdateTime": "2026-06-21T11:30:00Z"
}
```

### Package Structure

```
packages/hook-claude-code-time-tracking/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main hook script
│   ├── state.ts              # State file management
│   └── git.ts                # Git operations
└── tests/
    └── index.test.ts
```

### Configuration

Environment variables:
- `JAGIT_BASE_URL` - API endpoint
- `JAGIT_API_KEY` - Authentication key

---

## Enhanced Stop Hook

### Changes to `@jigit/hook-claude-code`

### New Behavior

1. Read time tracking state file (if exists)
2. Calculate LOC from git diff
3. Calculate BT from costUsd
4. Include new fields in payload
5. Create Jira worklog (if ticket associated)

### Algorithm

```
1. Parse stdin (Stop event)
2. Build existing payload (tokens, model, etc.) - UNCHANGED
3. Check for time tracking state file: {cwd}/.jigit-session-{sessionId}.json
4. If state file exists:
   a. Read totalDurationMs, initialCommitSha
   b. Run git diff: git diff --numstat {initialCommitSha} HEAD
   c. Parse diff output to count linesAdded, linesRemoved
   d. Add durationMs, initialCommitSha, linesAdded, linesRemoved to payload
5. Calculate BT if costUsd available:
   a. BT = (costUsd / 67.5) * 270_000_000
   b. Add baseTokens to payload
6. Report session to API (existing flow)
7. Check if jiraTicketId exists (via API lookup)
8. If jiraTicketId exists:
   a. Create Jira worklog via JiraWorklogService
   b. Format: "AI Logwork for {ticketId}\nTime Spent: {hours}h\nToken Spent: {BT} BT"
9. Cleanup: Delete time tracking state file
```

### Git Diff Calculation

```bash
git diff --numstat {initialCommitSha} HEAD
# Output: additions\tdeletions\tfilename
# Sum all additions and deletions
```

### Base Token (BT) Calculation

**Conversion Rate:**
- 270,000,000 BT = $67.5 USD
- **Formula:** `BT = (costUsd / 67.5) * 270_000_000`

**Example:**
- Session cost: $0.50
- BT = (0.50 / 67.5) * 270,000,000 = 2,000,000 BT

### Worklog Format

```
AI Logwork for PROJ-123
Time Spent: 2h 30m
Token Spent: 2,000,000 BT
```

**Jira API Call:**
```
POST /rest/api/2/issue/{ticketId}/worklog
{
  "timeSpentSeconds": {durationMs / 1000},
  "comment": "AI Logwork for {ticketId}\nTime Spent: {hours}h {minutes}m\nToken Spent: {BT} BT"
}
```

---

## API Endpoint for Time Tracking

### Endpoint

**URL:** `PATCH /api/agent-sessions/:sessionId/time-tracking`

**Headers:**
- `x-api-key: JAGIT_API_KEY`

### Request Body

```json
{
  "initialCommitSha": "a1b2c3d4...",
  "durationMs": 3600000
}
```

### Response

```json
{
  "id": "session-cuid",
  "sessionId": "abc-123",
  "durationMs": 3600000,
  "initialCommitSha": "a1b2c3d4..."
}
```

### Purpose

- Partial updates for hooks (don't need full session payload)
- Cleaner separation from full session upsert
- Hooks can update incrementally without conflict

---

## Jira Worklog Service

### Location

`packages/shared/src/jira-worklog.ts`

### Interface

```typescript
export interface CreateWorklogOpts {
  ticketId: string;
  durationMs: number;
  baseTokens: number;
  comment?: string;
}

export async function createJiraWorklog(opts: CreateWorklogOpts): Promise<void>
```

### Implementation

- Retrieve Jira credentials from Credential table (kind: `jira`)
- Format worklog comment
- POST to Jira API with retry logic
- Handle errors gracefully (log, don't throw)

### Error Handling

- If Jira API fails, log error but don't fail session reporting
- Use `withRetry` for transient failures
- Max retries: 3

---

## Error Handling

### Hook Failures

**Time Tracking Hook Fails:**
- Log error, continue without time tracking
- Session still reports to API (graceful degradation)
- Missing `durationMs` means no worklog time

**Stop Hook - Git Operations Fail:**
- `git diff` fails (repo deleted, detached HEAD, etc.)
- Log warning, set `linesAdded`/`linesRemoved` to `null`
- Continue with session reporting

**Stop Hook - Jira Worklog Fails:**
- Jira API unavailable or auth failure
- Log error, don't fail the session report
- User can manually create worklog later

### MCP Server Edge Cases

**Session Not Found:**
- Return 404 with clear error message

**Session Already Associated:**
- Return 409 conflict

**Invalid Jira Ticket Format:**
- Return 400 validation error

### Data Consistency

**State File Missing at Stop:**
- Skip duration/LOC, continue with session report
- Log warning for debugging

**Concurrent Updates:**
- State file writes use atomic operations (write to temp, rename)
- API updates use optimistic concurrency (last write wins)

**Session Resume:**
- Claude Code resume creates new session ID
- Old state file orphaned (cleanup job in Phase 2)

---

## Testing Strategy

### Unit Tests

**Time Tracking Hook Package:**
- State file initialization logic
- Duration accumulation calculations
- Git SHA capture (mocked git commands)
- API sync calls (mocked fetch)

**Stop Hook Enhancements:**
- Git diff parsing
- BT calculation from costUsd
- Jira worklog formatting
- Missing state file handling

**MCP Controller:**
- Authentication validation
- Session lookup by user
- Ticket association logic
- Error responses (404, 409, etc.)

**Time Tracking API Endpoint:**
- Partial field updates
- Session not found handling
- Concurrent update handling

### Integration Tests

**Full Hook Flow:**
- UserPromptSubmit hook initializes state
- Multiple UserPromptSubmit events accumulate duration
- Stop hook reads state, calculates LOC, creates worklog
- State file cleanup

**MCP + Session Flow:**
- Create session via hook
- Call `/activate-jira` MCP tool
- Verify Jira ticket stored in DB
- Stop hook creates worklog for associated ticket

**Jira Worklog Integration:**
- Mock Jira API server
- Verify correct API calls
- Verify worklog format
- Handle API failures gracefully

### Manual Testing Checklist

- [ ] Time tracking hook fires on UserPromptSubmit
- [ ] State file created in working directory
- [ ] Duration accumulates across multiple prompts
- [ ] MCP tool associates Jira ticket
- [ ] Stop hook captures LOC from git diff
- [ ] Worklog appears in Jira after session ends
- [ ] Cleanup removes state file
- [ ] Graceful degradation when hooks fail

---

## Security Considerations

### API Authentication

- MCP server uses same authentication as existing API endpoints
- `JAGIT_API_KEY` header validated against `loadConfig().dashboardApiToken`
- User identification via `JAGIT_GIT_USERNAME` header

### Jira Credentials

- Stored in Credential table with encryption at rest
- Never logged or returned in API responses
- Retrieved securely for worklog creation

### State File Security

- State files stored in repo working directory
- Contain no sensitive data (only session metadata)
- Cleaned up at session end

---

## Performance Considerations

### Hook Performance

- Time tracking hook runs synchronously, but API sync is async
- Minimal impact on Claude Code session responsiveness
- State file I/O is fast (local filesystem)

### API Load

- Time tracking updates are lightweight PATCH requests
- Can be throttled if needed (e.g., max 1 update per minute)
- Stop hook does final aggregation

### Jira API Rate Limits

- Worklog creation happens once per session
- Retry logic handles transient rate limiting
- Non-blocking (doesn't fail session reporting)

---

## Deployment Considerations

### Database Migration

- Run `prisma migrate deploy` before deploying code
- Migration adds optional columns (backward compatible)

### Hook Package Publishing

- Publish `@jigit/hook-claude-code-time-tracking` to npm
- Users install globally: `npm i -g @jigit/hook-claude-code-time-tracking`
- Configure Claude Code hooks to call the package

### MCP Server Configuration

- Configure Claude Code MCP settings to point to `/api/session-mcp`
- Provide `JAGIT_API_KEY` and `JAGIT_GIT_USERNAME` in MCP server config

---

## Future Enhancements (Phase 2)

- Deactivation/disassociation of Jira tickets
- Real-time worklog updates during long sessions
- Multi-day worklog splitting
- Resume session state recovery
- Cleanup job for orphaned state files
- Per-user API keys
- Rate limiting for time tracking updates
- Detailed event timeline (per-prompt breakdown)
- OpenCode and Cursor adapter support
