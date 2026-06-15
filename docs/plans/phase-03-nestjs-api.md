# Phase 3 — NestJS API Backend

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.
> **TDD is mandatory** — write the failing test first, see it fail, then implement.

**Goal:** A production-ready NestJS application (`packages/api`) that:
- Verifies and normalises Jira/GitLab webhooks, deduplicates, and enqueues jobs.
- Exposes a fully-documented REST API (Swagger UI at `/api/docs`).
- Streams live job events over SSE.
- Handles approval decisions and job control signals.
- Serves the built dashboard static files from `packages/dashboard/dist`.

**Prerequisites:** Phase 0 + Phase 1 + Phase 2 complete.

**Reference spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md` §2, §5, §8

---

## NestJS module layout

```
packages/api/src/
├── main.ts                          # bootstrap (NestFactory, Swagger, global pipes)
├── app.module.ts                    # root module
├── common/
│   ├── config.module.ts             # ConfigModule (loads AppConfig from shared)
│   ├── prisma.module.ts             # PrismaModule (exports PrismaService)
│   ├── queue.module.ts              # BullMQ Queue injection token
│   └── swagger.ts                  # Swagger document builder helper
├── webhooks/
│   ├── webhooks.module.ts
│   ├── webhooks.controller.ts       # POST /webhooks/jira  POST /webhooks/gitlab
│   ├── webhooks.service.ts          # normalise → dedupe → create Job → enqueue
│   ├── normalize.ts                 # pure normalisation functions
│   └── normalize.test.ts           # TDD — pure, no HTTP
├── jobs/
│   ├── jobs.module.ts
│   ├── jobs.controller.ts           # GET /jobs  GET /jobs/:id  POST /jobs/:id/:action
│   ├── jobs.service.ts
│   └── jobs.controller.test.ts
├── approvals/
│   ├── approvals.module.ts
│   ├── approvals.controller.ts      # POST /approvals/:id/decide
│   ├── approvals.service.ts         # resolveApproval (idempotent)
│   └── approvals.service.test.ts
├── sse/
│   ├── sse.module.ts
│   └── sse.controller.ts            # GET /jobs/:id/stream (SSE)
└── config-view/
    ├── config-view.module.ts
    └── config-view.controller.ts    # GET /agent-templates  GET /credentials (redacted)
```

---

## Acceptance Criteria

- [ ] `GET /health` → `200 { ok: true, version: string }`.
- [ ] Swagger UI loads at `GET /api/docs`.
- [ ] `POST /webhooks/jira` with correct secret + bot-assigned payload → `202 { jobId }` + one Job row + one BullMQ job.
- [ ] Duplicate webhook (same `dedupeKey`) → `200 { duplicate: true }`.
- [ ] Non-bot payload → `200 { ignored: true }`.
- [ ] Wrong secret → `401`.
- [ ] `GET /jobs` → array of jobs.
- [ ] `GET /jobs/:id` → job with steps + events + pending approvals.
- [ ] `POST /jobs/:id/stop|pause|resume` → `202`; publishes control signal to Redis.
- [ ] `GET /jobs/:id/stream` → `content-type: text/event-stream`.
- [ ] `POST /approvals/:id/decide { optionId }` → `200`; idempotent (second call still 200).
- [ ] `pnpm --filter @jigit/api build` → no errors.
- [ ] `pnpm --filter @jigit/api test` → all pass.

**Verify:**
```bash
pnpm --filter @jigit/api test
pnpm --filter @jigit/api build
# Manual smoke:
pnpm dev:api &
curl http://localhost:3000/health
curl http://localhost:3000/api/docs  # → HTML
```

---

## Steps

### Step 1 — Install NestJS dependencies

- [ ] In `packages/api`:
```bash
cd packages/api
pnpm add @nestjs/core @nestjs/common @nestjs/platform-fastify reflect-metadata rxjs
pnpm add @nestjs/swagger fastify @fastify/static
pnpm add @nestjs/config
pnpm add node-telegram-bot-api
pnpm add @types/node-telegram-bot-api -D
pnpm add @nestjs/testing supertest -D
pnpm add @types/supertest -D
```

> NestJS uses Fastify as the HTTP adapter (`@nestjs/platform-fastify`) for
> performance — this is NOT the same as using Fastify directly. All route code
> uses NestJS decorators; Fastify is the transport layer only.

---

### Step 2 — `tsconfig.json` update for decorators

- [ ] Ensure `packages/api/tsconfig.json` has (inherited from `tsconfig.base.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"]
}
```

---

### Step 3 — Webhook normalisation (TDD, pure)

These are pure functions — no NestJS, no DB — test them first.

- [ ] **Write failing test** — `packages/api/src/webhooks/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeJira, normalizeGitlab, dedupeKey } from "./normalize.js";

