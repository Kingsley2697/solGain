import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

type CachedList = { payload: unknown; cachedAt: number };
const cached = new Map<string, CachedList>();
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
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  if (!Number.isInteger(offset) || offset < 0 || offset > 5_000 || !Number.isInteger(limit) || limit < 1 || limit > 50) return NextResponse.json({ error: "Invalid pagination." }, { status: 400 });
  const cacheKey = `${offset}:${limit}`;
  const previous = cached.get(cacheKey);
  if (previous && Date.now() - previous.cachedAt < freshCacheMs) return json(previous.payload, 200, "HIT");
  const query = new URLSearchParams({ sort_by: "v24hUSD", sort_type: "desc", offset: String(offset), limit: String(limit) });
  try {
    const response = await fetch(`https://public-api.birdeye.so/defi/tokenlist?${query}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const payload = await response.json();
    if (!response.ok) throw new Error("Market provider request failed");
    cached.set(cacheKey, { payload, cachedAt: Date.now() });
    return json(payload);
  } catch {
    if (previous && Date.now() - previous.cachedAt < staleCacheMs) return json(previous.payload, 200, "STALE");
    return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
  }
}
