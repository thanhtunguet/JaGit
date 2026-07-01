# CodeBurn Consolidation — Phase 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port CodeBurn's Go backend into JiGit's NestJS/Fastify API with Prisma/Postgres storage.

**Architecture:** A new `UsageModule` with a `UsageController` (HTTP endpoints), `UsageService` (business logic: ZIP extraction, CSV parsing, Prisma storage), and Zod-validated types. Uploads are parsed into structured JSONB stored in a single `UsageUpload` table linked to a minimal `User` table.

**Tech Stack:** NestJS, Fastify, Prisma, Zod, papaparse, adm-zip, Vitest, supertest

---

## File Structure

| File | Responsibility |
|------|--------------|
| `packages/shared/prisma/schema.prisma` | Add `User` and `UsageUpload` models |
| `packages/api/src/usage/types.ts` | Zod schemas for CSV row validation, DTO types |
| `packages/api/src/usage/usage.service.ts` | ZIP extraction, CSV parsing, Prisma CRUD |
| `packages/api/src/usage/usage.controller.ts` | HTTP endpoints: upload, list, latest, delete |
| `packages/api/src/usage/usage.module.ts` | NestJS module wiring |
| `packages/api/src/app.module.ts` | Import `UsageModule` |
| `packages/api/src/usage/usage.service.test.ts` | Service unit tests |
| `packages/api/src/usage/usage.controller.test.ts` | Controller integration tests |

---

## Prerequisites

Install dependencies in `packages/api`:

```bash
cd packages/api
pnpm add papaparse adm-zip zod @fastify/multipart
pnpm add -D @types/papaparse
```

Also register `@fastify/multipart` in `packages/api/src/main.ts` (after the `fastifyStatic` registration or before `app.listen`):

```typescript
import multipart from "@fastify/multipart";
// ... after app creation ...
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
```

---

## Task 1: Prisma Schema and Migration

**Goal:** Add `User` and `UsageUpload` models to the Prisma schema.

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

**Acceptance Criteria:**
- [ ] `User` model exists with `id` (CUID), `username` (unique), `createdAt`, and `uploads` relation
- [ ] `UsageUpload` model exists with `id` (CUID), `userId` (FK), `uploadedAt`, `period`, `data` (Json)
- [ ] Cascade delete from User to UsageUpload
- [ ] Migration generates without errors

**Verify:** `pnpm --filter @jigit/shared prisma migrate dev --name add_usage_models` → success

**Steps:**

- [ ] **Step 1: Add models to schema**

Append to `packages/shared/prisma/schema.prisma` after the `Approval` model:

```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  createdAt DateTime @default(now())
  uploads   UsageUpload[]
}

model UsageUpload {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  uploadedAt DateTime @default(now())
  period     String   // "today", "7days", "30days"
  data       Json     // structured JSON containing all parsed CSV data

  @@index([userId, uploadedAt])
}
```

- [ ] **Step 2: Generate migration**

```bash
cd packages/shared
pnpm prisma migrate dev --name add_usage_models
```

Expected: Migration created successfully, no errors.

- [ ] **Step 3: Regenerate Prisma client**

```bash
pnpm prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/migrations/
git commit -m "feat: add User and UsageUpload models for usage tracking

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Usage Types and Zod Schemas

**Goal:** Define TypeScript types and Zod schemas for CSV row validation.

**Files:**
- Create: `packages/api/src/usage/types.ts`

**Acceptance Criteria:**
- [ ] Zod schemas match all 8 CodeBurn CSV row shapes
- [ ] `UsageData` type exports structured JSON shape for DB storage
- [ ] `Period` type is `'today' | '7days' | '30days'` (lowercase, no spaces)

**Verify:** `pnpm --filter @jigit/api typecheck` → no errors

**Steps:**

- [ ] **Step 1: Create types file**

```typescript
// packages/api/src/usage/types.ts
import { z } from "zod";

export const PeriodSchema = z.enum(["today", "7days", "30days"]);
export type Period = z.infer<typeof PeriodSchema>;

