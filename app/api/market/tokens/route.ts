import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";
import { birdeyeQuotaError, markBirdeyeQuota } from "@/lib/birdeye-server";
import { geckoTrending } from "@/lib/market-providers";

type CachedList = { payload: unknown; cachedAt: number };
const cached = new Map<string, CachedList>();
const freshCacheMs = 60_000;
const staleCacheMs = 10 * 60_000;

function json(payload: unknown, status = 200, cache = "MISS") {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Market-Cache": cache } });
}

async function birdeyeList(offset: number, limit: number, apiKey: string) {
  const query = new URLSearchParams({ sort_by: "v24hUSD", sort_type: "desc", offset: String(offset), limit: String(limit) });
  const response = await fetch(`https://public-api.birdeye.so/defi/tokenlist?${query}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(markBirdeyeQuota(payload, response.status) || `Birdeye ${response.status}`);
  return payload;
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  if (!Number.isInteger(offset) || offset < 0 || offset > 5_000 || !Number.isInteger(limit) || limit < 1 || limit > 50) return NextResponse.json({ error: "Invalid pagination." }, { status: 400 });
  const cacheKey = `${offset}:${limit}`;
  const previous = cached.get(cacheKey);
  if (previous && Date.now() - previous.cachedAt < freshCacheMs) return json(previous.payload, 200, "HIT");
  if (isRateLimited(request.headers, "market-tokens", 60, 60_000)) return NextResponse.json({ error: "Too many market requests." }, { status: 429 });

  const apiKey = process.env.BIRDEYE_API_KEY;
  try {
    const payload = apiKey && !birdeyeQuotaError() ? await birdeyeList(offset, limit, apiKey) : null;
    if (payload) {
      cached.set(cacheKey, { payload, cachedAt: Date.now() });
      return json(payload);
    }
  } catch { /* The public provider is the intended failover for any Birdeye outage. */ }

  try {
    const page = Math.floor(offset / 20) + 1;
    const tokens = (await geckoTrending(page)).slice(0, limit);
    const payload = { success: true, data: { tokens }, fallback: true, source: "GeckoTerminal trending pools" };
    cached.set(cacheKey, { payload, cachedAt: Date.now() });
    return json(payload);
  } catch {
    if (previous && Date.now() - previous.cachedAt < staleCacheMs) return json(previous.payload, 200, "STALE");
    return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
  }
}
