import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function key() {
  const encoded = process.env.ALERT_ENCRYPTION_KEY;
  if (!encoded) throw new Error("ALERT_ENCRYPTION_KEY is not configured.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== 32) throw new Error("ALERT_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return bytes;
}

export function encryptAlertDestination(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptAlertDestination<T>(value: string | null): T | null {
  if (!value) return null;
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 29) return null;
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as T;
}
