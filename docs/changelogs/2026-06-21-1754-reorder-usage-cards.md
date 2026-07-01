# Reorder Dashboard Usage Cards (2026-06-21)

## Summary
Reordered the layout of the Usage dashboard so that the top tools and shell commands are displayed before the sessions table.

## Changes Made
- Modified `Usage.tsx` in `@jagit/dashboard` to move the grid containing `ToolsChart` and `ShellCommandsChart` above the `SessionsTable`. The `SessionsTable` is now the final component at the bottom of the Historical view.

## Testing
- Verified successful typecheck for `@jagit/dashboard`.
