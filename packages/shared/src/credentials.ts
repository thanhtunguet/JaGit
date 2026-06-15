import { z } from "zod";
import { encrypt, decrypt } from "./crypto.js";

export const CredentialKindSchema = z.enum(["jira", "gitlab", "telegram", "anthropic"]);
export type CredentialKind = z.infer<typeof CredentialKindSchema>;

export const JiraCredentialSchema = z.object({
  meta: z.object({
    baseUrl: z.string().min(1),
    botAccountId: z.string().min(1),
  }),
  secrets: z.object({
    email: z.string().min(1),
    token: z.string().min(1),
  }),
});

export const GitLabCredentialSchema = z.object({
  meta: z.object({
    baseUrl: z.string().min(1),
  }),
  secrets: z.object({
    token: z.string().min(1),
  }),
});

export const AnthropicCredentialSchema = z.object({
  meta: z.object({}).optional().default({}),
  secrets: z.object({
    apiKey: z.string().min(1),
  }),
});

export const TelegramCredentialSchema = z.object({
  meta: z.object({
    chatId: z.string().min(1),
  }),
  secrets: z.object({
    botToken: z.string().min(1),
  }),
});

/**
 * Merges provided secrets into existing encrypted secrets.
 * - If existingEncrypted is null, encrypts only the provided secrets.
 * - Non-empty provided fields overwrite existing ones.
 * - Omitted or blank/empty string fields keep existing values.
 * - Returns a new encrypted blob (never plaintext).
 */
export function mergeSecrets(
  existingEncrypted: string | null,
  provided: Record<string, string | undefined>,
  keyB64: string,
): string {
  const existing: Record<string, string> =
    existingEncrypted ? JSON.parse(decrypt(existingEncrypted, keyB64)) : {};

  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(existing)) {
    merged[key] = value;
  }

  for (const [key, value] of Object.entries(provided)) {
    if (value !== undefined && value.trim() !== "") {
      merged[key] = value;
    }
  }

  return encrypt(JSON.stringify(merged), keyB64);
}
