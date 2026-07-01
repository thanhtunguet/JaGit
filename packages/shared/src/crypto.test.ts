import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto.js";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("crypto", () => {
  it("round-trips plaintext", () => {
    const ciphertext = encrypt("super-secret", KEY);
    expect(ciphertext).not.toBe("super-secret");
    expect(decrypt(ciphertext, KEY)).toBe("super-secret");
  });

  it("uses a unique IV each call (ciphertexts differ)", () => {
    const a = encrypt("x", KEY);
    const b = encrypt("x", KEY);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const c = encrypt("data", KEY);
    const [iv, tag, enc] = c.split(".");
    expect(() => decrypt([iv, tag, enc + "XX"].join("."), KEY)).toThrow();
  });
});
