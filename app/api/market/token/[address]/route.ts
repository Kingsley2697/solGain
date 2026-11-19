import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

type CachedToken = { payload: unknown; cachedAt: number };
const tokenCache = new Map<string, CachedToken>();
const freshCacheMs = 5_000;
const staleCacheMs = 60_000;

function json(payload: unknown, status = 200, cache = "MISS") {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Token-Cache": cache } });
}

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
  const cached = tokenCache.get(address);
  if (cached && Date.now() - cached.cachedAt < freshCacheMs) return json(cached.payload, 200, "HIT");
  try {
    const response = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${encodeURIComponent(address)}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const payload = await response.json();
    if (!response.ok) throw new Error("Token provider request failed");
    tokenCache.set(address, { payload, cachedAt: Date.now() });
    return json(payload);
  } catch {
    if (cached && Date.now() - cached.cachedAt < staleCacheMs) return json(cached.payload, 200, "STALE");
    return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
  }
}
