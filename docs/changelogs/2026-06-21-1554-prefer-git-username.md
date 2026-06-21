# Session: Prefer git user over email for hooks

- **Task**: Change hooks to get git user instead of git email by default.
- **Changed Files**:
  - `packages/agent-reporter/src/git-username.ts`
  - `packages/agent-reporter/src/git-username.test.ts`
- **Actions**:
  - Modified `resolveGitUsername` to try `git config user.name` before falling back to `git config user.email`.
  - Updated unit tests to expect `user.name` as the primary git fallback.
- **Tests**:
  - Ran `pnpm --filter @jagit/agent-reporter test` which passed.
