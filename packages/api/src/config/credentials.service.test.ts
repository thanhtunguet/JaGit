import { describe, it, expect, vi, beforeEach } from "vitest";
import { CredentialsService } from "./credentials.service.js";
import { encrypt, credentialSecretKeys, decrypt } from "@jigit/shared";

const KEY = Buffer.from("0123456789012345678901234567890123456789012345678901234567890123", "hex").toString("base64");

function makeEncrypted(secrets: Record<string, string>) {
  return { encrypted: encrypt(JSON.stringify(secrets), KEY) };
}

const mockPrisma = {
  client: {
    credential: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
};

describe("CredentialsService", () => {
  let svc: CredentialsService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new CredentialsService(mockPrisma as any, KEY);
  });

  describe("list", () => {
    it("returns id, kind, name, meta, secretKeys — no secret values", async () => {
      mockPrisma.client.credential.findMany.mockResolvedValue([
        {
          id: "cred-1",
          kind: "jira",
          name: "Jira Prod",
          secrets: makeEncrypted({ email: "a@b.com", token: "sekrit" }),
          meta: { baseUrl: "https://jira.example.com", botAccountId: "bot-1" },
        },
      ]);

      const result = await svc.list();
      expect(result).toEqual([
        {
          id: "cred-1",
          kind: "jira",
          name: "Jira Prod",
          meta: { baseUrl: "https://jira.example.com", botAccountId: "bot-1" },
          secretKeys: ["email", "token"],
        },
      ]);
    });
  });

  describe("create", () => {
    it("validates per-kind and stores an encrypted blob", async () => {
      mockPrisma.client.credential.create.mockImplementation(async (args: any) => ({
        id: "cred-new",
        ...args.data,
      }));

      const result = await svc.create({
        kind: "gitlab",
        name: "GitLab Prod",
        meta: { baseUrl: "https://gitlab.example.com" },
        secrets: { token: "glpat-xxx" },
      });

      expect(result).toMatchObject({ id: "cred-new" });
      expect(mockPrisma.client.credential.create).toHaveBeenCalledOnce();
      const created = mockPrisma.client.credential.create.mock.calls[0][0].data;
      expect(created.secrets).toHaveProperty("encrypted");
      expect(created.secrets.encrypted).not.toContain("glpat-xxx");
    });

    it("throws on invalid kind input", async () => {
      await expect(
        svc.create({
          kind: "jira" as any,
          name: "Bad",
          meta: {},
          secrets: {},
        }),
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("merges secrets (blank keeps existing) and re-validates meta", async () => {
      mockPrisma.client.credential.findUnique.mockResolvedValue({
        id: "cred-1",
        kind: "jira",
        name: "Jira Prod",
        secrets: makeEncrypted({ email: "old@b.com", token: "old-token" }),
        meta: { baseUrl: "https://jira.example.com", botAccountId: "bot-1" },
      });
      mockPrisma.client.credential.update.mockImplementation(async (args: any) => ({
        id: "cred-1",
        ...args.data,
      }));

      const result = await svc.update("cred-1", {
        name: "Jira Prod Updated",
        meta: { baseUrl: "https://jira2.example.com", botAccountId: "bot-2" },
        secrets: { email: "", token: "new-token" },
      });

      expect(result).toMatchObject({ updated: true });
      const updated = mockPrisma.client.credential.update.mock.calls[0][0].data;
      expect(updated.secrets).toHaveProperty("encrypted");
      // email should be kept because blank string preserves existing
      // token should be overwritten
      const decrypted = JSON.parse(decrypt(updated.secrets.encrypted, KEY));
      expect(decrypted.email).toBe("old@b.com");
      expect(decrypted.token).toBe("new-token");
    });

    it("throws if credential not found", async () => {
      mockPrisma.client.credential.findUnique.mockResolvedValue(null);
      await expect(
        svc.update("missing", { name: "X", meta: {}, secrets: {} }),
      ).rejects.toThrow("not found");
    });
  });

  describe("remove", () => {
    it("deletes by id", async () => {
      mockPrisma.client.credential.findUnique.mockResolvedValue({ id: "cred-1" });
      mockPrisma.client.credential.delete.mockResolvedValue({ id: "cred-1" });
      const result = await svc.remove("cred-1");
      expect(result).toEqual({ deleted: true });
      expect(mockPrisma.client.credential.delete).toHaveBeenCalledWith({ where: { id: "cred-1" } });
    });
  });
});
