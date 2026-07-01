# Phase 5 — Telegram Bot + Approval Bridge

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.
> **TDD is mandatory** — write the failing test first, see it fail, then implement.

**Goal:** When Claude Code emits a `session/request_permission`, the worker
creates an `Approval` row, notifies Telegram (inline keyboard) and the dashboard
(via Redis pub/sub), then blocks until a human decides or the approval times out.
The `resolveApproval` function is idempotent: the first channel (Telegram or
dashboard) to respond wins; the other is silently ignored.

**Prerequisites:** Phase 0 + Phase 1 + Phase 2 + Phase 3 complete.
The `Approval` model (Phase 1) and `publishControl` helper (Phase 2) must exist.

**Reference spec:** `docs/superpowers/specs/2026-06-14-jigit-mvp-design.md` §5

---

## Approval lifecycle

```
runAgent node hits session/request_permission
  │
  ▼
worker creates Approval(pending) in DB
  │
  ├─ publishes "approval_requested" to jobChannel → SSE → dashboard pending card
  └─ Telegram bot sends message with inline keyboard (one button per option)
        callback_data = "appr:<approvalId>:<optionId>"
  │
  ▼
Human decides (within APPROVAL_TIMEOUT_MS):
  ├─ Telegram callback → POST /approvals/:id/decide (api)
  └─ Dashboard Approve/Reject → POST /approvals/:id/decide (api)
  │
  ▼
resolveApproval (idempotent):
  ├─ UPDATE Approval WHERE status=pending (first writer wins)
  └─ publishes "approval" control signal to controlChannel(jobId)
  │
  ▼
worker awaitApproval resolves with chosenOptionId
  └─ sends optionId back to ACP → graph continues
  │
  OR (timeout)
  │
  ▼
auto-reject: resolveApproval(id, denyOptionId, "system") + status=expired
```

---

## Acceptance Criteria

- [ ] `resolveApproval` updates Approval to `approved`/`rejected` and publishes the signal.
- [ ] Second call to `resolveApproval` for the same approval is a no-op (returns `alreadyDecided`).
- [ ] `awaitApproval` resolves with the `chosenOptionId` published on the control channel.
- [ ] On timeout, `awaitApproval` calls `resolveApproval` with the deny option and resolves to deny.
- [ ] Telegram callback handler parses `appr:<id>:<opt>` and calls `resolveApproval`.
- [ ] `pnpm --filter @jigit/api test` and `pnpm --filter @jigit/worker test` pass.

---

## Steps

### Step 1 — `resolveApproval` service (TDD, in api package)

The `ApprovalsService` was created in Phase 3. This step adds the approval bridge
used by the Telegram bot callback.

- [ ] **Write additional failing test** — add to `packages/api/src/approvals/approvals.service.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalsService } from "./approvals.service.js";

// Mock the PrismaService and Redis publisher
vi.mock("@jigit/shared", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    publishControl: vi.fn().mockResolvedValue(undefined),
    loadConfig: () => ({
      redisUrl: "redis://localhost:6379",
      approvalTimeoutMs: 100,
    }),
  };
});

const pendingApproval = {
  id: "appr-1",
  jobId: "job-1",
  status: "pending",
  options: [{ optionId: "allow", name: "Allow" }, { optionId: "deny", name: "Deny" }],
};

const mockPrisma = {
  client: {
    approval: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ ...pendingApproval, status: "approved" }),
    },
  },
};

describe("ApprovalsService.decide", () => {
  let svc: ApprovalsService;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ApprovalsService(mockPrisma as any);
  });

  it("resolves a pending approval", async () => {
    mockPrisma.client.approval.findUnique.mockResolvedValue(pendingApproval);
    const result = await svc.decide("appr-1", "allow", "telegram", "user-1");
    expect(result).toMatchObject({ decided: true });
  });

  it("is idempotent (already-decided returns alreadyDecided)", async () => {
    mockPrisma.client.approval.findUnique.mockResolvedValue({
      ...pendingApproval, status: "approved" });
    const result = await svc.decide("appr-1", "allow", "telegram");
    expect(result).toMatchObject({ alreadyDecided: true });
  });
});
```

- [ ] Run → **FAIL** (module not found or assertion failure). ✓ Red.

