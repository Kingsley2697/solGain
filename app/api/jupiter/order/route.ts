import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const requiredParams = ["inputMint", "outputMint", "amount", "taker"];

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "jupiter-order", 20, 60_000)) return NextResponse.json({ error: "Too many quote requests. Please wait a minute." }, { status: 429 });
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Add JUPITER_API_KEY to enable swaps." }, { status: 503 });

  const params = request.nextUrl.searchParams;
  if (requiredParams.some(param => !params.get(param))) return NextResponse.json({ error: "Incomplete swap request." }, { status: 400 });
  const inputMint = params.get("inputMint")!;
  const outputMint = params.get("outputMint")!;
  const taker = params.get("taker")!;
  const amount = params.get("amount")!;
  const slippageBps = Number(params.get("slippageBps") ?? "100");
  try { new PublicKey(inputMint); new PublicKey(outputMint); new PublicKey(taker); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  if (!/^\d{1,20}$/.test(amount) || BigInt(amount) <= BigInt(0)) return NextResponse.json({ error: "Invalid swap amount." }, { status: 400 });
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 5_000) return NextResponse.json({ error: "Slippage must be between 0.01% and 50%." }, { status: 400 });
  const upstreamParams = new URLSearchParams({ inputMint, outputMint, amount, taker, slippageBps: String(slippageBps) });

  try {
    const upstream = await fetch(`${JUPITER_ORDER_URL}?${upstreamParams}`, {
      headers: { "x-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Swap quoting is temporarily unavailable." }, { status: 502 });
  }
}
