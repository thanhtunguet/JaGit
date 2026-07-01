# Phase 2 — Shared Package

> **For agentic workers:** Use `superpowers-extended-cc:subagent-driven-development` or
> `superpowers-extended-cc:executing-plans`.
> All steps use `- [ ]` checkbox syntax; tick each as you complete it.
> **TDD is mandatory** — write the failing test first, see it fail, then implement.

**Goal:** All shared utilities used by both the API and worker live in
`@jigit/shared`: config loader, AES-256-GCM crypto, retry policy, branch-name
derivation, BullMQ queue/worker factory, Redis pub/sub helpers, and the shared
type barrel.

**Prerequisites:** Phase 0 (scaffolding) + Phase 1 (DB schema) complete.

---

## Acceptance Criteria

- [ ] `pnpm --filter @jigit/shared test` — all tests pass.
- [ ] `pnpm --filter @jigit/shared build` — compiles with no errors.
- [ ] `encrypt(x)` → `decrypt()` round-trips; ciphertext differs on every call.
- [ ] `loadConfig()` throws a clear Zod error when a required env var is missing.
- [ ] `deriveBranchName` produces `bugfix/KEY-slug` for Bug, `feature/KEY-slug` for Story.
- [ ] `withRetry` retries exactly `maxRetries + 1` times then throws.
- [ ] `index.ts` re-exports every module.

---

## Steps

### Step 1 — Add shared dependencies

- [ ] In `packages/shared`:
```bash
cd packages/shared
pnpm add zod ioredis bullmq
```

---

### Step 2 — AES-256-GCM crypto (TDD)

- [ ] **Write failing test first** — `packages/shared/src/crypto.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("crypto", () => {
  it("round-trips plaintext", () => {
    const ciphertext = encrypt("super-secret", KEY);
    expect(ciphertext).not.toBe("super-secret");
    expect(decrypt(ciphertext, KEY)).toBe("super-secret");
  });

  it("uses a unique IV each call (ciphertexts differ)", () => {
    const a = encrypt("x", KEY);
    const b = encrypt("x", KEY);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const c = encrypt("data", KEY);
    const [iv, tag, enc] = c.split(".");
    expect(() => decrypt([iv, tag, enc + "XX"].join("."), KEY)).toThrow();
  });
});
```

- [ ] Run → **FAIL** (module not found). ✓ Red.

- [ ] Implement `packages/shared/src/crypto.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts `plain` with AES-256-GCM.
 * Output format: "<iv_b64>.<tag_b64>.<ciphertext_b64>"
 */
export function encrypt(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

/**
 * Decrypts a payload produced by `encrypt`.
 * Throws if the key is wrong or the ciphertext was tampered with.
 */
export function decrypt(payload: string, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [iv, tag, enc] = parts.map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 3 — Zod config loader (TDD)

- [ ] **Write failing test** — `packages/shared/src/config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

const FULL_ENV = {
  DATABASE_URL: "postgresql://jigit:jigit@localhost:5432/jigit",
  REDIS_URL: "redis://localhost:6379",
  APP_ENCRYPTION_KEY: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa==",
  MAX_CONCURRENT_AGENTS: "3",
  MAX_RETRIES: "3",
  APPROVAL_TIMEOUT_MS: "1800000",
  ANTHROPIC_API_KEY: "sk-ant-test",
  TELEGRAM_BOT_TOKEN: "1234567890:AAAA",
  PUBLIC_BASE_URL: "http://localhost:3000",
  API_PORT: "3000",
  API_WEBHOOK_SECRET: "webhook-secret",
};

