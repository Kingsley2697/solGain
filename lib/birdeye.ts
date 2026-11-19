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

type ApiResponse = { success?: boolean; data?: { tokens?: ApiToken[] } };
type OverviewResponse = { success?: boolean; data?: ApiToken & { liquidity?: number; mc?: number } };
type CachedValue<T> = { value: T; savedAt: number };
const colors = ["#86a9d8", "#e1a56f", "#9b8acb", "#76b7a5", "#c78091", "#a5a663"];
const marketCacheKey = "solgain:market-cache:v1";
const tokenCachePrefix = "solgain:token-cache:v1:";
const browserCacheMs = 10 * 60_000;
const tokenRequests = new Map<string, Promise<MarketToken | null>>();

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

export async function fetchBirdeyeTokens(): Promise<MarketToken[]> {
  const response = await fetch("/api/market/tokens", { cache: "no-store" });
  if (!response.ok) throw new Error(`Birdeye request failed (${response.status})`);
  const payload = (await response.json()) as ApiResponse;
  if (!payload.success) throw new Error("Birdeye rejected the market request.");
  const tokens = (payload.data?.tokens ?? []).flatMap((token, index) => {
    const mapped = mapToken({ ...token, priceChange1hPercent: undefined }, index);
    return mapped ? [mapped] : [];
  });
  writeCache(marketCacheKey, tokens);
  return tokens;
}

export async function fetchBirdeyeToken(address: string): Promise<MarketToken | null> {
  const response = await fetch(`/api/market/token/${encodeURIComponent(address)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Birdeye request failed (${response.status})`);
  const payload = (await response.json()) as OverviewResponse;
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