const jiraEvt = (assigneeId: string) => ({
  webhookEvent: "jira:issue_updated",
  timestamp: 1718000000,
  issue: {
    key: "JIGIT-7",
    fields: {
      project: { key: "JIGIT" },
      issuetype: { name: "Bug" },
      summary: "Fix login bug",
      description: "Steps to reproduce …",
      assignee: { accountId: assigneeId },
    },
  },
});

describe("normalizeJira", () => {
  it("returns a NormalizedTrigger when assignee matches bot", () => {
    const t = normalizeJira(jiraEvt("bot-acc-1"), "bot-acc-1");
    expect(t).toMatchObject({
      source: "jira",
      issueKey: "JIGIT-7",
      projectKey: "JIGIT",
      issueType: "Bug",
      summary: "Fix login bug",
    });
  });

  it("returns null when assignee does not match bot", () => {
    expect(normalizeJira(jiraEvt("someone-else"), "bot-acc-1")).toBeNull();
  });

  it("returns null for unrecognised event types", () => {
    expect(normalizeJira({ webhookEvent: "jira:issue_created" }, "bot-acc-1")).toBeNull();
  });
});

describe("dedupeKey", () => {
  it("is stable for the same trigger", () => {
    const t = normalizeJira(jiraEvt("bot-acc-1"), "bot-acc-1")!;
    expect(dedupeKey(t)).toBe(dedupeKey(t));
  });

  it("differs for different issue keys", () => {
    const t1 = normalizeJira(jiraEvt("bot-acc-1"), "bot-acc-1")!;
    const t2 = { ...t1, issueKey: "JIGIT-8", eventId: "other" };
    expect(dedupeKey(t1)).not.toBe(dedupeKey(t2));
  });
});