- [ ] The `ApprovalsService.decide` implementation from Phase 3 already handles
  the idempotency case. Make sure it exports cleanly and the mock wiring is correct,
  then re-run.

- [ ] Run → **PASS**. ✓ Green.

---

### Step 2 — `awaitApproval` helper (TDD, in worker package)

- [ ] **Write failing test** — `packages/worker/src/approval.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { awaitApproval } from "./approval.js";
import EventEmitter from "node:events";

vi.mock("@jigit/shared", async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    makeRedis: vi.fn(),
    loadConfig: () => ({ approvalTimeoutMs: 50, redisUrl: "redis://x" }),
  };
});

import { makeRedis } from "@jigit/shared";

describe("awaitApproval", () => {
  it("resolves with the chosen optionId from the control channel", async () => {
    const emitter = new EventEmitter();
    const fakeSub = Object.assign(emitter, {
      subscribe: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(makeRedis).mockReturnValue(fakeSub as any);

    // Simulate a control signal arriving after 10ms
    setTimeout(() => {
      emitter.emit("message", "control:job-1",
        JSON.stringify({ type: "approval", approvalId: "appr-1", chosenOptionId: "allow" })
      );
    }, 10);

    const optionId = await awaitApproval({
      approvalId: "appr-1",
      jobId: "job-1",
      denyOptionId: "deny",
      resolveApproval: vi.fn().mockResolvedValue(undefined),
    });
    expect(optionId).toBe("allow");
  });

  it("auto-rejects on timeout and returns denyOptionId", async () => {
    const emitter = new EventEmitter();
    const fakeSub = Object.assign(emitter, {
      subscribe: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(makeRedis).mockReturnValue(fakeSub as any);

    const resolve = vi.fn().mockResolvedValue(undefined);
    const optionId = await awaitApproval({
      approvalId: "appr-2",
      jobId: "job-1",
      denyOptionId: "deny",
      resolveApproval: resolve,
    });

    expect(optionId).toBe("deny");
    expect(resolve).toHaveBeenCalledWith("appr-2", "deny", "system");
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Create `packages/worker/src/approval.ts`:
```ts
import { makeRedis, controlChannel, loadConfig } from "@jigit/shared";

export interface AwaitApprovalOpts {
  approvalId: string;
  jobId: string;
  denyOptionId: string;
  resolveApproval: (id: string, optionId: string, via: string) => Promise<void>;
}

/**
 * Subscribes to the job's control channel and waits for an approval signal
 * matching `approvalId`. On timeout, auto-rejects and returns `denyOptionId`.
 */
export async function awaitApproval(opts: AwaitApprovalOpts): Promise<string> {
  const cfg = loadConfig();
  const redis = makeRedis(cfg.redisUrl);
  const channel = controlChannel(opts.jobId);
  await redis.subscribe(channel);

  return new Promise<string>((resolve) => {
    let resolved = false;

    const timer = setTimeout(async () => {
      if (resolved) return;
      resolved = true;
      await opts.resolveApproval(opts.approvalId, opts.denyOptionId, "system");
      await redis.quit();
      resolve(opts.denyOptionId);
    }, cfg.approvalTimeoutMs);

    redis.on("message", async (_ch: string, msg: string) => {
      try {
        const signal = JSON.parse(msg);
        if (
          signal.type === "approval" &&
          signal.approvalId === opts.approvalId &&
          !resolved
        ) {
          resolved = true;
          clearTimeout(timer);
          await redis.quit();
          resolve(signal.chosenOptionId as string);
        }
      } catch { /* ignore */ }
    });
  });
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 3 — Telegram bot module (in api package)

- [ ] Create `packages/api/src/telegram/telegram.service.ts`:
```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import { loadConfig } from "@jigit/shared";
import { ApprovalsService } from "../approvals/approvals.service.js";

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot!: TelegramBot;
  private readonly cfg = loadConfig();

  constructor(private readonly approvalsService: ApprovalsService) {}

  onModuleInit() {
    this.bot = new TelegramBot(this.cfg.telegramBotToken, { polling: true });
    this.registerCallbackHandler();
  }

  onModuleDestroy() {
    this.bot.stopPolling();
  }

  /** Send an approval prompt with inline keyboard to the configured chat */
  async sendApproval(opts: {
    chatId: string;
    approvalId: string;
    jobId: string;
    prompt: string;
    options: { optionId: string; name: string }[];
  }): Promise<string> {
    const msg = await this.bot.sendMessage(opts.chatId, [
      `🤖 *Approval required* for job \`${opts.jobId}\``,
      "",
      opts.prompt,
    ].join("\n"), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          opts.options.map((o) => ({
            text: o.name,
            callback_data: `appr:${opts.approvalId}:${o.optionId}`,
          })),
        ],
      },
    });
    return String(msg.message_id);
  }

  /** Send a plain text report message */
  async sendReport(chatId: string, text: string): Promise<void> {
    await this.bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  }

  private registerCallbackHandler() {
    // Handles inline-keyboard button presses: callback_data = "appr:<id>:<optionId>"
    this.bot.on("callback_query", async (query) => {
      const data = query.data ?? "";
      if (!data.startsWith("appr:")) return;

      const [, approvalId, optionId] = data.split(":");
      if (!approvalId || !optionId) return;

      const user = query.from?.username ?? query.from?.id?.toString() ?? "unknown";

      try {
        await this.approvalsService.decide(approvalId, optionId, "telegram", user);
        await this.bot.answerCallbackQuery(query.id, { text: `✅ ${optionId} recorded` });

        // Edit the message to show the decision
        if (query.message) {
          await this.bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: query.message.chat.id, message_id: query.message.message_id }
          );
        }
      } catch (err) {
        await this.bot.answerCallbackQuery(query.id, {
          text: `Error: ${(err as Error).message}`, show_alert: true });
      }
    });
  }
}
```

- [ ] Create `packages/api/src/telegram/telegram.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { TelegramService } from "./telegram.service.js";
import { ApprovalsModule } from "../approvals/approvals.module.js";

