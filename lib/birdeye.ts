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
  liquidity?: number;
  verified?: boolean;
  isVerified?: boolean;
  creationTime?: number | string;
  createdAt?: number | string;
  logoURI?: string;
};

type ApiResponse = { success?: boolean; data?: { tokens?: ApiToken[] } };
type OverviewResponse = { success?: boolean; data?: ApiToken & { liquidity?: number; mc?: number } };
const colors = ["#86a9d8", "#e1a56f", "#9b8acb", "#76b7a5", "#c78091", "#a5a663"];

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

export async function fetchBirdeyeTokens(): Promise<MarketToken[]> {
  const response = await fetch("/api/market/tokens", { cache: "no-store" });
  if (!response.ok) throw new Error(`Birdeye request failed (${response.status})`);
  const payload = (await response.json()) as ApiResponse;
  if (!payload.success) throw new Error("Birdeye rejected the market request.");
  return (payload.data?.tokens ?? [])
    .filter((token): token is ApiToken & { address: string; name: string; symbol: string } => Boolean(token.address && token.name && token.symbol))
    .map((token, index) => ({
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      price: Number(token.price) || 0,
      change: Number(token.v24hChangePercent) || 0,
      changeWindow: "24h",
      volume24h: Number(token.v24hUSD) || 0,
      marketCap: Number(token.mc ?? token.marketCap) || 0,
      holders: numberOrUndefined(token.holder),
      liquidity: numberOrUndefined(token.liquidity),
      verified: verifiedOrUndefined(token),
      createdAt: timestampOrUndefined(token.creationTime ?? token.createdAt),
      logoURI: token.logoURI,
      color: colors[index % colors.length],
    }));
}

export async function fetchBirdeyeToken(address: string): Promise<MarketToken | null> {
  const response = await fetch(`/api/market/token/${encodeURIComponent(address)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Birdeye request failed (${response.status})`);
  const payload = (await response.json()) as OverviewResponse;
  if (!payload.success) throw new Error("Birdeye rejected the token request.");
  const token = payload.data;
  if (!token?.name || !token.symbol || !token.address) return null;
  return {
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    price: Number(token.price) || 0,
    change: Number(token.priceChange1hPercent ?? token.v24hChangePercent ?? token.priceChange24hPercent) || 0,
    changeWindow: token.priceChange1hPercent === undefined ? "24h" : "1h",
    volume24h: Number(token.v24hUSD) || 0,
    marketCap: Number(token.mc ?? token.marketCap) || 0,
    holders: numberOrUndefined(token.holder),
    liquidity: numberOrUndefined(token.liquidity),
    verified: verifiedOrUndefined(token),
    createdAt: timestampOrUndefined(token.creationTime ?? token.createdAt),
    logoURI: token.logoURI,
    color: colors[0],
  };
}
