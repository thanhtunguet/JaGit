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