export const SummaryRowSchema = z.object({
  Period: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "API Calls": z.number(),
  Sessions: z.number(),
  Projects: z.number(),
});

export const DailyRowSchema = z.object({
  Period: z.string(),
  Date: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "API Calls": z.number(),
  Sessions: z.number(),
  "Input Tokens": z.number(),
  "Output Tokens": z.number(),
  "Cache Read Tokens": z.number(),
  "Cache Write Tokens": z.number(),
});

export const ActivityRowSchema = z.object({
  Period: z.string(),
  Activity: z.string(),
  "Cost (USD)": z.number(),
  "Share (%)": z.number(),
  Turns: z.number(),
});

export const ModelRowSchema = z.object({
  Period: z.string(),
  Model: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "Share (%)": z.number(),
  "API Calls": z.number(),
  "Edit Turns": z.number(),
  "One-shot Rate (%)": z.number().nullable(),
  "Retries/Edit": z.number().nullable(),
  "Cost/Edit (USD)": z.number().nullable(),
  "Input Tokens": z.number(),
  "Output Tokens": z.number(),
  "Cache Read Tokens": z.number(),
  "Cache Write Tokens": z.number(),
});

export const ProjectRowSchema = z.object({
  Project: z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "Avg/Session (USD)": z.number(),
  "Share (%)": z.number(),
  "API Calls": z.number(),
  Sessions: z.number(),
});

export const SessionRowSchema = z.object({
  Project: z.string(),
  "Session ID": z.string(),
  "Started At": z.string(),
  "Cost (USD)": z.number(),
  "Saved (USD)": z.number(),
  "API Calls": z.number(),
  Turns: z.number(),
});

export const ToolRowSchema = z.object({
  Tool: z.string(),
  Calls: z.number(),
  "Share (%)": z.number(),
});

export const ShellCommandRowSchema = z.object({
  Command: z.string(),
  Calls: z.number(),
  "Share (%)": z.number(),
});

export const UsageDataSchema = z.object({
  summary: z.array(SummaryRowSchema),
  daily: z.array(DailyRowSchema),
  activity: z.array(ActivityRowSchema),
  models: z.array(ModelRowSchema),
  projects: z.array(ProjectRowSchema),
  sessions: z.array(SessionRowSchema),
  tools: z.array(ToolRowSchema),
  shellCommands: z.array(ShellCommandRowSchema),
});

export type SummaryRow = z.infer<typeof SummaryRowSchema>;
export type DailyRow = z.infer<typeof DailyRowSchema>;
export type ActivityRow = z.infer<typeof ActivityRowSchema>;
export type ModelRow = z.infer<typeof ModelRowSchema>;
export type ProjectRow = z.infer<typeof ProjectRowSchema>;
export type SessionRow = z.infer<typeof SessionRowSchema>;
export type ToolRow = z.infer<typeof ToolRowSchema>;
export type ShellCommandRow = z.infer<typeof ShellCommandRowSchema>;
export type UsageData = z.infer<typeof UsageDataSchema>;

export const ALLOWED_CSV_FILES = [
  "summary.csv",
  "daily.csv",
  "activity.csv",
  "models.csv",
  "projects.csv",
  "sessions.csv",
  "tools.csv",
  "shell-commands.csv",
] as const;

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @jigit/api typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/usage/types.ts
git commit -m "feat: add Zod schemas for usage CSV validation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Usage Service

**Goal:** Implement business logic for ZIP extraction, CSV parsing, and Prisma storage.

**Files:**
- Create: `packages/api/src/usage/usage.service.ts`
- Create: `packages/api/src/usage/usage.service.test.ts`

**Acceptance Criteria:**
- [ ] `uploadUsageData(username, zipBuffer)` extracts ZIP, parses CSVs, validates with Zod, upserts User, creates UsageUpload
- [ ] `listUsers()` returns all users with upload count
- [ ] `getUserUploads(username)` returns uploads for a user (latest first)
- [ ] `getLatestUpload(username)` returns the most recent upload
- [ ] `deleteUser(username)` deletes user and all uploads (cascade)
- [ ] Missing/invalid CSVs throw `BadRequestException` with descriptive message
- [ ] Service tests cover all methods with mock Prisma

