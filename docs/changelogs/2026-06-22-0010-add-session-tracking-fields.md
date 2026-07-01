# 2026-06-22 00:10: Add Session Tracking Fields

## Task
Database Migration for Session Tracking Fields

## What changed
- `packages/shared/prisma/schema.prisma`: Added `jiraTicketId`, `initialCommitSha`, `durationMs`, `linesAdded`, and `linesRemoved` to the `AgentSession` model. Added an index on `jiraTicketId`.
- `packages/shared/prisma/migrations/20260621120000_add_session_tracking_fields/migration.sql`: Created the SQL migration manually since `prisma migrate dev` could not connect to the database via Docker networking on the host.

## Next up
Task 2: Jira Worklog Service.
