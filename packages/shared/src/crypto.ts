import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts `plain` with AES-256-GCM.
 * Output format: "<iv_b64url>.<tag_b64url>.<ciphertext_b64url>"
 * Uses base64url (no padding) so that appending characters to a segment
 * always changes the decoded bytes — enabling reliable tamper detection.
 */
export function encrypt(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

/**
 * Decrypts a payload produced by `encrypt`.
 * Throws if the key is wrong or the ciphertext was tampered with.
 */
export function decrypt(payload: string, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [iv, tag, enc] = parts.map((s) => Buffer.from(s, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
