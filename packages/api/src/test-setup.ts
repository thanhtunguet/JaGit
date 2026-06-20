import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../../.env") });

// Override empty values with test values
if (!process.env["DASHBOARD_API_TOKEN"]) {
  process.env["DASHBOARD_API_TOKEN"] = "test-dashboard-token";
}
if (!process.env["DATABASE_URL"]) {
  process.env["DATABASE_URL"] = "postgresql://test:test@localhost/test";
}
if (!process.env["REDIS_URL"]) {
  process.env["REDIS_URL"] = "redis://localhost:6379";
}
if (!process.env["APP_ENCRYPTION_KEY"]) {
  process.env["APP_ENCRYPTION_KEY"] = "01234567890123456789012345678901";
}
if (!process.env["ANTHROPIC_API_KEY"]) {
  process.env["ANTHROPIC_API_KEY"] = "test-key";
}
if (!process.env["TELEGRAM_BOT_TOKEN"]) {
  process.env["TELEGRAM_BOT_TOKEN"] = "test-token";
}
if (!process.env["PUBLIC_BASE_URL"]) {
  process.env["PUBLIC_BASE_URL"] = "http://localhost:3000";
}
if (!process.env["MAX_CONCURRENT_AGENTS"]) {
  process.env["MAX_CONCURRENT_AGENTS"] = "4";
}
if (!process.env["MAX_RETRIES"]) {
  process.env["MAX_RETRIES"] = "3";
}
if (!process.env["APPROVAL_TIMEOUT_MS"]) {
  process.env["APPROVAL_TIMEOUT_MS"] = "300000";
}
if (!process.env["API_WEBHOOK_SECRET"]) {
  process.env["API_WEBHOOK_SECRET"] = "test-secret";
}
