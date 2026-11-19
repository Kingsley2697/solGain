import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

type HolderCacheEntry = { value: number; expiresAt: number };
const holderCache = new Map<string, HolderCacheEntry>();
const holderRequests = new Map<string, Promise<number | null>>();
const cacheTtlMs = 5 * 60_000;
const maxAddresses = 50;
// Holder lookups are expensive and are commonly limited to roughly one request
// per second on entry-level provider plans. Fill a small batch each refresh
// instead of firing 50 upstream requests at once and being rate-limited.
const maxUncachedPerRequest = 6;
const holderRequestSpacingMs = 1_050;

function holderCount(payload: unknown) {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  const candidates = [data?.holder, data?.total, data?.totalCount, data?.count, data?.totalItems, (data?.pagination as Record<string, unknown> | undefined)?.total];
  const value = candidates.map(Number).find(candidate => Number.isFinite(candidate) && candidate >= 0);
  return value ?? null;
}

async function fetchHolderCount(address: string, apiKey: string) {
  const existing = holderRequests.get(address);
  if (existing) return existing;
  const request = (async () => {
    try {
      const response = await fetch(`https://public-api.birdeye.so/defi/v3/token/holder?address=${encodeURIComponent(address)}&offset=0&limit=1`, {
        headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000),
      });
      const payload = await response.json().catch(() => ({}));
      const value = holderCount(payload);
      if (!response.ok || value === null) return null;
      holderCache.set(address, { value, expiresAt: Date.now() + cacheTtlMs });
      return value;
    } finally { holderRequests.delete(address); }
  })();
  holderRequests.set(address, request);
  return request;
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "market-holders", 12, 60_000)) return NextResponse.json({ error: "Too many holder requests." }, { status: 429 });
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Market data is not configured." }, { status: 503 });
  const raw = request.nextUrl.searchParams.get("addresses")?.split(",") ?? [];
  const addresses = Array.from(new Set(raw)).slice(0, maxAddresses).filter(address => { try { new PublicKey(address); return true; } catch { return false; } });
  const now = Date.now();
  const missing = addresses.filter(address => !holderCache.get(address) || holderCache.get(address)!.expiresAt <= now).slice(0, maxUncachedPerRequest);
  // Birdeye's lower plans can throttle concurrent holder lookups. Space this
  // background enrichment work rather than losing an entire batch to 429s.
  for (let index = 0; index < missing.length; index += 1) {
    await fetchHolderCount(missing[index], apiKey);
    if (index < missing.length - 1) await new Promise(resolve => setTimeout(resolve, holderRequestSpacingMs));
  }
  const holders = Object.fromEntries(addresses.flatMap(address => {
    const entry = holderCache.get(address);
    return entry && entry.expiresAt > Date.now() ? [[address, entry.value]] : [];
  }));
  return NextResponse.json({ holders, pending: addresses.filter(address => !(address in holders)).length }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