**Verify:** `pnpm --filter @jigit/api test usage.service.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/usage/usage.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { UsageService } from "./usage.service.js";
import { PrismaService } from "../common/prisma.module.js";

const mockPrisma = {
  client: {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: "u1", username: "alice" }),
      findUnique: vi.fn().mockResolvedValue({ id: "u1", username: "alice", uploads: [] }),
      findMany: vi.fn().mockResolvedValue([{ id: "u1", username: "alice", _count: { uploads: 2 } }]),
      delete: vi.fn().mockResolvedValue({ id: "u1" }),
    },
    usageUpload: {
      create: vi.fn().mockResolvedValue({ id: "up1", userId: "u1" }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
};

describe("UsageService", () => {
  let service: UsageService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(UsageService);
  });

  it("listUsers returns users with upload counts", async () => {
    const users = await service.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe("alice");
    expect(mockPrisma.client.user.findMany).toHaveBeenCalled();
  });

  it("deleteUser calls prisma delete", async () => {
    await service.deleteUser("alice");
    expect(mockPrisma.client.user.delete).toHaveBeenCalledWith({
      where: { username: "alice" },
    });
  });

  it("uploadUsageData throws on invalid ZIP", async () => {
    await expect(service.uploadUsageData("alice", Buffer.from("not a zip")))
      .rejects.toThrow("Invalid ZIP file");
  });
});
```

