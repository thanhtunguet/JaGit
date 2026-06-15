# JiGit — Implementation Plan Index

**Spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md`

Execute phases in order. Each phase is fully self-contained and ends with a
committed working state. The next phase always lists its prerequisites.

| Phase | File                                                             | Goal                       | Key deliverable                                        |
| ----- | ---------------------------------------------------------------- | -------------------------- | ------------------------------------------------------ |
| 0     | [phase-00-scaffolding.md](./phase-00-scaffolding.md)             | Monorepo skeleton          | `pnpm -r build` exits 0                                |
| 1     | [phase-01-database.md](./phase-01-database.md)                   | **DB design** (standalone) | Prisma schema, migration, smoke test                   |
| 2     | [phase-02-shared-package.md](./phase-02-shared-package.md)       | Shared utilities           | config, crypto, retry, branch, queue, events           |
| 3     | [phase-03-nestjs-api.md](./phase-03-nestjs-api.md)               | NestJS API + Swagger       | `/health`, `/api/docs`, webhooks, jobs, SSE, approvals |
| 4     | [phase-04-worker-service.md](./phase-04-worker-service.md)       | Worker + LangGraph         | Adapters, ACP client, job graph                        |
| 5     | [phase-05-telegram-approval.md](./phase-05-telegram-approval.md) | Approval bridge            | Telegram bot, `awaitApproval`, idempotent resolve      |
| 6     | [phase-06-dashboard.md](./phase-06-dashboard.md)                 | React dashboard            | shadcn/ui + Tailwind UI for all pages                  |
| 7     | [phase-07-seed-wiring.md](./phase-07-seed-wiring.md)             | Seed + final wiring        | `pnpm seed`, full stack smoke                          |
| 8     | [phase-08-docker-e2e.md](./phase-08-docker-e2e.md)               | Docker + E2E               | docker-compose, E2E smoke test                         |

## Key architecture decisions (vs original plan)

| Area              | Original plan       | This plan                                                              |
| ----------------- | ------------------- | ---------------------------------------------------------------------- |
| Backend framework | Fastify (direct)    | **NestJS on Fastify adapter** (decorators, DI, modules)                |
| Swagger UI        | Not included        | **`@nestjs/swagger` at `/api/docs`**                                   |
| DB design         | Inline in Task 2    | **Standalone Phase 1** — schema reviewed before any code depends on it |
| Frontend          | shadcn/ui mentioned | **Enforced** — 10 non-negotiable UI rules in Phase 6                   |
| Dashboard CSS     | Not specified       | **TailwindCSS only** — no inline styles, no CSS modules                |

## Non-negotiable UI rules (enforced in Phase 6)

1. shadcn/ui components — never raw HTML buttons/tables/modals.
2. TailwindCSS only — no inline styles except dynamic values.
3. Dark mode — `dark:` variants on all colours; `class="dark"` on `<html>`.
4. Semantic colour tokens — `bg-background`, `text-foreground`, etc.
5. Status colours via `Badge` with `statusVariant` map.
6. Loading states — `<Skeleton>` blocks while fetching.
7. Empty states — explicit "no data" message in every list.
8. Error states — `<Alert variant="destructive">` on every query.
9. Accessible — correct ARIA roles; `aria-label` on icon-only buttons.
10. No placeholder text — no "Lorem ipsum", "TODO", "coming soon".

## Deferred to Phase 2+ (per spec §10)

- CodeBurn log ingestion / real token dashboards
- Microsoft Teams
- GitLab MR-comment-mention triggers
- Agent Manager CRUD UI
- SKILLs library management
- Multi-tenant auth
- Jira/GitLab MCP transport
