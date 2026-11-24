import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";
import { dexTokenCommunity } from "@/lib/market-providers";

type CachedCommunity = { payload: unknown; cachedAt: number };
const cache = new Map<string, CachedCommunity>();
const freshCacheMs = 60_000;
const staleCacheMs = 10 * 60_000;

export async function GET(request: NextRequest, { params }: { params: { address: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let address: string;
  try { address = new PublicKey(params.address).toBase58(); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  const previous = cache.get(address);
  if (previous && Date.now() - previous.cachedAt < freshCacheMs) return NextResponse.json(previous.payload, { headers: { "Cache-Control": "no-store, max-age=0", "X-Community-Cache": "HIT" } });
  if (isRateLimited(request.headers, "market-community", 60, 60_000)) return NextResponse.json({ error: "Too many community requests." }, { status: 429 });
  try {
    const community = await dexTokenCommunity(address);
    const payload = { community, fetchedAt: Date.now() };
    cache.set(address, { payload, cachedAt: Date.now() });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0", "X-Community-Cache": "MISS" } });
  } catch {
    if (previous && Date.now() - previous.cachedAt < staleCacheMs) return NextResponse.json(previous.payload, { headers: { "Cache-Control": "no-store, max-age=0", "X-Community-Cache": "STALE" } });
    return NextResponse.json({ error: "Community data is temporarily unavailable." }, { status: 502 });
  }
}
