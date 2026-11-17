export type PortfolioAsset = {
  id: string;
  name: string;
  symbol: string;
  image: string;
  quantity: number;
  price: number;
  value: number;
};

type HeliusAsset = {
  id?: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
  token_info?: {
    balance?: number;
    decimals?: number;
    symbol?: string;
    price_info?: { price_per_token?: number; total_price?: number };
  };
};

export async function getAssetsByOwner(owner: string): Promise<PortfolioAsset[]> {
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) throw new Error("Add NEXT_PUBLIC_HELIUS_API_KEY to load wallet assets.");
  const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "solgain", method: "getAssetsByOwner", params: { ownerAddress: owner, page: 1, limit: 1000, displayOptions: { showFungible: true } } }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "Helius could not load this wallet.");
  return ((payload.result?.items ?? []) as HeliusAsset[])
    .filter(asset => asset.id && asset.token_info)
    .map(asset => {
      const info = asset.token_info!;
      const quantity = (Number(info.balance) || 0) / 10 ** (Number(info.decimals) || 0);
      const price = Number(info.price_info?.price_per_token) || 0;
      return {
        id: asset.id!,
        name: asset.content?.metadata?.name || "Unknown token",
        symbol: info.symbol || asset.content?.metadata?.symbol || "TOKEN",
        image: asset.content?.links?.image || "",
        quantity,
        price,
        value: Number(info.price_info?.total_price) || quantity * price,
      };
    })
    .filter(asset => asset.quantity > 0);
}
