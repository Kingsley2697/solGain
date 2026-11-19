import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";

const base = "https://api.jup.ag/trigger/v2/orders";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 30_000) || isRateLimited(request.headers, "jupiter-trigger-order", 6, 60_000)) return NextResponse.json({ error: "Too many strategy submissions. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.kind !== "single" && body.kind !== "dca") || typeof body.userPubkey !== "string" || typeof body.inputMint !== "string" || typeof body.outputMint !== "string" || typeof body.inputAmount !== "string" || typeof body.depositRequestId !== "string" || typeof body.depositSignedTx !== "string" || !/^\d{1,20}$/.test(body.inputAmount) || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.depositSignedTx) || body.depositSignedTx.length > 20_000) return NextResponse.json({ error: "Invalid strategy order." }, { status: 400 });
  try { new PublicKey(body.userPubkey); new PublicKey(body.inputMint); new PublicKey(body.outputMint); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  const apiKey = process.env.JUPITER_API_KEY;
  const token = request.cookies.get("solgain_jupiter_trigger")?.value;
  if (!apiKey) return NextResponse.json({ error: "Jupiter Trigger is not configured." }, { status: 503 });
  if (!token) return NextResponse.json({ error: "Your Jupiter strategy session expired. Authenticate again." }, { status: 401 });
  const { kind, ...order } = body;
  try {
    const upstream = await fetch(`${base}/${kind === "single" ? "price" : "dca"}`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, Authorization: `Bearer ${token}` }, body: JSON.stringify(order), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Jupiter could not create this strategy. Your signed deposit was not submitted." }, { status: 502 });
  }
}
