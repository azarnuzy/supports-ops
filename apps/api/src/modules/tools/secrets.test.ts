import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToolSecret, encryptToolSecret } from "./secrets";

describe("Tool secrets", () => {
  it("encrypts authenticated ciphertext that can be decrypted with only the master key", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptToolSecret("Bearer secret", key);

    expect(encrypted).not.toContain("Bearer secret");
    expect(decryptToolSecret(encrypted, key)).toBe("Bearer secret");
    expect(() => decryptToolSecret(encrypted, randomBytes(32).toString("base64"))).toThrow();
  });
});
