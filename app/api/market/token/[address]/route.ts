import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

export async function GET(request: NextRequest, { params }: { params: { address: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  // A full watchlist refresh requests one verified overview per token. This
  // leaves room for a 30-token watchlist to refresh every ten seconds while
  // retaining a per-client abuse backstop.
  if (isRateLimited(request.headers, "market-token", 240, 60_000)) return NextResponse.json({ error: "Too many market requests." }, { status: 429 });
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Market data is not configured." }, { status: 503 });
  let address: string;
  try { address = new PublicKey(params.address).toBase58(); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  try {
    const response = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${encodeURIComponent(address)}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch { return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 }); }
}
