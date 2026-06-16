import { z } from "zod";

const Schema = z.object({
  DATABASE_URL:           z.string().min(1),
  REDIS_URL:              z.string().min(1),
  APP_ENCRYPTION_KEY:     z.string().min(1),
  MAX_CONCURRENT_AGENTS:  z.coerce.number().int().positive(),
  MAX_RETRIES:            z.coerce.number().int().nonnegative(),
  APPROVAL_TIMEOUT_MS:    z.coerce.number().int().positive(),
  ACP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  ANTHROPIC_API_KEY:      z.string().min(1),
  TELEGRAM_BOT_TOKEN:     z.string().min(1),
  PUBLIC_BASE_URL:        z.string().url(),
  API_PORT:               z.coerce.number().int().positive().default(3000),
  API_WEBHOOK_SECRET:     z.string().min(1),
  DASHBOARD_API_TOKEN:    z.string().min(1),
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
    acpRequestTimeoutMs:  p.ACP_REQUEST_TIMEOUT_MS,
    anthropicApiKey:      p.ANTHROPIC_API_KEY,
    telegramBotToken:     p.TELEGRAM_BOT_TOKEN,
    publicBaseUrl:        p.PUBLIC_BASE_URL,
    apiPort:              p.API_PORT,
    webhookSecret:        p.API_WEBHOOK_SECRET,
    dashboardApiToken:    p.DASHBOARD_API_TOKEN,
  };
}

export type AppConfig = ReturnType<typeof parseConfig>;

/** Loads config from `process.env`. Throws if any required var is missing. */
export const loadConfig = (): AppConfig => parseConfig(process.env);