Run test (should fail — service doesn't exist yet):

```bash
pnpm --filter @jigit/api test usage.service.test.ts
```

Expected: FAIL — "Cannot find module './usage.service.js'"

- [ ] **Step 2: Implement the service**

Create `packages/api/src/usage/usage.service.ts`:

```typescript
import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.module.js";
import AdmZip from "adm-zip";
import Papa from "papaparse";
import {
  UsageDataSchema,
  ALLOWED_CSV_FILES,
  MAX_UPLOAD_SIZE,
  type UsageData,
  type Period,
} from "./types.js";

const CSV_TO_KEY: Record<string, keyof UsageData> = {
  "summary.csv": "summary",
  "daily.csv": "daily",
  "activity.csv": "activity",
  "models.csv": "models",
  "projects.csv": "projects",
  "sessions.csv": "sessions",
  "tools.csv": "tools",
  "shell-commands.csv": "shellCommands",
};

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    return this.prisma.client.user.findMany({
      include: { _count: { select: { uploads: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async getUserUploads(username: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { username },
      include: {
        uploads: { orderBy: { uploadedAt: "desc" } },
      },
    });
    if (!user) throw new NotFoundException(`User ${username} not found`);
    return user.uploads;
  }

  async getLatestUpload(username: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { username },
      include: {
        uploads: { orderBy: { uploadedAt: "desc" }, take: 1 },
      },
    });
    if (!user) throw new NotFoundException(`User ${username} not found`);
    return user.uploads[0] ?? null;
  }

  async deleteUser(username: string) {
    await this.prisma.client.user.delete({ where: { username } });
    return { deleted: true };
  }

  async uploadUsageData(username: string, zipBuffer: Buffer): Promise<{
    userId: string;
    uploadId: string;
    uploadedAt: Date;
    filesProcessed: string[];
  }> {
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      throw new BadRequestException("Invalid ZIP file");
    }

    const entries = zip.getEntries();
    const data: Partial<UsageData> = {};
    const filesProcessed: string[] = [];

    for (const entry of entries) {
      const name = entry.entryName.split("/").pop() ?? "";
      if (!ALLOWED_CSV_FILES.includes(name as typeof ALLOWED_CSV_FILES[number])) continue;

      const csvText = entry.getData().toString("utf-8");
      const parsed = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true });

      if (parsed.errors.length > 0) {
        throw new BadRequestException(`Failed to parse ${name}: ${parsed.errors[0].message}`);
      }

      const key = CSV_TO_KEY[name];
      const validated = UsageDataSchema.shape[key].safeParse(parsed.data);
      if (!validated.success) {
        throw new BadRequestException(`Validation failed for ${name}: ${validated.error.message}`);
      }

      data[key] = validated.data as any;
      filesProcessed.push(name);
    }

    // Ensure summary.csv exists (minimum required file)
    if (!data.summary || data.summary.length === 0) {
      throw new BadRequestException("Missing required CSV: summary.csv");
    }

    // Derive period from summary rows
    const period = this.inferPeriod(data.summary);

    const fullData = UsageDataSchema.parse({
      summary: data.summary ?? [],
      daily: data.daily ?? [],
      activity: data.activity ?? [],
      models: data.models ?? [],
      projects: data.projects ?? [],
      sessions: data.sessions ?? [],
      tools: data.tools ?? [],
      shellCommands: data.shellCommands ?? [],
    });

    const user = await this.prisma.client.user.upsert({
      where: { username },
      create: { username },
      update: {},
    });

    const upload = await this.prisma.client.usageUpload.create({
      data: {
        userId: user.id,
        period,
        data: fullData as any,
      },
    });

    return {
      userId: user.id,
      uploadId: upload.id,
      uploadedAt: upload.uploadedAt,
      filesProcessed,
    };
  }

  private inferPeriod(summaryRows: { Period: string }[]): Period {
    const periods = summaryRows.map((r) => r.Period);
    const period = periods[0] ?? "30days";
    // Map CodeBurn period strings to our normalized values
    const map: Record<string, Period> = {
      Today: "today",
      "7 Days": "7days",
      "30 Days": "30days",
    };
    return map[period] ?? "30days";
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @jigit/api test usage.service.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/usage/usage.service.ts packages/api/src/usage/usage.service.test.ts
git commit -m "feat: implement UsageService with ZIP extraction and CSV parsing

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Usage Controller

**Goal:** Implement NestJS controller with upload, list, latest, and delete endpoints.

**Files:**
- Create: `packages/api/src/usage/usage.controller.ts`
- Create: `packages/api/src/usage/usage.controller.test.ts`

**Acceptance Criteria:**
- [ ] `POST /api/usage/upload` accepts multipart ZIP, returns upload metadata
- [ ] `GET /api/usage/users` returns user list
- [ ] `GET /api/usage/users/:username` returns user's uploads
- [ ] `GET /api/usage/users/:username/latest` returns latest upload data
- [ ] `DELETE /api/usage/users/:username` deletes user (AuthGuard protected)
- [ ] Upload endpoint is protected by AuthGuard
- [ ] Controller tests cover all endpoints

**Verify:** `pnpm --filter @jigit/api test usage.controller.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/usage/usage.controller.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { UsageController } from "./usage.controller.js";
import { UsageService } from "./usage.service.js";
import { PrismaService } from "../common/prisma.module.js";
import { AuthGuard } from "../auth/auth.guard.js";

const mockUsageService = {
  listUsers: vi.fn().mockResolvedValue([{ id: "u1", username: "alice", createdAt: new Date(), _count: { uploads: 2 } }]),
  getUserUploads: vi.fn().mockResolvedValue([{ id: "up1", userId: "u1", period: "30days", uploadedAt: new Date(), data: {} }]),
  getLatestUpload: vi.fn().mockResolvedValue({ id: "up1", userId: "u1", period: "30days", uploadedAt: new Date(), data: { summary: [] } }),
  deleteUser: vi.fn().mockResolvedValue({ deleted: true }),
  uploadUsageData: vi.fn().mockResolvedValue({ userId: "u1", uploadId: "up1", uploadedAt: new Date(), filesProcessed: ["summary.csv"] }),
};

const mockPrisma = { client: {} };

process.env["DASHBOARD_API_TOKEN"] = "test-dashboard-token";
process.env["DATABASE_URL"] = "postgresql://test:test@localhost/test";
process.env["REDIS_URL"] = "redis://localhost:6379";
process.env["APP_ENCRYPTION_KEY"] = "01234567890123456789012345678901";
process.env["ANTHROPIC_API_KEY"] = "test-key";
process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
process.env["PUBLIC_BASE_URL"] = "http://localhost:3000";
process.env["MAX_CONCURRENT_AGENTS"] = "4";
process.env["MAX_RETRIES"] = "3";
process.env["APPROVAL_TIMEOUT_MS"] = "300000";

describe("UsageController", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [UsageController],
      providers: [
        { provide: UsageService, useValue: mockUsageService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    app = module.createNestApplication(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => { await app?.close(); });

  it("GET /api/usage/users → 200 with users list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usage/users" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].username).toBe("alice");
  });

  it("GET /api/usage/users/alice/latest → 200 with latest upload", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usage/users/alice/latest" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty("id", "up1");
  });

  it("DELETE /api/usage/users/alice without auth → 401", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/usage/users/alice" });
    expect(res.statusCode).toBe(401);
  });

  it("DELETE /api/usage/users/alice with auth → 200", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/usage/users/alice",
      headers: { authorization: "Bearer test-dashboard-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ deleted: true });
  });
});
```

Run test (should fail):

```bash
pnpm --filter @jigit/api test usage.controller.test.ts
```

Expected: FAIL — controller doesn't exist.

- [ ] **Step 2: Implement the controller**

Create `packages/api/src/usage/usage.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { UsageService } from "./usage.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { loadConfig } from "@jigit/shared";
import { MAX_UPLOAD_SIZE } from "./types.js";

