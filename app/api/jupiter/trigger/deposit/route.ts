import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";

const base = "https://api.jup.ag/trigger/v2";

function headers(request: NextRequest) {
  const apiKey = process.env.JUPITER_API_KEY;
  const token = request.cookies.get("solgain_jupiter_trigger")?.value;
  if (!apiKey) throw new Error("Jupiter Trigger is not configured.");
  if (!token) throw new Error("Authenticate your wallet before creating a strategy.");
  return { "Content-Type": "application/json", "x-api-key": apiKey, Authorization: `Bearer ${token}` };
}

async function call(path: string, request: NextRequest, body?: Record<string, unknown>) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: headers(request), body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, payload };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 6_000) || isRateLimited(request.headers, "jupiter-trigger-deposit", 8, 60_000)) return NextResponse.json({ error: "Too many strategy requests. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null) as { inputMint?: unknown; outputMint?: unknown; userAddress?: unknown; amount?: unknown; orderType?: unknown } | null;
  if (!body || typeof body.inputMint !== "string" || typeof body.outputMint !== "string" || typeof body.userAddress !== "string" || typeof body.amount !== "string" || (body.orderType !== "single" && body.orderType !== "dca") || !/^\d{1,20}$/.test(body.amount) || BigInt(body.amount) <= BigInt(0)) return NextResponse.json({ error: "Invalid strategy deposit." }, { status: 400 });
  try { new PublicKey(body.inputMint); new PublicKey(body.outputMint); new PublicKey(body.userAddress); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  if (body.inputMint === body.outputMint) return NextResponse.json({ error: "Select two different tokens." }, { status: 400 });
  try {
    let vault = await call("/vault", request);
    if (!vault.response.ok) vault = await call("/vault/register", request, {});
    if (!vault.response.ok) return NextResponse.json({ error: typeof vault.payload.error === "string" ? vault.payload.error : "Jupiter could not prepare a vault." }, { status: vault.response.status });
    const crafted = await call("/deposit/craft", request, { inputMint: body.inputMint, outputMint: body.outputMint, userAddress: body.userAddress, amount: body.amount, orderType: body.orderType });
    return NextResponse.json(crafted.payload, { status: crafted.response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jupiter Trigger is unavailable." }, { status: 502 });
  }
}