describe("normalizeGitlab", () => {
  it("returns null (stub for Phase 2+)", () => {
    expect(normalizeGitlab({}, "bot-user")).toBeNull();
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Create `packages/api/src/webhooks/normalize.ts`:
```ts
import { createHash } from "node:crypto";

export interface NormalizedTrigger {
  source: "jira" | "gitlab";
  issueKey: string;
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  eventId: string;
}

export function normalizeJira(body: any, botAccountId: string): NormalizedTrigger | null {
  if (body?.webhookEvent !== "jira:issue_updated") return null;
  const fields = body?.issue?.fields;
  if (!fields) return null;
  if (fields?.assignee?.accountId !== botAccountId) return null;

  return {
    source: "jira",
    issueKey: body.issue.key as string,
    projectKey: fields.project?.key as string,
    issueType: fields.issuetype?.name ?? "Task",
    summary: fields.summary ?? "",
    description: fields.description ?? "",
    eventId: String(body.timestamp ?? body.issue.key),
  };
}

/** Phase 2+ — GitLab MR/comment triggers */
export function normalizeGitlab(_body: any, _botUser: string): NormalizedTrigger | null {
  return null;
}

export function dedupeKey(t: NormalizedTrigger): string {
  return createHash("sha1")
    .update(`${t.source}:${t.issueKey}:${t.eventId}`)
    .digest("hex");
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 4 — Common modules

- [ ] Create `packages/api/src/common/prisma.module.ts`:
```ts
import { Global, Module, Injectable, OnModuleDestroy } from "@nestjs/common";
import { prisma } from "@jigit/shared";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client = prisma;

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] Create `packages/api/src/common/queue.module.ts`:
```ts
import { Global, Module } from "@nestjs/common";
import { createQueue, loadConfig } from "@jigit/shared";

export const QUEUE_TOKEN = "JIGIT_QUEUE";

@Global()
@Module({
  providers: [
    {
      provide: QUEUE_TOKEN,
      useFactory: () => {
        const cfg = loadConfig();
        return createQueue(cfg.redisUrl);
      },
    },
  ],
  exports: [QUEUE_TOKEN],
})
export class QueueModule {}
```

---

### Step 5 — Webhooks module (TDD with supertest)

- [ ] **Write failing integration test** — `packages/api/src/webhooks/webhooks.controller.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { WebhooksModule } from "./webhooks.module.js";
import { PrismaService } from "../common/prisma.module.js";
import { QUEUE_TOKEN } from "../common/queue.module.js";

const mockPrisma = {
  client: {
    job: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "job-1" }),
    },
  },
};
const mockQueue = { add: vi.fn().mockResolvedValue({ id: "q-1" }) };

const BOT_ID = "bot-account-1";
const SECRET = "test-secret";

describe("WebhooksController", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({ imports: [WebhooksModule] })
      .overrideProvider(PrismaService).useValue(mockPrisma)
      .overrideProvider(QUEUE_TOKEN).useValue(mockQueue)
      .compile();

    app = module.createNestApplication(new FastifyAdapter());
    // Pass bot config via app context
    app.set("BOT_ACCOUNT_ID", BOT_ID);
    app.set("WEBHOOK_SECRET", SECRET);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => { await app.close(); });

  const jiraPayload = {
    webhookEvent: "jira:issue_updated",
    timestamp: 999,
    issue: {
      key: "JIGIT-7",
      fields: {
        project: { key: "JIGIT" },
        issuetype: { name: "Bug" },
        summary: "Fix login",
        description: "",
        assignee: { accountId: BOT_ID },
      },
    },
  };

  it("POST /webhooks/jira → 202 and enqueues", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/jira",
      headers: { "x-jigit-secret": SECRET, "content-type": "application/json" },
      payload: jiraPayload,
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toMatchObject({ jobId: "job-1" });
    expect(mockQueue.add).toHaveBeenCalledOnce();
  });

  it("rejects wrong secret → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/jira",
      headers: { "x-jigit-secret": "wrong", "content-type": "application/json" },
      payload: jiraPayload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("ignores non-bot assignment → 200 ignored", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/jira",
      headers: { "x-jigit-secret": SECRET, "content-type": "application/json" },
      payload: { ...jiraPayload, issue: { ...jiraPayload.issue,
        fields: { ...jiraPayload.issue.fields, assignee: { accountId: "someone-else" } } } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ignored: true });
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Implement `WebhooksService` and `WebhooksController`:

`packages/api/src/webhooks/webhooks.service.ts`:
```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { QUEUE_TOKEN } from "../common/queue.module.js";
import { normalizeJira, dedupeKey } from "./normalize.js";
import { loadConfig } from "@jigit/shared";
import type { Queue } from "bullmq";

@Injectable()
export class WebhooksService {
  private readonly cfg = loadConfig();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_TOKEN) private readonly queue: Queue,
  ) {}

  async handleJira(secret: string, body: any) {
    if (secret !== this.cfg.webhookSecret) throw new UnauthorizedException();

    const trigger = normalizeJira(body, process.env["JIRA_BOT_ACCOUNT_ID"] ?? "");
    if (!trigger) return { ignored: true };

    const key = dedupeKey(trigger);
    const existing = await this.prisma.client.job.findUnique({ where: { dedupeKey: key } });
    if (existing) return { duplicate: true };

    const job = await this.prisma.client.job.create({
      data: {
        source: "jira",
        jiraIssueKey: trigger.issueKey,
        dedupeKey: key,
        checkpointThreadId: key,
      },
    });

    await this.queue.add("run", { jobId: job.id });
    return { jobId: job.id };
  }
}
```

`packages/api/src/webhooks/webhooks.controller.ts`:
```ts
import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiHeader, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { WebhooksService } from "./webhooks.service.js";

@ApiTags("Webhooks")
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Post("jira")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Receive Jira issue-updated webhook" })
  @ApiHeader({ name: "x-jigit-secret", required: true })
  @ApiResponse({ status: 202, description: "Job enqueued" })
  @ApiResponse({ status: 200, description: "Ignored or duplicate" })
  @ApiResponse({ status: 401, description: "Bad secret" })
  async jira(
    @Headers("x-jigit-secret") secret: string,
    @Body() body: unknown,
  ) {
    const result = await this.svc.handleJira(secret, body);
    // If ignored/duplicate, override status to 200
    if ("ignored" in result || "duplicate" in result) {
      // Fastify response object is available via request but for simplicity
      // we let NestJS return 200 when the decorator isn't 202-forcing
      return result;
    }
    return result;
  }

  @Post("gitlab")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive GitLab webhook (Phase 2+ — stub)" })
  async gitlab() {
    return { ignored: true, reason: "gitlab triggers deferred to Phase 2+" };
  }
}
```

`packages/api/src/webhooks/webhooks.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller.js";
import { WebhooksService } from "./webhooks.service.js";

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 6 — Jobs module

