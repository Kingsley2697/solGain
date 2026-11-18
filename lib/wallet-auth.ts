import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "solgain_wallet_session";
export const NONCE_COOKIE = "solgain_wallet_nonce";
const MAX_SESSION_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_NONCE_AGE_SECONDS = 5 * 60;

type SignedPayload = { address: string; expiresAt: number; nonce?: string };

function secret() {
  const value = process.env.WALLET_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("WALLET_AUTH_SECRET is not configured.");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(payload: SignedPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decode(value: string | undefined): SignedPayload | null {
  if (!value) return null;
  const [encoded, signature, ...extra] = value.split(".");
  if (!encoded || !signature || extra.length) return null;
  const expected = sign(encoded);
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignedPayload;
    return typeof payload.address === "string" && Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now() ? payload : null;
  } catch { return null; }
}

export function createWalletNonce(address: string) {
  const nonce = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + MAX_NONCE_AGE_SECONDS * 1_000;
  return { nonce, cookie: encode({ address, nonce, expiresAt }), expiresAt };
}

export function readWalletNonce(value: string | undefined): (SignedPayload & { nonce: string }) | null {
  const payload = decode(value);
  return payload?.nonce ? { ...payload, nonce: payload.nonce } : null;
}

export function createWalletSession(address: string) {
  return encode({ address, expiresAt: Date.now() + MAX_SESSION_AGE_SECONDS * 1_000 });
}

export function readWalletSession(value: string | undefined) {
  const payload = decode(value);
  return payload && !payload.nonce ? payload : null;
}

export function walletSignInMessage(address: string, nonce: string, origin: string) {
  return [
    "Sign in to SolGain",
    "",
    "This signature verifies wallet ownership and never submits a transaction.",
    `Wallet: ${address}`,
    `Domain: ${origin}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_SESSION_AGE_SECONDS,
};

export const nonceCookieOptions = { ...sessionCookieOptions, maxAge: MAX_NONCE_AGE_SECONDS };
