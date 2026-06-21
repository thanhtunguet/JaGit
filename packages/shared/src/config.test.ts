import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

const FULL_ENV = {
  DATABASE_URL: "postgresql://jagit:jagit@localhost:5432/jagit",
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
  DASHBOARD_API_TOKEN: "dash-token",
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
    expect(cfg.dashboardApiToken).toBe("dash-token");
  });

  it("rejects a non-URL PUBLIC_BASE_URL", () => {
    expect(() => parseConfig({ ...FULL_ENV, PUBLIC_BASE_URL: "not-a-url" })).toThrow();
  });
});
