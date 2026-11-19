import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";
import { birdeyeQuotaError, markBirdeyeQuota } from "@/lib/birdeye-server";
import { dexToken, geckoTrending } from "@/lib/market-providers";

type Feed = "launches" | "memecoins";
type Token = Record<string, unknown>;
type Payload = { success: true; data: { tokens: Token[] }; fallback: boolean; source: string };
type CacheEntry = { payload: Payload; cachedAt: number };
const cache = new Map<Feed, CacheEntry>();
const freshCacheMs = 60_000;
const staleCacheMs = 10 * 60_000;
const launchOverviewCacheMs = 5 * 60_000;
const launchLookupConcurrency = 6;
const stableSymbols = new Set(["SOL", "WSOL", "USDC", "USDT", "USDS", "USDH", "PYUSD", "EURC"]);
const launchOverviewCache = new Map<string, { token: Token | null; expiresAt: number }>();

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

function firstString(item: Token, names: string[]) {
  return names.map(name => item[name]).find((value): value is string => typeof value === "string" && value.length > 0);
}

function firstNumber(item: Token, names: string[]) {
  return names.map(name => Number(item[name])).find(value => Number.isFinite(value));
}

function normalize(items: Token[]) {
  const seen = new Set<string>();
  return items.flatMap(item => {
    const address = firstString(item, ["address", "token_address", "tokenAddress"]);
    const name = firstString(item, ["name", "token_name"]);
    const symbol = firstString(item, ["symbol", "token_symbol"]);
    if (!address || !name || !symbol || seen.has(address)) return [];
    seen.add(address);
    const token: Token = { address, name, symbol };
    const fields: Record<string, string[]> = {
      price: ["price", "price_usd"], priceChange24hPercent: ["priceChange24hPercent", "price_change_24h_percent", "price_change_24h"],
      v24hUSD: ["v24hUSD", "volume_24h_usd", "volume24hUSD", "volume_24h"], mc: ["mc", "market_cap", "marketCap", "marketcap"],
      liquidity: ["liquidity", "liquidity_usd"], creationTime: ["creationTime", "creation_time", "listing_time", "block_unix_time"],
    };
    for (const [key, names] of Object.entries(fields)) { const value = firstNumber(item, names); if (value !== undefined) token[key] = value; }
    const logoURI = firstString(item, ["logoURI", "logo_uri", "logo"]); if (logoURI) token.logoURI = logoURI;
    return [token];
  });
}

function filter(feed: Feed, tokens: Token[]) {
  return feed === "launches" ? tokens : tokens.filter(token => !stableSymbols.has(String(token.symbol ?? "").toUpperCase()));
}

function livePrice(token: Token) {
  return Number.isFinite(Number(token.price)) && Number(token.price) > 0;
}

async function enrichLaunch(listing: Token): Promise<Token | null> {
  if (livePrice(listing)) return listing;
  const address = String(listing.address ?? "");
  const cached = launchOverviewCache.get(address);
  if (cached && cached.expiresAt > Date.now()) return cached.token ? { ...listing, ...cached.token, creationTime: listing.creationTime ?? cached.token.creationTime } : null;
  try {
    // The new-listing endpoint is an identity feed and commonly omits market
    // fields. DexScreener fills those fields without spending Birdeye units.
    const overview = (await dexToken(address)).data as Token;
    const token = livePrice(overview) ? overview : null;
    launchOverviewCache.set(address, { token, expiresAt: Date.now() + launchOverviewCacheMs });
    return token ? { ...listing, ...token, creationTime: listing.creationTime ?? token.creationTime } : null;
  } catch {
    launchOverviewCache.set(address, { token: null, expiresAt: Date.now() + 60_000 });
    return null;
  }
}

async function hydrateLaunches(listings: Token[]) {
  const candidates = listings.slice(0, 50);
  const hydrated: Token[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length && hydrated.length < 20) {
      const listing = candidates[cursor++];
      const token = await enrichLaunch(listing);
      if (token) hydrated.push(token);
    }
  }
  await Promise.all(Array.from({ length: launchLookupConcurrency }, () => worker()));
  return hydrated.slice(0, 20);
}

async function birdeye(url: string, apiKey: string) {
  const response = await fetch(url, { headers: { Accept: "application/json", "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(markBirdeyeQuota(payload, response.status) || `Birdeye ${response.status}`);
  return payload;
}

async function primary(feed: Feed, apiKey: string) {
  const url = feed === "launches"
    ? "https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=50&meme_platform_enabled=true"
    : "https://public-api.birdeye.so/defi/v3/token/list?sort_by=volume_24h_usd&sort_type=desc&limit=50";
  const tokens = filter(feed, normalize(payloadItems(await birdeye(url, apiKey))));
  return feed === "launches" ? hydrateLaunches(tokens) : tokens;
}

function json(payload: Payload, cacheStatus: "MISS" | "HIT" | "STALE") {
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0", "X-Discovery-Cache": cacheStatus } });
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const feed = request.nextUrl.searchParams.get("feed");
  if (feed !== "launches" && feed !== "memecoins") return NextResponse.json({ error: "Invalid discovery feed." }, { status: 400 });
  const previous = cache.get(feed);
  if (previous && Date.now() - previous.cachedAt < freshCacheMs) return json(previous.payload, "HIT");
  if (isRateLimited(request.headers, "market-discovery", 20, 60_000)) return NextResponse.json({ error: "Too many discovery requests." }, { status: 429 });

  const apiKey = process.env.BIRDEYE_API_KEY;
  try {
    const tokens = apiKey && !birdeyeQuotaError() ? await primary(feed, apiKey) : null;
    if (tokens) {
      const payload: Payload = { success: true, data: { tokens }, fallback: false, source: feed === "launches" ? "Birdeye new listings" : "Birdeye platform feeds" };
      cache.set(feed, { payload, cachedAt: Date.now() });
      return json(payload, "MISS");
    }
  } catch { /* GeckoTerminal provides a public trending feed when Birdeye fails. */ }

  try {
    const tokens = filter(feed, await geckoTrending());
    const payload: Payload = { success: true, data: { tokens }, fallback: true, source: "GeckoTerminal trending pools" };
    cache.set(feed, { payload, cachedAt: Date.now() });
    return json(payload, "MISS");
  } catch {
    if (previous && Date.now() - previous.cachedAt < staleCacheMs) return json(previous.payload, "STALE");
    return NextResponse.json({ error: "Live discovery data is temporarily unavailable." }, { status: 502 });
  }
}
