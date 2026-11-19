import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";
import { birdeyeQuotaError, markBirdeyeQuota } from "@/lib/birdeye-server";
import { dexToken } from "@/lib/market-providers";

type CachedToken = { payload: unknown; cachedAt: number };
const tokenCache = new Map<string, CachedToken>();
const freshCacheMs = 60_000;
const staleCacheMs = 10 * 60_000;

function json(payload: unknown, status = 200, cache = "MISS") {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Token-Cache": cache } });
}

async function birdeyeToken(address: string, apiKey: string) {
  const response = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${encodeURIComponent(address)}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(markBirdeyeQuota(payload, response.status) || `Birdeye ${response.status}`);
  return payload;
}

export async function GET(request: NextRequest, { params }: { params: { address: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let address: string;
  try { address = new PublicKey(params.address).toBase58(); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  const cached = tokenCache.get(address);
  if (cached && Date.now() - cached.cachedAt < freshCacheMs) return json(cached.payload, 200, "HIT");
  if (isRateLimited(request.headers, "market-token", 240, 60_000)) return NextResponse.json({ error: "Too many market requests." }, { status: 429 });

  const apiKey = process.env.BIRDEYE_API_KEY;
  try {
    const payload = apiKey && !birdeyeQuotaError() ? await birdeyeToken(address, apiKey) : null;
    if (payload) {
      tokenCache.set(address, { payload, cachedAt: Date.now() });
      return json(payload);
    }
  } catch { /* Continue with the public DexScreener provider. */ }

  try {
    const payload = await dexToken(address);
    tokenCache.set(address, { payload, cachedAt: Date.now() });
    return json(payload);
  } catch {
    if (cached && Date.now() - cached.cachedAt < staleCacheMs) return json(cached.payload, 200, "STALE");
    return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
  }
}