describe("parseConfig", () => {
  it("rejects an empty env (missing keys)", () => {
    expect(() => parseConfig({})).toThrow();
  });

  it("parses a complete env and coerces numbers", () => {
    const cfg = parseConfig(FULL_ENV);
    expect(cfg.maxConcurrentAgents).toBe(3);
    expect(cfg.approvalTimeoutMs).toBe(1800000);
    expect(cfg.apiPort).toBe(3000);
  });

  it("rejects a non-URL PUBLIC_BASE_URL", () => {
    expect(() => parseConfig({ ...FULL_ENV, PUBLIC_BASE_URL: "not-a-url" })).toThrow();
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Implement `packages/shared/src/config.ts`:
```ts
import { z } from "zod";

const Schema = z.object({
  DATABASE_URL:           z.string().min(1),
  REDIS_URL:              z.string().min(1),
  APP_ENCRYPTION_KEY:     z.string().min(1),
  MAX_CONCURRENT_AGENTS:  z.coerce.number().int().positive(),
  MAX_RETRIES:            z.coerce.number().int().nonnegative(),
  APPROVAL_TIMEOUT_MS:    z.coerce.number().int().positive(),
  ANTHROPIC_API_KEY:      z.string().min(1),
  TELEGRAM_BOT_TOKEN:     z.string().min(1),
  PUBLIC_BASE_URL:        z.string().url(),
  API_PORT:               z.coerce.number().int().positive().default(3000),
  API_WEBHOOK_SECRET:     z.string().min(1),
});

export type RawEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function parseConfig(env: RawEnv) {
  const p = Schema.parse(env);
  return {
    databaseUrl:          p.DATABASE_URL,
    redisUrl:             p.REDIS_URL,
    encryptionKey:        p.APP_ENCRYPTION_KEY,
    maxConcurrentAgents:  p.MAX_CONCURRENT_AGENTS,
    maxRetries:           p.MAX_RETRIES,
    approvalTimeoutMs:    p.APPROVAL_TIMEOUT_MS,
    anthropicApiKey:      p.ANTHROPIC_API_KEY,
    telegramBotToken:     p.TELEGRAM_BOT_TOKEN,
    publicBaseUrl:        p.PUBLIC_BASE_URL,
    apiPort:              p.API_PORT,
    webhookSecret:        p.API_WEBHOOK_SECRET,
  };
}

export type AppConfig = ReturnType<typeof parseConfig>;

/** Loads config from `process.env`. Throws if any required var is missing. */
export const loadConfig = (): AppConfig => parseConfig(process.env);
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 4 — Bounded retry policy (TDD, pure)

- [ ] **Write failing test** — `packages/shared/src/retry.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry.js";

describe("withRetry", () => {
  it("returns immediately on first success", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await withRetry(fn, { maxRetries: 3, baseDelayMs: 0 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until success", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error("not yet");
      return "ok";
    });
    expect(await withRetry(fn, { maxRetries: 3, baseDelayMs: 0 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after maxRetries + 1 attempts", async () => {
    const fn = vi.fn(async () => { throw new Error("nope"); });
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 0 })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Implement `packages/shared/src/retry.ts`:
```ts
export interface RetryOpts {
  maxRetries: number;
  baseDelayMs: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxRetries) {
        await sleep(opts.baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastError;
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 5 — Branch-name derivation (TDD, pure)

- [ ] **Write failing test** — `packages/shared/src/branch.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { deriveBranchName, extractIssueKey } from "./branch.js";

const RULES = { Bug: "bugfix/", Story: "feature/", Task: "feature/", default: "feature/" };

describe("deriveBranchName", () => {
  it("uses type-specific prefix for Bug", () => {
    expect(
      deriveBranchName({ key: "JIGIT-12", type: "Bug", summary: "Fix Login!" }, RULES)
    ).toBe("bugfix/JIGIT-12-fix-login");
  });

  it("falls back to default prefix for unknown type", () => {
    expect(
      deriveBranchName({ key: "JIGIT-9", type: "Spike", summary: "Explore caching" }, RULES)
    ).toBe("feature/JIGIT-9-explore-caching");
  });

  it("truncates long summaries to 40 chars in the slug", () => {
    const summary = "This is a very long summary that should be truncated at forty chars";
    const branch = deriveBranchName({ key: "X-1", type: "Bug", summary }, RULES);
    // slug portion (after "bugfix/X-1-") must be ≤ 40 chars
    const slug = branch.replace("bugfix/X-1-", "");
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it("strips non-ASCII and special characters", () => {
    expect(
      deriveBranchName({ key: "X-2", type: "Bug", summary: "Ünîcödé & special!!" }, RULES)
    ).toBe("bugfix/X-2-unicode-special");
  });
});

describe("extractIssueKey", () => {
  it("extracts a key from a feature branch", () => {
    expect(extractIssueKey("feature/JIGIT-12-fix-login")).toBe("JIGIT-12");
  });

  it("extracts a key from a bugfix branch", () => {
    expect(extractIssueKey("bugfix/PROJ-99-some-bug")).toBe("PROJ-99");
  });

  it("returns null when no key is present", () => {
    expect(extractIssueKey("main")).toBeNull();
  });
});
```

- [ ] Run → **FAIL**. ✓ Red.

- [ ] Implement `packages/shared/src/branch.ts`:
```ts
export interface IssueRef {
  key: string;
  type: string;
  summary: string;
}

export type BranchRules = Record<string, string> & { default?: string };

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")   // strip combining diacritics
    .replace(/[^\w\s-]/g, "")          // strip non-word chars
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/-$/, "");
}

export function deriveBranchName(issue: IssueRef, rules: BranchRules): string {
  const prefix = rules[issue.type] ?? rules.default ?? "feature/";
  return `${prefix}${issue.key}-${slugify(issue.summary)}`;
}

export function extractIssueKey(branch: string): string | null {
  const match = branch.match(/([A-Z][A-Z0-9]+-\d+)/);
  return match ? match[1] : null;
}
```

- [ ] Run → **PASS**. ✓ Green.

---

### Step 6 — Shared types

- [ ] Create `packages/shared/src/types.ts`:
```ts
import { z } from "zod";

/** The BullMQ queue name — single constant used everywhere */
export const JOB_QUEUE = "jigit-jobs";

/** Payload pushed onto the BullMQ queue when a job is created */
export const JigitJobDataSchema = z.object({ jobId: z.string() });
export type JigitJobData = z.infer<typeof JigitJobDataSchema>;

/** Control signals published to Redis controlChannel(jobId) */
export type ControlSignalType = "stop" | "pause" | "resume" | "approval";

export interface ControlSignal {
  type: ControlSignalType;
  jobId: string;
  approvalId?: string;
  chosenOptionId?: string;
}
```

---

### Step 7 — BullMQ factory (`queue.ts`)

- [ ] Create `packages/shared/src/queue.ts`:
```ts
import { Queue, Worker, type Processor } from "bullmq";
import { JOB_QUEUE } from "./types.js";

const connection = (url: string) => ({ connection: { url } });

/** Creates the BullMQ queue used by the API to enqueue jobs */
export const createQueue = (redisUrl: string) =>
  new Queue<JigitJobData>(JOB_QUEUE, connection(redisUrl));

/** Creates the BullMQ worker consumed by the worker service */
export const createWorker = <T = unknown>(
  redisUrl: string,
  processor: Processor<T>,
  concurrency: number
) =>
  new Worker<T>(JOB_QUEUE, processor, { ...connection(redisUrl), concurrency });

// Re-export for convenience
export type { JigitJobData } from "./types.js";
```

---

### Step 8 — Redis pub/sub helpers (`events.ts`)

- [ ] Create `packages/shared/src/events.ts`:
```ts
import IORedis from "ioredis";
import type { ControlSignal } from "./types.js";

/** Channel name for live job event streaming (dashboard SSE) */
export const jobChannel = (jobId: string) => `job:${jobId}`;

/** Channel name for worker control signals (stop/pause/resume/approval) */
export const controlChannel = (jobId: string) => `control:${jobId}`;

/** Creates a connected IORedis instance */
export function makeRedis(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: false });
}

/** Publish any JSON-serialisable payload to a channel */
export async function publishEvent(url: string, channel: string, data: unknown): Promise<void> {
  const client = makeRedis(url);
  try {
    await client.publish(channel, JSON.stringify(data));
  } finally {
    await client.quit();
  }
}

/** Publish a control signal to the worker monitoring the given job */
export async function publishControl(url: string, signal: ControlSignal): Promise<void> {
  return publishEvent(url, controlChannel(signal.jobId), signal);
}
```

---

### Step 9 — Barrel export

- [ ] Update `packages/shared/src/index.ts` (replace placeholder):
```ts
export * from "./config.js";
export * from "./crypto.js";
export * from "./prisma.js";
export * from "./branch.js";
export * from "./retry.js";
export * from "./queue.js";
export * from "./events.js";
export * from "./types.js";
```

---

### Step 10 — Build + all tests pass

- [ ] Run:
```bash
pnpm --filter @jigit/shared build
pnpm --filter @jigit/shared test
```

All tests must pass. If any fail, fix before proceeding.

---

### Step 11 — Commit

- [ ] Stage and commit:
```bash
git add packages/shared/src \
        packages/shared/package.json
git commit -m "feat(shared): config, crypto, retry, branch, queue, events, types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
