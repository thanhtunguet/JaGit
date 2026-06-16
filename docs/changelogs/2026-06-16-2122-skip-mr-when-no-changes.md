# Skip MR/Jira-worklog steps when the agent made no changes

**Task:** Debug `source_branch does not exist` GitLab 400 error when opening a
merge request.

## Root cause

`graph.ts` wired `commitAndPush → openMergeRequest` unconditionally. But
`commitAndPush` only ran `git push` inside its `hasChanges` branch — when the
agent produced no working-tree changes, the branch created by `createBranch`
(`git worktree add -b branch ... HEAD`) was committed nowhere and pushed
nowhere, staying purely local. `openMergeRequest` then asked GitLab to open
an MR from that branch, and GitLab correctly responded
`400: source_branch does not exist` since the branch was never pushed.

## Fix

Added a `hasChanges` field to `JobStateAnnotation`, set it from
`commitAndPush`'s result, and added a conditional edge
(`changesCheck`) after `commitAndPush`:

- `hasChanges` → `openMergeRequest` → `jiraWorklog` → `report` (unchanged path)
- no changes → `report` directly, skipping `openMergeRequest` and
  `jiraWorklog` entirely (no API call, no swallowed/invalid error)

`report`'s Telegram message now distinguishes "MR: <url>" vs "No changes — no
MR opened", and still sets job status to `"done"` either way (no changes is
not a failure).

## Tests

- `packages/worker/src/graph.test.ts`: added "skips openMergeRequest and
  jiraWorklog when there are no changes" — asserts `commitAll`/`push`/
  `gitlab.openMergeRequest`/`jira.addWorklog` are never called, status is
  `"done"`, and the Telegram message mentions "No changes".
- `pnpm --filter @jigit/worker test`: 6 files, 22 tests passing.
- `pnpm -r build`: all packages build clean.
- `pnpm -r test`: pre-existing unrelated failures remain in
  `packages/api/src/webhooks/webhooks.controller.test.ts` (401 vs
  202/200, already tracked in CLAUDE.md plan progress before this session).

## Follow-ups

- None for this bug. The previously-failed job's MR step will now either
  open a real MR (when there are changes) or cleanly skip with a "no
  changes" report — no more opaque GitLab 400s from this path.
