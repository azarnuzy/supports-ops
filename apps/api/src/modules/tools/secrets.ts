import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

export function encryptToolSecret(value: string, masterKey: string) {
  const key = decodeMasterKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToolSecret(value: string, masterKey: string) {
  const [iv, tag, encrypted, extra] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted || extra) throw new Error("Invalid encrypted Tool secret.");
  const decipher = createDecipheriv(algorithm, decodeMasterKey(masterKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function decodeMasterKey(masterKey: string) {
  const key = Buffer.from(masterKey, "base64");
  if (key.length !== 32) throw new Error("TOOL_MASTER_KEY must be a base64-encoded 32-byte key.");
  return key;
}
