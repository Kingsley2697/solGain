export type PortfolioAsset = {
  id: string;
  name: string;
  symbol: string;
  image: string;
  quantity: number;
  price: number;
  value: number;
};

export async function getAssetsByOwner(owner: string): Promise<PortfolioAsset[]> {
  const response = await fetch(`/api/portfolio/${encodeURIComponent(owner)}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { error?: string; assets?: PortfolioAsset[] };
  if (!response.ok) throw new Error(payload.error ?? "Helius could not load this wallet.");
  return payload.assets ?? [];
}
