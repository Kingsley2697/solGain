import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";
import { birdeyeQuotaError, markBirdeyeQuota } from "@/lib/birdeye-server";
import { dexSearch } from "@/lib/market-providers";

type SearchToken = { address: string; name: string; symbol: string; logoURI?: string };
type CacheEntry = { items: SearchToken[]; cachedAt: number };
const cache = new Map<string, CacheEntry>();
const freshCacheMs = 60_000;
const staleCacheMs = 5 * 60_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown) { return Array.isArray(value) ? value : []; }

function searchTokens(payload: unknown): SearchToken[] {
  const data = record(payload)?.data;
  const roots = array(record(data)?.items ?? record(data)?.tokens ?? data);
  const candidates = roots.flatMap(root => {
    const group = record(root);
    if (!group || (typeof group.type === "string" && group.type !== "token")) return [];
    const nested = array(group.result ?? group.items ?? group.tokens ?? group.data);
    return nested.length ? nested : [group];
  });
  const seen = new Set<string>();
  return candidates.flatMap(candidate => {
    const token = record(candidate);
    const address = typeof token?.address === "string" ? token.address : typeof token?.tokenAddress === "string" ? token.tokenAddress : typeof token?.token_address === "string" ? token.token_address : "";
    const name = typeof token?.name === "string" ? token.name : "";
    const symbol = typeof token?.symbol === "string" ? token.symbol : "";
    try { new PublicKey(address); } catch { return []; }
    if (!name || !symbol || seen.has(address)) return [];
    seen.add(address);
    const logoURI = typeof token?.logoURI === "string" ? token.logoURI : typeof token?.logo_uri === "string" ? token.logo_uri : undefined;
    return [{ address, name, symbol, logoURI }];
  });
}

function json(items: SearchToken[], cacheStatus: "MISS" | "HIT" | "STALE") {
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Search-Cache": cacheStatus } });
}

async function birdeyeSearch(keyword: string, apiKey: string) {
  const query = new URLSearchParams({ keyword, chain: "solana", target: "token", search_by: "combination", search_mode: "fuzzy", sort_by: "volume_24h_usd", sort_type: "desc", offset: "0", limit: "10" });
  const response = await fetch(`https://public-api.birdeye.so/defi/v3/search?${query}`, { headers: { Accept: "application/json", "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(markBirdeyeQuota(payload, response.status) || `Birdeye ${response.status}`);
  return searchTokens(payload);
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const keyword = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (keyword.length < 2 || keyword.length > 80) return NextResponse.json({ error: "Enter 2 to 80 characters." }, { status: 400 });
  const cacheKey = keyword.toLowerCase();
  const previous = cache.get(cacheKey);
  if (previous && Date.now() - previous.cachedAt < freshCacheMs) return json(previous.items, "HIT");
  if (isRateLimited(request.headers, "market-search", 30, 60_000)) return NextResponse.json({ error: "Too many search requests." }, { status: 429 });

  const apiKey = process.env.BIRDEYE_API_KEY;
  try {
    const items = apiKey && !birdeyeQuotaError() ? await birdeyeSearch(keyword, apiKey) : null;
    if (items) { cache.set(cacheKey, { items, cachedAt: Date.now() }); return json(items, "MISS"); }
  } catch { /* Continue with DexScreener's public search endpoint. */ }

  try {
    const { items } = await dexSearch(keyword);
    cache.set(cacheKey, { items, cachedAt: Date.now() });
    return json(items, "MISS");
  } catch {
    if (previous && Date.now() - previous.cachedAt < staleCacheMs) return json(previous.items, "STALE");
    return NextResponse.json({ error: "Token search is temporarily unavailable." }, { status: 502 });
  }
}