@Module({
  imports: [ApprovalsModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] Register `TelegramModule` in `app.module.ts`.

---

### Step 4 — Wire `awaitApproval` into the worker graph

The `runAgent` node in `packages/worker/src/nodes/runAgent.ts` must use
`awaitApproval` as its `onPermission` callback. When ACP emits
`session/request_permission`, the node should:

1. Create an `Approval` row in Postgres.
2. Publish an `approval_requested` event to `jobChannel(jobId)` (dashboard sees it via SSE).
3. Optionally call the Telegram service via an HTTP call to the API
   (or the worker can call TelegramService directly if co-located — for MVP,
   use a direct call to the Telegram Bot API via `node-telegram-bot-api` in the worker).
4. Call `awaitApproval(...)` and return the resolved `chosenOptionId` to ACP.

```ts
// Inside runAgent.ts node
const onPermission = async (req: PermissionRequest) => {
  const approval = await prisma.approval.create({
    data: {
      jobId: state.jobId,
      kind: "tool_permission",
      prompt: `Allow tool: ${req.toolCall.name}`,
      options: req.options,
      status: "pending",
    },
  });

  await deps.sink.addEvent(state.jobId, {
    type: "approval_requested",
    message: `Approval required: ${req.toolCall.name}`,
    payload: { approvalId: approval.id, options: req.options },
  });

  // Telegram notification is best-effort
  deps.sendTelegram(`Approval needed for job ${state.jobId}: allow ${req.toolCall.name}?`).catch(console.error);

  return awaitApproval({
    approvalId: approval.id,
    jobId: state.jobId,
    denyOptionId: req.options.find(o => o.optionId.includes("deny"))?.optionId ?? "deny",
    resolveApproval: async (id, optionId, via) => {
      await prisma.approval.updateMany({
        where: { id, status: "pending" },
        data: { status: optionId.startsWith("deny") ? "rejected" : "approved",
          chosenOptionId: optionId, decidedVia: via, decidedBy: "system", decidedAt: new Date() },
      });
    },
  });
};
```

---

### Step 5 — Full test run

- [ ] Run:
```bash
pnpm --filter @jigit/api test
pnpm --filter @jigit/worker test
```

All must pass.

---

### Step 6 — Commit

- [ ] Stage and commit:
```bash
git add packages/api/src/telegram \
        packages/api/src/approvals \
        packages/api/src/app.module.ts \
        packages/worker/src/approval.ts \
        packages/worker/src/nodes/runAgent.ts
git commit -m "feat: approval bridge — Telegram bot, awaitApproval, idempotent resolve

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
