import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

type SearchToken = { address: string; name: string; symbol: string; logoURI?: string };
type CacheEntry = { items: SearchToken[]; cachedAt: number };
const cache = new Map<string, CacheEntry>();
const freshCacheMs = 15_000;
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
    if (!group) return [];
    if (typeof group.type === "string" && group.type !== "token") return [];
    return array(group.result ?? group.items ?? group.tokens ?? group.data).length
      ? array(group.result ?? group.items ?? group.tokens ?? group.data)
      : [group];
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

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "market-search", 30, 60_000)) return NextResponse.json({ error: "Too many search requests." }, { status: 429 });
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Market data is not configured." }, { status: 503 });
  const keyword = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (keyword.length < 2 || keyword.length > 80) return NextResponse.json({ error: "Enter 2 to 80 characters." }, { status: 400 });
  const cacheKey = keyword.toLowerCase();
  const previous = cache.get(cacheKey);
  if (previous && Date.now() - previous.cachedAt < freshCacheMs) return json(previous.items, "HIT");
  const query = new URLSearchParams({ keyword, chain: "solana", target: "token", search_by: "combination", search_mode: "fuzzy", sort_by: "volume_24h_usd", sort_type: "desc", offset: "0", limit: "10" });
  try {
    const response = await fetch(`https://public-api.birdeye.so/defi/v3/search?${query}`, { headers: { Accept: "application/json", "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const payload = await response.json();
    if (!response.ok) throw new Error("Search provider request failed");
    const items = searchTokens(payload);
    cache.set(cacheKey, { items, cachedAt: Date.now() });
    return json(items, "MISS");
  } catch {
    if (previous && Date.now() - previous.cachedAt < staleCacheMs) return json(previous.items, "STALE");
    return NextResponse.json({ error: "Token search is temporarily unavailable." }, { status: 502 });
  }
}
