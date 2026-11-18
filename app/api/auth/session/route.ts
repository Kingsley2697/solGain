import { NextRequest, NextResponse } from "next/server";
import { readWalletSession, SESSION_COOKIE } from "@/lib/wallet-auth";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  try {
    const session = readWalletSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    return NextResponse.json({ walletAddress: session.address }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Wallet sign-in is not configured." }, { status: 503 });
  }
}
