import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";
import { birdeyeQuotaError, markBirdeyeQuota } from "@/lib/birdeye-server";
import { geckoCandles } from "@/lib/market-providers";

const intervals = { "5m": 300, "15m": 900, "1h": 3600, "4h": 14_400 } as const;
type Range = keyof typeof intervals;
type CachedChart = { payload: unknown; cachedAt: number };
const chartCache = new Map<string, CachedChart>();
const freshCacheMs = 60_000;
const staleCacheMs = 10 * 60_000;

function json(payload: unknown, status = 200, cache = "MISS") {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Chart-Cache": cache } });
}

async function birdeyeChart(address: string, range: Range, apiKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const query = new URLSearchParams({ address, type: range, time_from: String(now - intervals[range] * 72), time_to: String(now) });
  const response = await fetch(`https://public-api.birdeye.so/defi/ohlcv?${query}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(markBirdeyeQuota(payload, response.status) || `Birdeye ${response.status}`);
  return payload;
}

export async function GET(request: NextRequest, { params }: { params: { address: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const range = request.nextUrl.searchParams.get("range");
  if (!range || !(range in intervals)) return NextResponse.json({ error: "Invalid chart range." }, { status: 400 });
  let address: string;
  try { address = new PublicKey(params.address).toBase58(); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  const cacheKey = `${address}:${range}`;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < freshCacheMs) return json(cached.payload, 200, "HIT");
  if (isRateLimited(request.headers, "market-chart", 60, 60_000)) return NextResponse.json({ error: "Too many chart requests." }, { status: 429 });

  const apiKey = process.env.BIRDEYE_API_KEY;
  try {
    const payload = apiKey && !birdeyeQuotaError() ? await birdeyeChart(address, range as Range, apiKey) : null;
    if (payload) {
      chartCache.set(cacheKey, { payload, cachedAt: Date.now() });
      return json(payload);
    }
  } catch { /* GeckoTerminal is the public OHLCV failover. */ }

  try {
    const payload = await geckoCandles(address, range as Range);
    chartCache.set(cacheKey, { payload, cachedAt: Date.now() });
    return json(payload);
  } catch {
    if (cached && Date.now() - cached.cachedAt < staleCacheMs) return json(cached.payload, 200, "STALE");
    return NextResponse.json({ error: "Chart data is temporarily unavailable." }, { status: 502 });
  }
}
