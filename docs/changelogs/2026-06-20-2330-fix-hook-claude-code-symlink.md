# Session Changelog — 2026-06-20-2330-fix-hook-claude-code-symlink

## Task
Fix `@jigit/hook-claude-code` not uploading session data when invoked as a global binary.

## Root Cause
The `main()` guard used `import.meta.url === file://${process.argv[1]}`, which fails when the package is installed globally via `npm link` or symlinked (as happens with workspace packages). `import.meta.url` resolves to the real path, while `process.argv[1]` preserves the symlink path, so the comparison is always `false` and `main()` never runs — the hook silently exits without doing anything.

## Fix
Changed the main guard in `packages/hook-claude-code/src/index.ts` to use `realpathSync()` on both paths before comparing:

```typescript
const isMain = import.meta.url.startsWith("file://") &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) void main();
```

## Files Changed
- `packages/hook-claude-code/src/index.ts` — fixed main guard
- `packages/hook-codex/src/index.ts` — fixed main guard (same pattern)
- `packages/hook-copilot/src/index.ts` — fixed main guard (same pattern)

## Tests
- `pnpm --filter "@jigit/hook-*" test` — 6/6 passing across all 3 hook packages
- `pnpm -r build` — clean
- `pnpm -r test` — all green except 2 pre-existing unrelated `webhooks.controller.test.ts` 401 failures

## Verification
Tested manually by piping simulated Claude Code Stop event JSON to the globally installed `jigit-hook-claude-code` binary. Before fix: silent exit (no output). After fix: correctly attempts to POST to `/api/agent-sessions`.

## Follow-ups
- Re-install the global packages to pick up the fix: `npm uninstall -g @jigit/hook-claude-code && npm install -g ./packages/hook-claude-code`