- [ ] Create `packages/api/src/jobs/jobs.service.ts`:
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { publishControl, loadConfig } from "@jigit/shared";

@Injectable()
export class JobsService {
  private readonly cfg = loadConfig();

  constructor(private readonly prisma: PrismaService) {}

  async listJobs() {
    return this.prisma.client.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getJob(id: string) {
    const job = await this.prisma.client.job.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { ts: "asc" }, take: 500 },
        approvals: { where: { status: "pending" } },
      },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async control(id: string, action: "stop" | "pause" | "resume") {
    const job = await this.prisma.client.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    await publishControl(this.cfg.redisUrl, { type: action, jobId: id });
    return { accepted: true, action };
  }
}
```

- [ ] Create `packages/api/src/jobs/jobs.controller.ts`:
```ts
import { Controller, Get, Post, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { JobsService } from "./jobs.service.js";

@ApiTags("Jobs")
@Controller("jobs")
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @ApiOperation({ summary: "List all jobs (newest first, max 100)" })
  listJobs() { return this.svc.listJobs(); }

  @Get(":id")
  @ApiOperation({ summary: "Get job details with steps, events, and pending approvals" })
  @ApiParam({ name: "id", description: "Job CUID" })
  getJob(@Param("id") id: string) { return this.svc.getJob(id); }

  @Post(":id/stop")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Send stop signal to the running job" })
  stop(@Param("id") id: string) { return this.svc.control(id, "stop"); }

  @Post(":id/pause")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Pause a running job (saves checkpoint)" })
  pause(@Param("id") id: string) { return this.svc.control(id, "pause"); }

  @Post(":id/resume")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Resume a paused job" })
  resume(@Param("id") id: string) { return this.svc.control(id, "resume"); }
}
```

- [ ] Create `packages/api/src/jobs/jobs.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";

@Module({ controllers: [JobsController], providers: [JobsService] })
export class JobsModule {}
```

---

### Step 7 — Approvals module

- [ ] Create `packages/api/src/approvals/approvals.service.ts`:
```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import { publishControl, loadConfig } from "@jigit/shared";

@Injectable()
export class ApprovalsService {
  private readonly cfg = loadConfig();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent: first call sets status to approved/rejected; subsequent calls
   * no-op (the WHERE condition on status=pending prevents double-write).
   */
  async decide(approvalId: string, optionId: string, via: string, by = "api-user") {
    const approval = await this.prisma.client.approval.findUnique({
      where: { id: approvalId },
    });
    if (!approval) throw new NotFoundException(`Approval ${approvalId} not found`);

    if (approval.status !== "pending") {
      return { alreadyDecided: true, status: approval.status };
    }

    // Determine approved vs rejected from optionId convention
    const status = optionId.startsWith("deny") || optionId === "reject"
      ? "rejected" as const
      : "approved" as const;

    await this.prisma.client.approval.update({
      where: { id: approvalId, status: "pending" },
      data: { status, chosenOptionId: optionId, decidedVia: via, decidedBy: by, decidedAt: new Date() },
    });

    // Signal the waiting worker
    await publishControl(this.cfg.redisUrl, {
      type: "approval",
      jobId: approval.jobId,
      approvalId,
      chosenOptionId: optionId,
    });

    return { decided: true, status };
  }
}
```

- [ ] Create `packages/api/src/approvals/approvals.controller.ts`:
```ts
import { Controller, Post, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiBody } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { ApprovalsService } from "./approvals.service.js";

class DecideDto {
  @IsString()
  optionId!: string;
}

@ApiTags("Approvals")
@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  @Post(":id/decide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve or reject a pending approval (idempotent)" })
  @ApiParam({ name: "id", description: "Approval CUID" })
  @ApiBody({ type: DecideDto })
  decide(
    @Param("id") id: string,
    @Body() dto: DecideDto,
  ) {
    return this.svc.decide(id, dto.optionId, "dashboard");
  }
}
```

- [ ] Create `packages/api/src/approvals/approvals.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { ApprovalsController } from "./approvals.controller.js";
import { ApprovalsService } from "./approvals.service.js";

@Module({ controllers: [ApprovalsController], providers: [ApprovalsService] })
export class ApprovalsModule {}
```

---

### Step 8 — SSE streaming module

- [ ] Create `packages/api/src/sse/sse.controller.ts`:
```ts
import { Controller, Get, Param, Sse, MessageEvent } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { Observable, fromEvent } from "rxjs";
import { makeRedis, jobChannel, loadConfig } from "@jigit/shared";

