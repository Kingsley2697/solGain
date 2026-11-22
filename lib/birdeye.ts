import type { MarketToken } from "@/lib/market";

type ApiToken = {
  address?: string;
  name?: string;
  symbol?: string;
  price?: number;
  priceChange1hPercent?: number;
  priceChange24hPercent?: number;
  v24hChangePercent?: number;
  v24hUSD?: number;
  mc?: number;
  marketCap?: number;
  fdv?: number;
  fullyDilutedValuation?: number;
  circulatingSupply?: number;
  circulating_supply?: number;
  supply?: number;
  totalSupply?: number;
  total_supply?: number;
  holder?: number;
  holderCount?: number;
  holder_count?: number;
  holders?: number;
  liquidity?: number;
  verified?: boolean;
  isVerified?: boolean;
  creationTime?: number | string;
  createdAt?: number | string;
  logoURI?: string;
};

type ApiResponse = { success?: boolean; data?: { tokens?: ApiToken[] }; fallback?: boolean; source?: string };
type OverviewResponse = { success?: boolean; data?: ApiToken & { liquidity?: number; mc?: number } };
export type BirdeyeSearchToken = { address: string; name: string; symbol: string; logoURI?: string };
export type BirdeyeDiscovery = { tokens: MarketToken[]; fallback: boolean; source: string };
type SearchResponse = { items?: BirdeyeSearchToken[]; error?: string };
type CachedValue<T> = { value: T; savedAt: number };
const colors = ["#86a9d8", "#e1a56f", "#9b8acb", "#76b7a5", "#c78091", "#a5a663"];
const marketCacheKey = "solgain:market-cache:v3";
const tokenCachePrefix = "solgain:token-cache:v2:";
const browserCacheMs = 10 * 60_000;
const tokenRequests = new Map<string, Promise<MarketToken | null>>();
const requestTimeoutMs = 10_000;

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try { return await fetch(url, { cache: "no-store", signal: controller.signal }); }
  catch (error) { throw new Error(error instanceof DOMException && error.name === "AbortError" ? "The live data request timed out. Please retry." : "The live data request failed. Please retry."); }
  finally { window.clearTimeout(timeout); }
}

async function responsePayload(response: Response) {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : `Birdeye request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function timestampOrUndefined(value: unknown) {
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function verifiedOrUndefined(token: ApiToken) {
  return typeof token.verified === "boolean" ? token.verified : typeof token.isVerified === "boolean" ? token.isVerified : undefined;
}

function readCache<T>(key: string): CachedValue<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) ?? "null") as CachedValue<T> | null;
    return cached && Date.now() - cached.savedAt < browserCacheMs ? cached : null;
  } catch { return null; }
}

function writeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() } satisfies CachedValue<T>)); } catch { /* Storage is an optional speed-up. */ }
}

function mapToken(token: ApiToken, index = 0): MarketToken | null {
  if (!token.address || !token.name || !token.symbol) return null;
  return {
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    price: Number(token.price) || 0,
    change: Number(token.priceChange1hPercent ?? token.v24hChangePercent ?? token.priceChange24hPercent) || 0,
    changeWindow: token.priceChange1hPercent === undefined ? "24h" : "1h",
    volume24h: Number(token.v24hUSD) || 0,
    marketCap: Number(token.mc ?? token.marketCap) || 0,
    fdv: numberOrUndefined(token.fdv ?? token.fullyDilutedValuation),
    circulatingSupply: numberOrUndefined(token.circulatingSupply ?? token.circulating_supply ?? token.supply),
    totalSupply: numberOrUndefined(token.totalSupply ?? token.total_supply),
    holders: numberOrUndefined(token.holder ?? token.holderCount ?? token.holder_count ?? token.holders),
    liquidity: numberOrUndefined(token.liquidity),
    verified: verifiedOrUndefined(token),
    createdAt: timestampOrUndefined(token.creationTime ?? token.createdAt),
    logoURI: token.logoURI,
    color: colors[index % colors.length],
  };
}

export function readCachedBirdeyeTokens() { return readCache<MarketToken[]>(marketCacheKey); }
export function readCachedBirdeyeToken(address: string) { return readCache<MarketToken>(tokenCachePrefix + address); }

export async function fetchBirdeyeTokens({ offset = 0, limit = 50 }: { offset?: number; limit?: number } = {}): Promise<MarketToken[]> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const response = await fetchJson(`/api/market/tokens?${params}`);
  const payload = await responsePayload(response) as ApiResponse;
  if (!payload.success) throw new Error("Birdeye rejected the market request.");
  const tokens = (payload.data?.tokens ?? []).flatMap((token, index) => {
    const mapped = mapToken({ ...token, priceChange1hPercent: undefined }, index);
    return mapped ? [mapped] : [];
  });
  if (offset === 0) writeCache(marketCacheKey, tokens);
  return tokens;
}

export async function fetchBirdeyeToken(address: string): Promise<MarketToken | null> {
  const response = await fetchJson(`/api/market/token/${encodeURIComponent(address)}`);
  const payload = await responsePayload(response) as OverviewResponse;
  if (!payload.success) throw new Error("Birdeye rejected the token request.");
  const token = payload.data;
  const mapped = token ? mapToken(token) : null;
  if (mapped) writeCache(tokenCachePrefix + address, mapped);
  return mapped;
}

export function prefetchBirdeyeToken(address: string) {
  const existing = tokenRequests.get(address);
  if (existing) return existing;
  const request = fetchBirdeyeToken(address).catch(() => null).finally(() => tokenRequests.delete(address));
  tokenRequests.set(address, request);
  return request;
}

export async function searchBirdeyeTokens(query: string): Promise<BirdeyeSearchToken[]> {
  const response = await fetchJson(`/api/market/search?q=${encodeURIComponent(query)}`);
  const payload = await responsePayload(response) as SearchResponse;
  return payload.items ?? [];
}

export async function fetchBirdeyeDiscovery(feed: "launches" | "memecoins"): Promise<BirdeyeDiscovery> {
  const response = await fetchJson(`/api/market/discovery?feed=${feed}`);
  const payload = await responsePayload(response) as ApiResponse;
  if (!payload.success) throw new Error("Birdeye rejected the discovery request.");
  const tokens = (payload.data?.tokens ?? []).flatMap((token, index) => {
    const mapped = mapToken(token, index);
    return mapped ? [mapped] : [];
  });
  return { tokens, fallback: payload.fallback === true, source: payload.source ?? "Birdeye live feed" };
}
