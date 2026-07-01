# Dashboard V2 Jobs & JobDetail Live Integration

## Task
Continue wiring API with new dashboard v2: Jobs page (`jobs.tsx` and `jobs_.$id.tsx`).

## What Changed
- **`packages/dashboard-v2/src/routes/jobs.tsx`**: Wired jobs overview list to live backend hooks (`useJobs`, `useControlJob`, `useDecideApproval`, `useSSE`), replacing hardcoded mock data.
- **`packages/dashboard-v2/src/routes/jobs_.$id.tsx`**: Wired detailed job view to real-time status updates and execution logs via `useJob` and `useSSE`.
- **`packages/dashboard-v2/src/hooks/use-sse.ts`**: Added environment checks for `typeof EventSource` to prevent server-side rendering errors during SSR bundling and Vitest JSDOM testing.
- **`packages/dashboard-v2/src/routes/__root.tsx`**: Updated stylesheet attribute generation to handle SSR manifest link resolution safely.
- **`packages/dashboard-v2/src/routes/jobs.test.tsx`**: Updated tests to asynchronously await router loading before asserting UI states.
- **`packages/dashboard-v2/package.json` & `pnpm-lock.yaml`**: Updated `@tanstack/react-router` (`^1.170.16`), `@tanstack/react-start` (`^1.168.26`), and purged stale node_modules directories to resolve TanStack Router SSR export mismatches (`MISSING_EXPORT` errors during Nitro compilation).

## Verification
- Ran `pnpm --filter @jagit/dashboard-v2 test` — 42/42 tests passing.
- Ran `pnpm --filter @jagit/dashboard-v2 build` — clean Nitro server and client bundle generation.
- Ran `pnpm -r test` — all 147 unit tests across all workspace packages passing.
- Ran `pnpm -r build` — all packages successfully built.
