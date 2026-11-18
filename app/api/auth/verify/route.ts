import { createPublicKey, verify } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";
import { createWalletSession, NONCE_COOKIE, readWalletNonce, SESSION_COOKIE, sessionCookieOptions, walletSignInMessage } from "@/lib/wallet-auth";

export const runtime = "nodejs";
const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

function verifyWalletSignature(address: string, message: string, signature: string) {
  const publicKey = new PublicKey(address).toBytes();
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length !== 64) return false;
  const key = createPublicKey({ key: Buffer.concat([ed25519SpkiPrefix, Buffer.from(publicKey)]), format: "der", type: "spki" });
  return verify(null, Buffer.from(message, "utf8"), key, signatureBytes);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 12_288)) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  if (isRateLimited(request.headers, "wallet-verify", 10, 60_000)) return NextResponse.json({ error: "Too many sign-in attempts. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { address?: unknown; message?: unknown; signature?: unknown };
  if (typeof body.address !== "string" || typeof body.message !== "string" || typeof body.signature !== "string") return NextResponse.json({ error: "Incomplete wallet signature." }, { status: 400 });
  const nonce = readWalletNonce(request.cookies.get(NONCE_COOKIE)?.value);
  if (!nonce || nonce.address !== body.address) return NextResponse.json({ error: "Sign-in request expired. Please try again." }, { status: 401 });
  const expectedMessage = walletSignInMessage(body.address, nonce.nonce, new URL(request.url).origin);
  if (body.message !== expectedMessage) return NextResponse.json({ error: "Invalid sign-in message." }, { status: 401 });
  try {
    if (!verifyWalletSignature(body.address, body.message, body.signature)) return NextResponse.json({ error: "Wallet signature was not valid." }, { status: 401 });
    const response = NextResponse.json({ walletAddress: body.address });
    response.cookies.set(SESSION_COOKIE, createWalletSession(body.address), sessionCookieOptions);
    response.cookies.set(NONCE_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: "Wallet signature was not valid." }, { status: 401 });
  }
}