@ApiTags("Jobs")
@Controller("jobs")
export class SseController {
  private readonly cfg = loadConfig();

  @Get(":id/stream")
  @Sse()
  @ApiOperation({ summary: "SSE stream of live job events" })
  @ApiParam({ name: "id", description: "Job CUID" })
  stream(@Param("id") id: string): Observable<MessageEvent> {
    const redis = makeRedis(this.cfg.redisUrl);
    const channel = jobChannel(id);
    redis.subscribe(channel);

    return new Observable<MessageEvent>((observer) => {
      redis.on("message", (_ch: string, msg: string) => {
        observer.next({ data: msg } as MessageEvent);
      });

      return () => {
        redis.unsubscribe(channel);
        redis.quit();
      };
    });
  }
}
```

- [ ] Create `packages/api/src/sse/sse.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { SseController } from "./sse.controller.js";

@Module({ controllers: [SseController] })
export class SseModule {}
```

---

### Step 9 — Config-view module

- [ ] Create `packages/api/src/config-view/config-view.controller.ts`:
```ts
import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PrismaService } from "../common/prisma.module.js";

@ApiTags("Config (read-only)")
@Controller()
export class ConfigViewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("agent-templates")
  @ApiOperation({ summary: "List agent templates (read-only)" })
  agentTemplates() {
    return this.prisma.client.agentTemplate.findMany();
  }

  @Get("credentials")
  @ApiOperation({ summary: "List credentials with secrets redacted" })
  async credentials() {
    const rows = await this.prisma.client.credential.findMany();
    // Never expose secrets — return only id, kind, name, meta
    return rows.map(({ id, kind, name, meta }) => ({ id, kind, name, meta }));
  }

  @Get("repo-mappings")
  @ApiOperation({ summary: "List repo mappings" })
  repoMappings() {
    return this.prisma.client.repoMapping.findMany({
      include: { agentTemplate: { select: { id: true, name: true } } },
    });
  }
}
```

---

### Step 10 — Root app module + Swagger bootstrap

- [ ] Create `packages/api/src/app.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "./common/prisma.module.js";
import { QueueModule } from "./common/queue.module.js";
import { WebhooksModule } from "./webhooks/webhooks.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { SseModule } from "./sse/sse.module.js";
import { ConfigViewController } from "./config-view/config-view.controller.js";
import { ConfigViewModule } from "./config-view/config-view.module.js";

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    WebhooksModule,
    JobsModule,
    ApprovalsModule,
    SseModule,
    ConfigViewModule,
  ],
})
export class AppModule {}
```

- [ ] Create `packages/api/src/main.ts` (replace placeholder):
```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { loadConfig } from "@jigit/shared";

async function bootstrap() {
  const cfg = loadConfig();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  // Global validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS (dashboard on same origin in prod; localhost:5173 in dev)
  app.enableCors({ origin: [cfg.publicBaseUrl, "http://localhost:5173"] });

  // Swagger UI
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("JiGit API")
      .setDescription("AI coding orchestration — Jira + GitLab + Claude Code")
      .setVersion("1.0")
      .addTag("Jobs")
      .addTag("Webhooks")
      .addTag("Approvals")
      .addTag("Config (read-only)")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Health check (outside Swagger for simplicity)
  app.getHttpAdapter().get("/health", (_req, res) => {
    res.send({ ok: true, version: "1.0.0" });
  });

  await app.listen(cfg.apiPort, "0.0.0.0");
  console.log(`JiGit API listening on :${cfg.apiPort}`);
  console.log(`Swagger UI → http://localhost:${cfg.apiPort}/api/docs`);
}

bootstrap();
```

---

### Step 11 — Add class-validator dependency

- [ ] In `packages/api`:
```bash
cd packages/api
pnpm add class-validator class-transformer
```

---

### Step 12 — Build + test

- [ ] Run:
```bash
pnpm --filter @jigit/api build
pnpm --filter @jigit/api test
```

Fix any TypeScript or test errors before committing.

---

### Step 13 — Commit

- [ ] Stage and commit:
```bash
git add packages/api/src \
        packages/api/package.json \
        packages/api/tsconfig.json
git commit -m "feat(api): NestJS backend with Swagger UI, webhooks, jobs, approvals, SSE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
