# Job detail — Events/Raw max height + Monaco

## Task

Job detail page: Events tab uses max available viewport height; Raw tab uses a readonly Monaco editor at max available height.

## Changes

- `packages/dashboard/package.json` — added `@monaco-editor/react`
- `packages/dashboard/src/components/JsonMonacoViewer.tsx` — new readonly JSON Monaco viewer (`vs-dark`, word wrap, no minimap)
- `packages/dashboard/src/pages/JobDetail.tsx` — flex column layout (`h-[calc(100vh-3rem)]`) so tab panels fill remaining viewport; Events `ScrollArea` uses `h-full` instead of fixed `h-96`; Raw tab renders `JsonMonacoViewer` instead of `<pre>`

## Tests

- `pnpm --filter @jigit/dashboard typecheck` — pass
- `pnpm --filter @jigit/dashboard build` — pass

## Follow-ups

- Optional: lazy-load Monaco on Raw tab open to reduce main bundle size (~692 kB JS)