@ApiTags("Usage")
@Controller("usage")
export class UsageController {
  constructor(private readonly svc: UsageService) {}

  @Get("users")
  @ApiOperation({ summary: "List all users who have uploaded usage data" })
  @ApiResponse({ status: 200, description: "Array of users" })
  async listUsers() {
    return this.svc.listUsers();
  }

  @Get("users/:username")
  @ApiOperation({ summary: "Get a user's uploads (latest first)" })
  @ApiParam({ name: "username", description: "User name" })
  @ApiResponse({ status: 200, description: "Array of uploads" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getUserUploads(@Param("username") username: string) {
    return this.svc.getUserUploads(username);
  }

  @Get("users/:username/latest")
  @ApiOperation({ summary: "Get the most recent upload for a user" })
  @ApiParam({ name: "username", description: "User name" })
  @ApiResponse({ status: 200, description: "Latest upload data" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getLatestUpload(@Param("username") username: string) {
    const upload = await this.svc.getLatestUpload(username);
    if (!upload) return { data: null };
    return upload;
  }

  @Post("upload")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Upload a ZIP of CSV usage data" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        username: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Upload processed" })
  @ApiResponse({ status: 400, description: "Invalid ZIP or CSV" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async upload(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException("Missing file");

    const username = (req.body as any)?.username ?? "unknown";
    const buffer = await data.toBuffer();

    if (buffer.length > MAX_UPLOAD_SIZE) {
      throw new BadRequestException("File too large (max 50MB)");
    }

    return this.svc.uploadUsageData(username, buffer);
  }

  @Delete("users/:username")
  @UseGuards(new AuthGuard(loadConfig().dashboardApiToken))
  @ApiOperation({ summary: "Delete a user and all their uploads" })
  @ApiParam({ name: "username", description: "User name" })
  @ApiResponse({ status: 200, description: "User deleted" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async deleteUser(@Param("username") username: string) {
    return this.svc.deleteUser(username);
  }
}
```

Note: `@fastify/multipart` is already registered in `main.ts` per the Prerequisites section. The upload endpoint relies on `req.file()` which is provided by this plugin.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @jigit/api test usage.controller.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/usage/usage.controller.ts packages/api/src/usage/usage.controller.test.ts
git commit -m "feat: implement UsageController with upload, list, latest, delete endpoints

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Usage Module and App Wiring

**Goal:** Create UsageModule and import it into AppModule.

**Files:**
- Create: `packages/api/src/usage/usage.module.ts`
- Modify: `packages/api/src/app.module.ts`

**Acceptance Criteria:**
- [ ] `UsageModule` is created and exports `UsageController`
- [ ] `AppModule` imports `UsageModule`
- [ ] Application builds without errors

**Verify:** `pnpm --filter @jigit/api build` → success

**Steps:**

- [ ] **Step 1: Create UsageModule**

```typescript
// packages/api/src/usage/usage.module.ts
import { Module } from "@nestjs/common";
import { UsageController } from "./usage.controller.js";
import { UsageService } from "./usage.service.js";

@Module({
  controllers: [UsageController],
  providers: [UsageService],
})
export class UsageModule {}
```

- [ ] **Step 2: Import into AppModule**

Modify `packages/api/src/app.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { PrismaModule } from "./common/prisma.module.js";
import { QueueModule } from "./common/queue.module.js";
import { WebhooksModule } from "./webhooks/webhooks.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { SseModule } from "./sse/sse.module.js";
import { ConfigModule } from "./config/config.module.js";
import { TelegramModule } from "./telegram/telegram.module.js";
import { StatsModule } from "./stats/stats.module.js";
import { UsageModule } from "./usage/usage.module.js";

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    WebhooksModule,
    JobsModule,
    ApprovalsModule,
    SseModule,
    ConfigModule,
    TelegramModule,
    StatsModule,
    UsageModule,
  ],
  controllers: [],
})
export class AppModule {}
```

- [ ] **Step 3: Build**

```bash
pnpm --filter @jigit/api build
```

Expected: Success.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/usage/usage.module.ts packages/api/src/app.module.ts
git commit -m "feat: wire UsageModule into AppModule

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Backend Tests (Complete Coverage)

**Goal:** Ensure all backend code has passing tests.

**Files:**
- Modify: `packages/api/src/usage/usage.service.test.ts` (expand coverage)
- Modify: `packages/api/src/usage/usage.controller.test.ts` (expand coverage)

**Acceptance Criteria:**
- [ ] Service tests cover: listUsers, getUserUploads, getLatestUpload, deleteUser, uploadUsageData (valid ZIP, invalid ZIP, missing summary.csv, CSV parse error)
- [ ] Controller tests cover: all endpoints, auth on protected routes, 404 cases
- [ ] All tests in `packages/api` pass

**Verify:** `pnpm --filter @jigit/api test` → all pass

**Steps:**

- [ ] **Step 1: Expand service tests**

Add to `packages/api/src/usage/usage.service.test.ts`:

```typescript
  it("getUserUploads throws for unknown user", async () => {
    mockPrisma.client.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.getUserUploads("nobody")).rejects.toThrow("not found");
  });

  it("getLatestUpload returns null when no uploads", async () => {
    mockPrisma.client.user.findUnique.mockResolvedValueOnce({
      id: "u1", username: "alice", uploads: [],
    });
    const result = await service.getLatestUpload("alice");
    expect(result).toBeNull();
  });
```

- [ ] **Step 2: Expand controller tests**

Add to `packages/api/src/usage/usage.controller.test.ts`:

```typescript
  it("GET /api/usage/users/alice → 200 with uploads", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usage/users/alice" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
  });

  it("POST /api/usage/upload without auth → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/usage/upload" });
    expect(res.statusCode).toBe(401);
  });
```

- [ ] **Step 3: Run full API test suite**

```bash
pnpm --filter @jigit/api test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/usage/usage.service.test.ts packages/api/src/usage/usage.controller.test.ts
git commit -m "test: complete backend test coverage for usage module

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 1 Completion Checklist

- [ ] Prisma schema updated with `User` and `UsageUpload` models
- [ ] Migration generated and applied
- [ ] Zod types created for all CSV row shapes
- [ ] UsageService implemented with ZIP/CSV parsing
- [ ] UsageController implemented with all endpoints
- [ ] UsageModule wired into AppModule
- [ ] All backend tests passing
- [ ] API builds successfully
