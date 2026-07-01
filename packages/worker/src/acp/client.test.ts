import { describe, it, expect } from "vitest";
import {
  applyUsageUpdate,
  applyPromptUsage,
  AcpSession,
} from "./client.js";

describe("applyUsageUpdate", () => {
  it("reads ACP usage_update (cumulative used + cost)", () => {
    const result = applyUsageUpdate(
      { tokensUsed: 0, costUsd: 0 },
      {
        sessionUpdate: "usage_update",
        used: 53_000,
        size: 200_000,
        cost: { amount: 0.045, currency: "USD" },
      },
    );
    expect(result).toEqual({ tokensUsed: 53_000, costUsd: 0.045 });
  });

  it("keeps the higher cumulative values across multiple usage_update events", () => {
    let totals = applyUsageUpdate(
      { tokensUsed: 0, costUsd: 0 },
      { sessionUpdate: "usage_update", used: 10_000, cost: { amount: 0.01, currency: "USD" } },
    );
    totals = applyUsageUpdate(totals, {
      sessionUpdate: "usage_update",
      used: 25_000,
      cost: { amount: 0.03, currency: "USD" },
    });
    expect(totals).toEqual({ tokensUsed: 25_000, costUsd: 0.03 });
  });

  it("accumulates legacy tokens/costUsd fields", () => {
    let totals = applyUsageUpdate(
      { tokensUsed: 0, costUsd: 0 },
      { kind: "agent_message", tokens: 7, costUsd: 0.001 },
    );
    totals = applyUsageUpdate(totals, { kind: "agent_message", tokens: 3, costUsd: 0.002 });
    expect(totals).toEqual({ tokensUsed: 10, costUsd: 0.003 });
  });
});

describe("applyPromptUsage", () => {
  it("uses totalTokens from PromptResponse.usage as fallback", () => {
    const result = applyPromptUsage(
      { tokensUsed: 100, costUsd: 0 },
      { inputTokens: 40, outputTokens: 60, totalTokens: 120 },
    );
    expect(result.tokensUsed).toBe(120);
  });

  it("sums input/output when totalTokens is absent", () => {
    const result = applyPromptUsage(
      { tokensUsed: 0, costUsd: 0 },
      { inputTokens: 500, outputTokens: 250 },
    );
    expect(result.tokensUsed).toBe(750);
  });
});

// Fake agent: reads JSON-RPC requests, emits scripted responses
const FAKE_AGENT_SCRIPT = `
let buf = "";
let promptId = null;
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === "initialize") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: { protocolVersion: 1 } }) + "\\n");
    }
    if (msg.method === "session/new") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: { sessionId: "s1" } }) + "\\n");
    }
    if (msg.method === "session/set_mode") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: {} }) + "\\n");
    }
    if (msg.method === "session/prompt") {
      promptId = msg.id;
      process.stdout.write(JSON.stringify({
        method: "session/update",
        params: { sessionId: "s1", update: { kind: "agent_message", tokens: 7, costUsd: 0.001 } }
      }) + "\\n");
      process.stdout.write(JSON.stringify({
        id: 999,
        method: "session/request_permission",
        params: { sessionId: "s1", toolCall: { name: "bash" },
          options: [{ optionId: "allow", name: "Allow" }, { optionId: "deny", name: "Deny" }] }
      }) + "\\n");
    }
    if (msg.id === 999) {
      process.stdout.write(JSON.stringify({
        id: promptId,
        result: { stopReason: "end_turn", usage: { totalTokens: 42 } }
      }) + "\\n");
    }
  }
});
`;

describe("AcpSession", () => {
  it("runs a prompt and bridges permission requests", async () => {
    const updates: any[] = [];
    const session = new AcpSession({
      command: "node",
      args: ["-e", FAKE_AGENT_SCRIPT],
      cwd: process.cwd(),
      onUpdate: (u) => updates.push(u),
      onPermission: async (_perm) => "allow",
    });

    await session.start();
    const result = await session.runPrompt("Implement the feature");
    await session.stop();

    expect(result.stopReason).toBe("end_turn");
    expect(result.tokensUsed).toBe(42);
    expect(result.costUsd).toBeCloseTo(0.001);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].kind).toBe("agent_message");
  });
}, { timeout: 10000 });

// Fake agent: completes handshake, then never responds to session/prompt
const HANGING_AGENT_SCRIPT = `
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === "initialize") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: { protocolVersion: 1 } }) + "\\n");
    }
    if (msg.method === "session/new") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: { sessionId: "s1" } }) + "\\n");
    }
    if (msg.method === "session/set_mode") {
      process.stdout.write(JSON.stringify({ id: msg.id, result: {} }) + "\\n");
    }
    // session/prompt intentionally never answered — simulates the
    // "No onPostToolUseHook" ACP bug where the subprocess hangs.
  }
});
`;

describe("AcpSession request timeout", () => {
  it("rejects a hung request instead of waiting forever", async () => {
    const session = new AcpSession({
      command: "node",
      args: ["-e", HANGING_AGENT_SCRIPT],
      cwd: process.cwd(),
      requestTimeoutMs: 500,
      onUpdate: () => {},
      onPermission: async () => "allow",
    });

    await session.start();
    await expect(session.runPrompt("Implement the feature")).rejects.toThrow(
      /timed out/i,
    );
    await session.stop();
  });
}, { timeout: 10000 });

describe("AcpSession stop() while a request is pending", () => {
  it("rejects the in-flight request immediately instead of hanging until the timeout", async () => {
    const session = new AcpSession({
      command: "node",
      args: ["-e", HANGING_AGENT_SCRIPT],
      cwd: process.cwd(),
      requestTimeoutMs: 60_000,
      onUpdate: () => {},
      onPermission: async () => "allow",
    });

    await session.start();
    const runPromise = session.runPrompt("Implement the feature");

    await session.stop();

    await expect(runPromise).rejects.toThrow(/stopped/i);
  });
}, { timeout: 10000 });
