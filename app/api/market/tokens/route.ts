import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

const url = "https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=30";
let cached: { payload: unknown; cachedAt: number } | null = null;
const freshCacheMs = 5_000;
const staleCacheMs = 60_000;

function json(payload: unknown, status = 200, cache = "MISS") {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Market-Cache": cache } });
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "market-tokens", 60, 60_000)) return NextResponse.json({ error: "Too many market requests." }, { status: 429 });
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Market data is not configured." }, { status: 503 });
  if (cached && Date.now() - cached.cachedAt < freshCacheMs) return json(cached.payload, 200, "HIT");
  try {
    const response = await fetch(url, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const payload = await response.json();
    if (!response.ok) throw new Error("Market provider request failed");
    cached = { payload, cachedAt: Date.now() };
    return json(payload);
  } catch {
    if (cached && Date.now() - cached.cachedAt < staleCacheMs) return json(cached.payload, 200, "STALE");
    return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
  }
}
