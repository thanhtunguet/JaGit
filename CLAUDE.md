# JiGit — Agent Guide

Orchestrator for AI coding agents that work with Jira & GitLab. A Jira issue
assignment triggers a job; JiGit clones the repo, drives an interactive Claude
Code session (over ACP) to implement the change, opens a GitLab merge request,
logs work back to Jira, and reports to Telegram. Humans approve checkpoints via
Telegram inline buttons or the dashboard.

- **Design spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-06-14-jigit-mvp.md` (16 TDD tasks)

## Architecture

pnpm monorepo, all TypeScript. Two runtime services + shared infra:

- `packages/shared` — config, crypto, Prisma client, BullMQ/Redis helpers, retry, branch logic, shared types.
- `packages/api` — Fastify: webhook receivers, REST + SSE, Telegram bot, serves the dashboard.
- `packages/worker` — BullMQ consumer running a per-job LangGraph graph (Postgres checkpointer) that drives Claude Code over ACP.
- `packages/dashboard` — React + Vite + shadcn/ui.
- Postgres = source of truth (jobs/steps/events/approvals + checkpoints). Redis = queue + live pub/sub.

Data flow: `Jira/GitLab webhook → API verify → enqueue Job → Worker runs graph:
clone → branch → Claude Code (ACP) → [permission? pause → Telegram/dashboard → resume] → push → MR → Jira worklog → Telegram report`.

## Tech stack

TypeScript, pnpm workspaces, Fastify, LangGraph.js, BullMQ + Redis, Prisma +
Postgres, Zod, Vitest, React + Vite + shadcn/ui, `@zed-industries/claude-code-acp`,
`node-telegram-bot-api`.

## Conventions & rules

- **TDD is mandatory** — write the failing test first, then the minimal
  implementation. One coherent, committable outcome per task.
- **DRY / YAGNI** — don't build deferred Phase-2 features (CodeBurn ingestion,
  Teams, GitLab MR/comment triggers, Agent Manager CRUD, MCP transport,
  multi-tenant auth). See spec Section 10.
- **Adapters are interface-first** so the graph is testable with fakes. All
  external calls go through `withRetry` (bounded by `MAX_RETRIES`).
- **Concurrency** is capped by `MAX_CONCURRENT_AGENTS` (the "max N agents" rule).
- **Files stay focused** — one responsibility per file; split when a file grows
  unwieldy.
- **Commits** are frequent and scoped per task. End commit messages with the
  `Co-Authored-By` trailer. Never use `git add -A`/`.` — stage by name. Never
  `--no-verify`. Only commit/push when asked.
- **Use Serena's symbolic tools** for reading/editing code (see tool-selection
  rules); Read/Edit are for non-code files.

## Session logging & changelogs

At the end of **every** working session, before reporting completion, the agent
MUST record what it did:

- **Per-session changelog file** — write one file per session under
  `docs/changelogs/`, named with a date-time prefix:
  `docs/changelogs/YYYY-MM-DD-HHMM-<short-slug>.md` (e.g.
  `docs/changelogs/2026-06-14-1530-add-webhook-verifier.md`). Include: the task,
  what changed (files/packages touched), tests added/run, and any follow-ups.
- **Root CHANGELOG.md** — append a short, one- or two-line entry summarizing the
  session under a dated heading at the top of `CHANGELOG.md` (newest first).
  Keep it concise; the detail lives in the per-session file.
- Create `docs/changelogs/` and `CHANGELOG.md` if they don't exist yet.

## Plan progress tracking

When working through an implementation plan (e.g.
`docs/superpowers/plans/2026-06-14-jigit-mvp.md`), keep the **Current plan
progress** section below up to date at the end of each session — record which
task/step is done, what's in progress, and what's next. The next session reads
this first to know where to resume.

<!-- BEGIN: Current plan progress (agents update this each session) -->

### Current plan progress

- **Active plan:** Agent Session Reporting Phase 1 (implementation-complete) —
  spec `docs/superpowers/specs/2026-06-20-agent-session-reporting-design.md`,
  plan `docs/superpowers/plans/2026-06-20-agent-session-reporting.md`,
  spike `docs/superpowers/specs/2026-06-20-codex-copilot-spike-findings.md`.
- **Last completed:** All 13 plan tasks on branch
  `feature/agent-session-reporting`. New `@jigit/agent-reporter` shared package
  (Zod payload schema + `resolveGitUsername` + `reportSession` with `withRetry`),
  `AgentTool` enum + `AgentSession` Prisma model + migration
  `20260620120000_add_agent_session` (authored offline via `migrate diff` —
  needs `migrate deploy` on a live DB), `AgentSessionModule`
  (`packages/api/src/agent-sessions/`: idempotent `POST /api/agent-sessions`
  upsert + `GET` list/detail, `AuthGuard` reuse), three hook bin packages
  `@jigit/hook-{claude-code,codex,copilot}`, dashboard client methods + a
  `/usage` "Live Sessions" tab + Overview live-token widget. `pnpm -r build`
  clean; `pnpm -r test` green except the 2 pre-existing unrelated
  `webhooks.controller.test.ts` 401 failures. Notes:
  `docs/changelogs/2026-06-20-2230-agent-session-reporting.md`.
- **In progress:** _n/a_ — branch is implementation-complete; next step is
  `finishing-a-development-branch` (merge/PR/cleanup) for both
  `feature/agent-session-reporting` and the earlier
  `feature/codeburn-consolidation`.
- **Next up:** `prisma migrate deploy` on deploy; publish the 4 new packages to
  npm (so `npx -y @jigit/hook-*` works); add `@testing-library/react` to test
  the new `components/sessions/` UI (currently only build-verified); Claude Code
  `costUsd` pricing lookup; dedicated aggregate endpoint for summary cards /
  Overview (currently page-bounded, 200-row cap); investigate the pre-existing
  `webhooks.controller.test.ts` 401 failures. Deferred per spec §6: OpenCode &
  Cursor adapters, Copilot VS Code Chat, per-turn timeline, per-user API keys,
  rate limiting, SSE.

### Previous plan progress (CodeBurn Consolidation — completed)

- **Active plan:** CodeBurn Consolidation into JiGit (completed) — see
  `docs/superpowers/specs/2026-06-20-codeburn-consolidation-design.md` and
  `docs/superpowers/plans/2026-06-20-codeburn-phase{1,2,3}-*.md`
- **Last completed:** Merged CodeBurn's Go-based AI usage analytics dashboard into JiGit, then ran a final code-reviewer subagent pass against the full 14-commit diff before finishing the branch. Backend: new `UsageModule` (`packages/api/src/usage/`) ports the 3 Go endpoints (upload ZIP, list users, get data) into NestJS — `POST/GET/DELETE /api/usage/*` — using `adm-zip`+`papaparse`+Zod to parse CSVs into a single JSONB blob per upload (`UsageUpload` model, FK to new minimal `User` model) instead of CodeBurn's filesystem CSV storage. Frontend: new `/usage` page replicating CodeBurn's charts/tables (8 ported components under `components/usage/`), plus an "AI Usage" widget on Overview and a new sidebar nav item. The review caught one Critical bug — `POST /usage/upload` never actually read the `username` multipart field (`req.body` is unpopulated in `@fastify/multipart` stream mode), so every upload was silently attributed to `"unknown"` — fixed by reading `data.fields.username` instead, plus an Important fix making the upload/delete `AuthGuard` use `loadConfig().dashboardApiToken` like every other controller instead of a raw `process.env` read. Added a real-multipart-body integration test for `/upload` to cover the regression. `pnpm -r build` clean; `pnpm --filter @jigit/api test`: 78/80 passing (2 pre-existing unrelated `webhooks.controller.test.ts` 401 failures, already flagged below). Full session notes: `docs/changelogs/2026-06-20-1200-codeburn-consolidation.md` and `docs/changelogs/2026-06-20-1700-codeburn-review-fix.md`.
- **In progress:** _n/a_ — branch `feature/codeburn-consolidation` is implementation-complete and reviewed; next step is `finishing-a-development-branch` (merge/PR/cleanup decision).
- **Next up:** Update the standalone `codeburn` CLI (`codeburn/cli`, `codeburn/scripts/codeburn-upload.sh`) to point at the new `/api/usage/upload` endpoint instead of the old Go server; once verified, remove the now-redundant `codeburn/server` and `codeburn/dashboard` (Go backend + standalone React app); consider adding `@testing-library/react` to test the new dashboard pages/components (currently only `api/client.ts` has tests); restore/regenerate `docker-compose.yml` (currently empty on disk) before any deploy; run `prisma migrate deploy` on deploy; investigate pre-existing `webhooks.controller.test.ts` 401 failures (unrelated, found in an earlier session); implement real resume-from-checkpoint for paused jobs; E2E with real agent session; optionally narrow the `as any` Prisma `Json` casts in `usage.service.ts` and make `inferPeriod` throw on unrecognized `Period` values instead of defaulting to `"30days"`
<!-- END: Current plan progress -->

## Secrets — never touch

- Never read, print, log, or commit `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`,
  `id_rsa*`, `credentials.json`, or any file containing tokens/keys. Use
  `.env.example` as the reference for required variables.
- Secrets in the DB are encrypted at rest with `APP_ENCRYPTION_KEY`; redact them
  in events, logs, and API responses.
- Don't run destructive git/filesystem commands (`git reset --hard`, force-push,
  `rm -rf`, branch/table drops) without explicit human approval.

## Common commands

```bash
pnpm install
pnpm -r build            # build all packages
pnpm -r test             # run all tests
pnpm --filter @jigit/shared test     # one package
pnpm dev:api             # run API service
pnpm dev:worker          # run worker service
pnpm seed                # seed templates/credentials/repo mappings
docker-compose up -d postgres redis
```

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **JaGit** (1961 symbols, 3550 relationships, 95 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource                               | Use for                                  |
| -------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/JaGit/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/JaGit/clusters`       | All functional areas                     |
| `gitnexus://repo/JaGit/processes`      | All execution flows                      |
| `gitnexus://repo/JaGit/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
