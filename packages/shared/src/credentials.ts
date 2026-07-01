import { z } from "zod";
import { encrypt, decrypt } from "./crypto.js";

export const CredentialKindSchema = z.enum(["jira", "gitlab", "telegram", "anthropic"]);
export type CredentialKind = z.infer<typeof CredentialKindSchema>;

export const JiraCredentialSchema = z.object({
  meta: z
    .object({
      baseUrl: z.string().url(),
      botAccountId: z.string().min(1),
    })
    .catchall(z.string()),
  secrets: z.object({
    email: z.string().min(1),
    token: z.string().min(1),
  }),
});

export const GitLabCredentialSchema = z.object({
  meta: z
    .object({
      baseUrl: z.string().url(),
    })
    .catchall(z.string()),
  secrets: z.object({
    token: z.string().min(1),
  }),
});

export const AnthropicCredentialSchema = z.object({
  meta: z
    .object({
      baseUrl: z.string().url().optional(),
    })
    .catchall(z.string())
    .optional()
    .default({}),
  secrets: z.object({
    apiKey: z.string().min(1).optional(),
    authToken: z.string().min(1).optional(),
  }).refine((s) => !!(s.apiKey || s.authToken), { message: "Either apiKey or authToken is required" }),
});

export const TelegramCredentialSchema = z.object({
  meta: z
    .object({
      chatId: z.string().min(1),
    })
    .catchall(z.string()),
  secrets: z.object({
    botToken: z.string().min(1),
  }),
});

/**
 * Returns the required secret keys for a given credential kind.
 */
export function credentialSecretKeys(kind: CredentialKind): string[] {
  switch (kind) {
    case "jira":
      return ["email", "token"];
    case "gitlab":
      return ["token"];
    case "anthropic":
      return ["authToken", "apiKey"];
    case "telegram":
      return ["botToken"];
  }
}

const KindToSchema = {
  jira: JiraCredentialSchema,
  gitlab: GitLabCredentialSchema,
  anthropic: AnthropicCredentialSchema,
  telegram: TelegramCredentialSchema,
};

/**
 * Validates a full credential input against the appropriate kind schema.
 */
export function validateCredential(kind: CredentialKind, input: unknown) {
  return KindToSchema[kind].parse(input);
}

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
      merged[key] = value.trim();
    }
  }

  return encrypt(JSON.stringify(merged), keyB64);
}
