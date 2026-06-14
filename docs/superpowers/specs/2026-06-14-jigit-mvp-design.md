# JiGit MVP — Design

**Date:** 2026-06-14
**Status:** Approved (design decisions delegated to implementer)

JiGit is an orchestrator for AI coding agents that work with Jira and GitLab. A
Jira issue assignment triggers a job; JiGit clones the repo, drives an
interactive Claude Code session to implement the change, opens a GitLab merge
request, logs work back to Jira, and reports status to Telegram. Humans stay in
the loop through approval checkpoints surfaced in Telegram and the dashboard.

## 1. Decisions locked during brainstorming

| # | Decision | Choice |
|---|----------|--------|
| 1 | How the agent codes | JiGit drives a **coding CLI** — it orchestrates, it is not the LLM |
| 2 | Backend stack | **All TypeScript** + LangGraph |
| 3 | Deployment / scale | **Single team, one shared server**, Postgres + queue, concurrency cap; no per-user auth |
| 4 | Human-in-the-loop | **Autonomous by default**, agent can pause and request approval |
| 5 | Approval channel | **Telegram inline buttons + dashboard** (either can approve) |
| 6 | Coding CLI | **Claude Code over ACP** (interactive, JSON-RPC/stdio) |
| 7 | Token dashboard | Build **dashboard widget/chart shell now** (mock data); real log ingestion later |
| 8 | Agent Manager | **Config/seed-driven**; dashboard displays read-only; CRUD deferred |
| 9 | Runtime topology | **API + worker split over a Redis/BullMQ queue** |

## 2. Architecture & components

Monorepo (pnpm workspace), all TypeScript:

```
jigit/
├── packages/
│   ├── shared/        # types, zod schemas, Prisma client, config loader
│   ├── api/           # Fastify: webhooks + REST + Telegram bot + serves dashboard
│   ├── worker/        # BullMQ consumer: LangGraph job graph + ACP Claude Code session
│   └── dashboard/     # React + Vite + shadcn/ui
└── docker-compose.yml # postgres, redis, api, worker
```

**API service (`packages/api`)**
- `POST /webhooks/jira`, `POST /webhooks/gitlab` — verify signature, normalize, enqueue a job.
- REST for the dashboard: `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/events`, control
  endpoints (`stop`, `pause`, `resume`, `approve`, `reject`), read-only config
  (`GET /agent-templates`, `GET /credentials` redacted).
- `GET /jobs/:id/stream` — SSE for live updates.
- **Telegram bot** — sends alerts; receives inline-button callbacks and forwards approve/reject to the waiting job.
- Serves the built dashboard static files.

**Worker service (`packages/worker`)**
- BullMQ consumer, concurrency = `MAX_CONCURRENT_AGENTS` (the "max N agents" rule).
- Runs the **LangGraph job graph** per job; persists graph state with a **Postgres
  checkpointer** so jobs can pause/resume/stop.
- Spawns **Claude Code as an ACP agent** (child process, JSON-RPC over stdio via the
  `claude-code-acp` adapter), drives `session/prompt`, consumes `session/update`
  streaming, and bridges `session/request_permission` into the approval flow.

**Shared infra**
- **Postgres** — source of truth for jobs/steps/events/approvals + LangGraph checkpoints.
- **Redis** — BullMQ queue + pub/sub for live updates.

**Live updates:** worker writes event rows and publishes to a Redis channel; API
relays to the dashboard over SSE.

## 3. Data model (Prisma)

- **AgentTemplate** — `id`, `name`, `model`, `systemPrompt`, `maxConcurrent`,
  `allowedTools` (json), `skills` (json, names only for MVP), `createdAt`. Seeded.
- **Credential** — `id`, `kind` (`jira` | `gitlab` | `telegram` | `anthropic`),
  `name`, `secrets` (encrypted json), `meta` (json: base URLs, project mappings).
  Seeded; secrets encrypted at rest with `APP_ENCRYPTION_KEY`.
- **RepoMapping** — `id`, `jiraProjectKey`, `gitlabProjectId`, `defaultBaseBranch`,
  `branchPrefixRules` (json), `agentTemplateId`.
- **Job** — `id`, `source` (`jira` | `gitlab`), `jiraIssueKey`, `gitlabProjectId`,
  `branch`, `mrUrl`, `status` (enum below), `agentTemplateId`, `checkpointThreadId`,
  `tokensUsed`, `costUsd`, `error`, timestamps.
- **JobStep** — `id`, `jobId`, `name`, `status`, `startedAt`, `finishedAt`, `detail` (json).
- **JobEvent** — `id`, `jobId`, `ts`, `level`, `type`, `message`, `payload` (json).
  Append-only timeline streamed to the dashboard.
- **Approval** — `id`, `jobId`, `stepId`, `kind` (e.g. `tool_permission`),
  `prompt`, `options` (json), `status` (`pending` | `approved` | `rejected` | `expired`),
  `decidedBy`, `decidedVia` (`telegram` | `dashboard`), `telegramMessageRef`, timestamps.

**Job status enum:** `queued → cloning → running → awaiting_approval → pushing →
opening_mr → reporting → done`; plus `paused`, `stopped`, `failed`.

## 4. Job lifecycle (LangGraph graph)

Nodes, each writing a `JobStep` + `JobEvent`s:

