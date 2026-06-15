import { describe, expect, it } from "vitest";
import {
  CredentialKindSchema,
  JiraCredentialSchema,
  GitLabCredentialSchema,
  AnthropicCredentialSchema,
  TelegramCredentialSchema,
  mergeSecrets,
} from "./credentials.js";
import { decrypt } from "./crypto.js";

const KEY = Buffer.alloc(32, 11).toString("base64");

describe("CredentialKindSchema", () => {
  it("accepts valid kinds", () => {
    expect(() => CredentialKindSchema.parse("jira")).not.toThrow();
    expect(() => CredentialKindSchema.parse("gitlab")).not.toThrow();
    expect(() => CredentialKindSchema.parse("anthropic")).not.toThrow();
    expect(() => CredentialKindSchema.parse("telegram")).not.toThrow();
  });

  it("rejects invalid kinds", () => {
    expect(() => CredentialKindSchema.parse("unknown")).toThrow();
  });
});

describe("JiraCredentialSchema", () => {
  it("accepts valid jira credentials", () => {
    const result = JiraCredentialSchema.parse({
      meta: { baseUrl: "https://jira.example.com", botAccountId: "123" },
      secrets: { email: "bot@example.com", token: "tok" },
    });
    expect(result.meta.baseUrl).toBe("https://jira.example.com");
    expect(result.secrets.email).toBe("bot@example.com");
  });

  it("rejects missing required meta fields", () => {
    expect(() =>
      JiraCredentialSchema.parse({
        meta: { baseUrl: "https://jira.example.com" },
        secrets: { email: "bot@example.com", token: "tok" },
      }),
    ).toThrow();
  });

  it("rejects missing required secret fields", () => {
    expect(() =>
      JiraCredentialSchema.parse({
        meta: { baseUrl: "https://jira.example.com", botAccountId: "123" },
        secrets: { email: "bot@example.com" },
      }),
    ).toThrow();
  });
});

describe("GitLabCredentialSchema", () => {
  it("accepts valid gitlab credentials", () => {
    const result = GitLabCredentialSchema.parse({
      meta: { baseUrl: "https://gitlab.com" },
      secrets: { token: "glpat-xxx" },
    });
    expect(result.meta.baseUrl).toBe("https://gitlab.com");
    expect(result.secrets.token).toBe("glpat-xxx");
  });

  it("rejects missing required secret fields", () => {
    expect(() =>
      GitLabCredentialSchema.parse({
        meta: { baseUrl: "https://gitlab.com" },
        secrets: {},
      }),
    ).toThrow();
  });
});

describe("AnthropicCredentialSchema", () => {
  it("accepts valid anthropic credentials", () => {
    const result = AnthropicCredentialSchema.parse({
      meta: {},
      secrets: { apiKey: "sk-ant-xxx" },
    });
    expect(result.secrets.apiKey).toBe("sk-ant-xxx");
  });

  it("rejects missing required secret fields", () => {
    expect(() =>
      AnthropicCredentialSchema.parse({
        meta: {},
        secrets: {},
      }),
    ).toThrow();
  });
});

describe("TelegramCredentialSchema", () => {
  it("accepts valid telegram credentials", () => {
    const result = TelegramCredentialSchema.parse({
      meta: { chatId: "123456" },
      secrets: { botToken: "123:abc" },
    });
    expect(result.meta.chatId).toBe("123456");
    expect(result.secrets.botToken).toBe("123:abc");
  });

  it("rejects missing required meta fields", () => {
    expect(() =>
      TelegramCredentialSchema.parse({
        meta: {},
        secrets: { botToken: "123:abc" },
      }),
    ).toThrow();
  });

  it("rejects missing required secret fields", () => {
    expect(() =>
      TelegramCredentialSchema.parse({
        meta: { chatId: "123456" },
        secrets: {},
      }),
    ).toThrow();
  });
});

describe("mergeSecrets", () => {
  it("encrypts provided secrets when no existing blob", () => {
    const provided = { apiKey: "sk-ant-new" };
    const result = mergeSecrets(null, provided, KEY);
    expect(typeof result).toBe("string");
    expect(result.split(".")).toHaveLength(3);
    const decrypted = JSON.parse(decrypt(result, KEY));
    expect(decrypted).toEqual({ apiKey: "sk-ant-new" });
  });

  it("overwrites existing secrets with provided non-empty values", () => {
    const existing = mergeSecrets(null, { apiKey: "old-key", orgId: "org-1" }, KEY);
    const result = mergeSecrets(existing, { apiKey: "new-key" }, KEY);
    const decrypted = JSON.parse(decrypt(result, KEY));
    expect(decrypted).toEqual({ apiKey: "new-key", orgId: "org-1" });
  });

  it("keeps existing secrets when provided fields are omitted", () => {
    const existing = mergeSecrets(null, { token: "old-token" }, KEY);
    const result = mergeSecrets(existing, {}, KEY);
    const decrypted = JSON.parse(decrypt(result, KEY));
    expect(decrypted).toEqual({ token: "old-token" });
  });

  it("keeps existing secrets when provided fields are blank", () => {
    const existing = mergeSecrets(null, { token: "old-token", email: "a@b.com" }, KEY);
    const result = mergeSecrets(existing, { token: "", email: undefined }, KEY);
    const decrypted = JSON.parse(decrypt(result, KEY));
    expect(decrypted).toEqual({ token: "old-token", email: "a@b.com" });
  });

  it("returns a new ciphertext (re-encrypts)", () => {
    const existing = mergeSecrets(null, { token: "old" }, KEY);
    const result = mergeSecrets(existing, { token: "new" }, KEY);
    expect(result).not.toBe(existing);
    const decrypted = JSON.parse(decrypt(result, KEY));
    expect(decrypted).toEqual({ token: "new" });
  });

  it("never returns plaintext", () => {
    const result = mergeSecrets(null, { key: "val" }, KEY);
    expect(result).not.toContain("val");
    expect(result).not.toContain("key");
  });
});
