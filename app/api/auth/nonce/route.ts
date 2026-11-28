import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";
import { createWalletNonce, nonceCookieOptions, walletSignInMessage } from "@/lib/wallet-auth";
import { getSafeOrigin } from "@/lib/site-url";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 2_048)) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  if (isRateLimited(request.headers, "wallet-nonce", 10, 60_000)) return NextResponse.json({ error: "Too many sign-in attempts. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { address?: unknown };
  if (typeof body.address !== "string") return NextResponse.json({ error: "A wallet address is required." }, { status: 400 });
  try { new PublicKey(body.address); } catch { return NextResponse.json({ error: "Invalid Solana wallet address." }, { status: 400 }); }
  try {
    const { nonce, cookie } = createWalletNonce(body.address);
    const message = walletSignInMessage(body.address, nonce, getSafeOrigin(request.url));
    const response = NextResponse.json({ message });
    response.cookies.set("solgain_wallet_nonce", cookie, nonceCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "Wallet sign-in is not configured." }, { status: 503 });
  }
}