1. **resolveContext** — load issue (Jira REST/MCP), resolve RepoMapping + AgentTemplate, compute branch name.
2. **cloneRepo** — clone GitLab repo (token auth) into an isolated workdir; checkout base branch.
3. **createBranch** — create the conventional branch (Section 6).
4. **runAgent** — start Claude Code over ACP; send a prompt built from the issue
   (summary, description, acceptance criteria, repo conventions); stream
   `session/update` into `JobEvent`s and accumulate token/cost.
   - On `session/request_permission` → **interrupt** the graph, create an `Approval`,
     notify Telegram + dashboard, and wait (Section 5).
5. **commitAndPush** — commit the agent's changes, push the branch.
6. **openMergeRequest** — open a GitLab MR (title/description from the issue), store `mrUrl`.
7. **jiraWorklog** — add a worklog/comment to the Jira issue linking the MR.
8. **report** — post a completion summary to Telegram; mark job `done`.

**Pause/Stop/Resume:** Stop cancels the ACP session and BullMQ job, sets `stopped`.
Pause persists the checkpoint and parks the job. Resume reloads the checkpoint and
continues. All driven through control endpoints → Redis signal → worker.

**Branch-prefix and MR conventions are data**, read from `RepoMapping`, not hardcoded.

## 5. Approval flow (ACP permission → human → resume)

```
Claude Code → session/request_permission (toolCall, options)
  → worker creates Approval(pending), interrupts graph (checkpoint saved)
  → API posts Telegram message with inline buttons (one per option) + dashboard shows pending card
  → human taps Telegram button  OR  clicks dashboard Approve/Reject
  → API resolves Approval(decided), publishes resume signal
  → worker answers ACP request_permission with the chosen option, resumes graph
```

- Each `Approval` is idempotent and single-resolution; whichever channel responds
  first wins, the other reflects the decision.
- A configurable **approval timeout** auto-rejects (deny option) and records `expired`,
  so a forgotten approval can't pin a worker slot forever.
- Default Claude Code permission policy is conservative: file edits inside the
  workdir auto-allowed; anything outside or destructive requires approval.

## 6. Integrations

- **Jira** — REST for issue read + worklog/comment write; webhook on issue
  assignment (`jira:issue_updated` filtered to assignee = JiGit bot). MCP optional
  later; REST is the MVP path. Signature/secret validation on the webhook.
- **GitLab** — REST for clone auth, MR create, comments; webhooks for MR events and
  comment mentions of the bot (Phase-2 trigger paths stubbed but routed). Token via
  Credential.
- **Telegram** — single bot; sends alerts/reports; receives inline-button callbacks.
  Chat/channel id from Credential `meta`.
- **Branch matching** — `RepoMapping.branchPrefixRules` maps issue type → prefix
  (e.g. `Bug → bugfix/`, `Story → feature/`, default `feature/`), producing
  `feature/JIGIT-123-short-slug`. The same rule set lets the GitLab webhook map a
  branch/MR back to its Jira issue.

## 7. Dashboard (React + Vite + shadcn/ui)

- **Overview** — widget/chart shell: jobs by status, throughput, token/cost over
  time, approval queue size. Charts render from **mock data** in MVP; data source
  swaps to real metrics when CodeBurn log ingestion lands.
- **Jobs list** — table with status, issue, repo, branch, MR link, controls.
- **Job detail** — live step timeline + event log (SSE), token/cost, Stop/Pause/Resume,
  and inline **Approve/Reject** for pending approvals.
- **Config (read-only)** — agent templates, repo mappings, credentials (redacted).

## 8. Error handling, retries, concurrency

- **Retries** — a shared retry policy with `MAX_RETRIES` applies to tool/REST calls
  and per-node failures; exhausted retries fail the step and the job with a recorded
  `error` and a Telegram alert. (Functional requirement: bounded retries.)
- **Concurrency** — BullMQ worker concurrency = `MAX_CONCURRENT_AGENTS`; per
  AgentTemplate `maxConcurrent` enforced via a queue-level counter so one template
  can't starve others.
- **Isolation** — each job gets a fresh workdir; cleaned on terminal state.
- **Idempotency** — webhook dedupe by event id; job creation keyed on
  (issueKey + a content hash) to avoid duplicate jobs from repeated webhooks.
- **Secrets** — never logged; redacted in events and API responses.

## 9. Testing

- **Unit** — branch-name derivation, webhook normalization/signature, retry policy,
  approval state machine, config/credential loading.
- **Integration** — LangGraph graph with Jira/GitLab/Telegram/ACP **adapters mocked**;
  assert step/event/approval rows and the pause→approve→resume path.
- **Contract** — thin adapter tests against recorded fixtures for Jira/GitLab REST
  and the ACP message shapes.
- **E2E (smoke)** — docker-compose up; fire a synthetic Jira webhook; assert a job
  runs through to `opening_mr` against a sandbox GitLab project (or fully mocked in CI).

## 10. MVP scope boundary

**In:** Jira-assignment trigger → autonomous Claude-Code-over-ACP coding run →
push → GitLab MR → Jira worklog → Telegram report; approval checkpoints via
Telegram + dashboard; job control (stop/pause/resume); config/seed-driven agent
templates, credentials, repo mappings; dashboard shell with live job detail and
mock metric charts; bounded retries; concurrency cap.

**Deferred (Phase 2+):** CodeBurn log ingestion + real token dashboards; Microsoft
Teams; GitLab MR-comment-mention and build-failure triggers (routed but stubbed);
Agent Manager CRUD UI; SKILLs library management; multi-tenant auth; Jira/GitLab
MCP transport (REST first).
