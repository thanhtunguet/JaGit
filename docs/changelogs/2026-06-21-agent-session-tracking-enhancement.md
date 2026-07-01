# Agent Session Tracking Enhancement - 2026-06-21

## Task
Add Jira integration, time tracking, and LOC metrics to agent sessions with automatic worklog creation.

## Changes

### Database
- Added fields to `AgentSession` model: `jiraTicketId`, `initialCommitSha`, `durationMs`, `linesAdded`, `linesRemoved`
- Migration: `20260621120000_add_session_tracking_fields`

### New Packages
- `@jigit/hook-claude-code-time-tracking` - UserPromptSubmit hook for duration tracking
  - Initializes state file with git SHA
  - Accumulates duration across prompts
  - Syncs to API asynchronously

### API Enhancements
- New HTTP MCP server at `/api/session-mcp`
  - Tool: `activate-jira(ticketId, sessionId)`
  - Auth: `x-api-key` and `x-git-username` headers
- New endpoint: `PATCH /api/agent-sessions/:sessionId/time-tracking`
  - Partial updates for `initialCommitSha` and `durationMs`

### Hook Enhancements
- Enhanced Stop hook in `@jigit/hook-claude-code`:
  - Reads time tracking state
  - Calculates LOC via `git diff --numstat`
  - Converts costUsd to Base Tokens (270M BT = $67.5)
  - Creates Jira worklog if ticket associated
  - Cleans up state file

### Shared Services
- New `createJiraWorklog` function in `@jigit/shared`
  - Retrieves Jira credentials from Credential table
  - Formats worklog comment
  - Makes POST to Jira API with retry logic

## Testing
- Unit tests for all new modules
- Integration tests for MCP server
- Manual testing guide provided in spec

## Follow-ups
- Publish hook packages to npm
- Configure Claude Code hooks in user settings
- Test with real Claude Code sessions
- Monitor Jira worklog creation in production
