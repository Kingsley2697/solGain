import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

type Feed = "launches" | "memecoins";
type CacheEntry = { payload: { success: true; data: { tokens: Record<string, unknown>[] }; fallback: boolean; source: string }; cachedAt: number };
const cache = new Map<Feed, CacheEntry>();
// The discovery tabs poll quickly in the visible browser. A short shared
// cache keeps simultaneous visitors fast without making launch data stale.
const freshCacheMs = 4_000;
const staleCacheMs = 5 * 60_000;
const stableSymbols = new Set(["SOL", "WSOL", "USDC", "USDT", "USDS", "USDH", "PYUSD", "EURC"]);

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function records(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).flatMap(item => { const result = object(item); return result ? [result] : []; });
}

function payloadItems(payload: unknown) {
  const data = object(payload)?.data;
  const root = object(data);
  return records(root?.items ?? root?.tokens ?? data);
}

function firstString(item: Record<string, unknown>, names: string[]) {
  return names.map(name => item[name]).find((value): value is string => typeof value === "string" && value.length > 0);
}

function firstNumber(item: Record<string, unknown>, names: string[]) {
  const value = names.map(name => Number(item[name])).find(value => Number.isFinite(value));
  return value;
}

function normalize(items: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return items.flatMap(item => {
    const address = firstString(item, ["address", "token_address", "tokenAddress"]);
    const name = firstString(item, ["name", "token_name"]);
    const symbol = firstString(item, ["symbol", "token_symbol"]);
    if (!address || !name || !symbol || seen.has(address)) return [];
    seen.add(address);
    const token: Record<string, unknown> = { address, name, symbol };
    const fields: Record<string, string[]> = {
      price: ["price", "price_usd"], priceChange24hPercent: ["priceChange24hPercent", "price_change_24h_percent", "price_change_24h"],
      v24hUSD: ["v24hUSD", "volume_24h_usd", "volume24hUSD", "volume_24h"], mc: ["mc", "market_cap", "marketCap", "marketcap"],
      holder: ["holder", "holder_count", "holders"], liquidity: ["liquidity", "liquidity_usd"], creationTime: ["creationTime", "creation_time", "listing_time", "block_unix_time"],
    };
    for (const [key, names] of Object.entries(fields)) { const value = firstNumber(item, names); if (value !== undefined) token[key] = value; }
    const logoURI = firstString(item, ["logoURI", "logo_uri", "logo"]); if (logoURI) token.logoURI = logoURI;
    const verified = item.verified ?? item.is_verified ?? item.isVerified; if (typeof verified === "boolean") token.verified = verified;
    return [token];
  });
}

function fallbackFilter(feed: Feed, tokens: Record<string, unknown>[]) {
  if (feed === "launches") return tokens;
  return tokens.filter(token => !stableSymbols.has(String(token.symbol ?? "").toUpperCase()));
}

async function request(url: string, apiKey: string) {
  const response = await fetch(url, { headers: { Accept: "application/json", "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Birdeye ${response.status}`);
  return payload;
}

async function genericFallback(apiKey: string, feed: Feed) {
  const payload = await request("https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=50", apiKey);
  return fallbackFilter(feed, normalize(payloadItems(payload)));
}

async function launches(apiKey: string) {
  const payload = await request("https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20&meme_platform_enabled=true", apiKey);
  return normalize(payloadItems(payload));
}

async function memecoins(apiKey: string) {
  // V3 provides current market fields in a single request. Filter stable and
  // wrapped assets locally so this remains usable on plans that restrict
  // multiple simultaneous creation-platform queries.
  const payload = await request(`https://public-api.birdeye.so/defi/v3/token/list?${new URLSearchParams({ sort_by: "volume_24h_usd", sort_type: "desc", limit: "50" })}`, apiKey);
  return fallbackFilter("memecoins", normalize(payloadItems(payload)));
}

function json(payload: CacheEntry["payload"], cacheStatus: "MISS" | "HIT" | "STALE") {
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0", "X-Discovery-Cache": cacheStatus } });
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "market-discovery", 20, 60_000)) return NextResponse.json({ error: "Too many discovery requests." }, { status: 429 });
  const feed = request.nextUrl.searchParams.get("feed");
  if (feed !== "launches" && feed !== "memecoins") return NextResponse.json({ error: "Invalid discovery feed." }, { status: 400 });
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Market data is not configured." }, { status: 503 });
  const previous = cache.get(feed);
  if (previous && Date.now() - previous.cachedAt < freshCacheMs) return json(previous.payload, "HIT");
  try {
    const tokens = feed === "launches" ? await launches(apiKey) : await memecoins(apiKey);
    const payload = { success: true as const, data: { tokens }, fallback: false, source: feed === "launches" ? "Birdeye new listings" : "Birdeye platform feeds" };
    cache.set(feed, { payload, cachedAt: Date.now() });
    return json(payload, "MISS");
  } catch {
    try {
      const tokens = await genericFallback(apiKey, feed);
      const payload = { success: true as const, data: { tokens }, fallback: true, source: "Birdeye market fallback" };
      cache.set(feed, { payload, cachedAt: Date.now() });
      return json(payload, "MISS");
    } catch {
      if (previous && Date.now() - previous.cachedAt < staleCacheMs) return json(previous.payload, "STALE");
      return NextResponse.json({ error: "Live discovery data is temporarily unavailable." }, { status: 502 });
    }
  }
}
