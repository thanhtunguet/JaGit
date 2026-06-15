import { describe, it, expect } from "vitest";
import { AcpSession } from "./client.js";

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
      // emit an update
      process.stdout.write(JSON.stringify({
        method: "session/update",
        params: { sessionId: "s1", update: { kind: "agent_message", tokens: 7, costUsd: 0.001 } }
      }) + "\\n");
      // emit a permission request
      process.stdout.write(JSON.stringify({
        id: 999,
        method: "session/request_permission",
        params: { sessionId: "s1", toolCall: { name: "bash" },
          options: [{ optionId: "allow", name: "Allow" }, { optionId: "deny", name: "Deny" }] }
      }) + "\\n");
    }
    if (msg.id === 999) {
      // after permission resolved, send end_turn for the original prompt
      process.stdout.write(JSON.stringify({ id: promptId, result: { stopReason: "end_turn" } }) + "\\n");
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
    expect(result.tokensUsed).toBe(7);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].kind).toBe("agent_message");
  });
}, { timeout: 10000 });
