import type { MarketToken } from "@/lib/mock";

type ApiToken = {
  address?: string;
  name?: string;
  symbol?: string;
  price?: number;
  priceChange1hPercent?: number;
  v24hUSD?: number;
  mc?: number;
  holder?: number;
};

type ApiResponse = { data?: { tokens?: ApiToken[] } };
type OverviewResponse = { data?: ApiToken & { liquidity?: number; mc?: number } };
const colors = ["#86a9d8", "#e1a56f", "#9b8acb", "#76b7a5", "#c78091", "#a5a663"];

export async function fetchBirdeyeTokens(): Promise<MarketToken[]> {
  const apiKey = process.env.NEXT_PUBLIC_BIRDEYE_API_KEY;
  if (!apiKey) return [];
  const params = new URLSearchParams({ sort_by: "v24hUSD", sort_type: "desc", offset: "0", limit: "30" });
  const response = await fetch(`https://public-api.birdeye.so/defi/tokenlist?${params}`, {
    headers: { "X-API-KEY": apiKey, "x-chain": "solana" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Birdeye request failed (${response.status})`);
  const payload = (await response.json()) as ApiResponse;
  return (payload.data?.tokens ?? [])
    .filter((token): token is ApiToken & { address: string; name: string; symbol: string } => Boolean(token.address && token.name && token.symbol))
    .map((token, index) => ({
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      price: Number(token.price) || 0,
      change1h: Number(token.priceChange1hPercent) || 0,
      volume24h: Number(token.v24hUSD) || 0,
      marketCap: Number(token.mc) || 0,
      holders: Number(token.holder) || 0,
      ageHours: index,
      ageLabel: "Live",
      color: colors[index % colors.length],
      sparkline: [0.2, 0.32, 0.27, 0.42, 0.37, 0.53, 0.46, 0.62, 0.58, 0.73, 0.67, 0.82, 0.76, 0.89, 0.85, 1],
    }));
}

export async function fetchBirdeyeToken(address: string): Promise<MarketToken | null> {
  const apiKey = process.env.NEXT_PUBLIC_BIRDEYE_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${encodeURIComponent(address)}`, {
    headers: { "X-API-KEY": apiKey, "x-chain": "solana" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Birdeye request failed (${response.status})`);
  const payload = (await response.json()) as OverviewResponse;
  const token = payload.data;
  if (!token?.name || !token.symbol || !token.address) return null;
  return {
    address: token.address,
    name: token.name,
    symbol: token.symbol,
    price: Number(token.price) || 0,
    change1h: Number(token.priceChange1hPercent) || 0,
    volume24h: Number(token.v24hUSD) || 0,
    marketCap: Number(token.mc) || 0,
    holders: Number(token.holder) || 0,
    liquidity: Number(token.liquidity) || 0,
    ageHours: 0,
    ageLabel: "Live",
    color: colors[0],
    sparkline: [0.2, 0.32, 0.27, 0.42, 0.37, 0.53, 0.46, 0.62, 0.58, 0.73, 0.67, 0.82, 0.76, 0.89, 0.85, 1],
  };
}