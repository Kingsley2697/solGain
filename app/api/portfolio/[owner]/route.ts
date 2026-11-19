import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

type HeliusAsset = {
  id?: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
  token_info?: { balance?: number; decimals?: number; symbol?: string; price_info?: { price_per_token?: number; total_price?: number } };
};
type CachedPortfolio = { payload: { assets: unknown[] }; cachedAt: number };
const portfolioCache = new Map<string, CachedPortfolio>();
const freshCacheMs = 15_000;
const staleCacheMs = 2 * 60_000;

function json(payload: { assets: unknown[] }, cache = "MISS") {
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, max-age=0", "X-Portfolio-Cache": cache } });
}

export async function GET(request: NextRequest, { params }: { params: { owner: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "portfolio", 20, 60_000)) return NextResponse.json({ error: "Too many portfolio requests." }, { status: 429 });
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Portfolio data is not configured." }, { status: 503 });
  let owner: string;
  try { owner = new PublicKey(params.owner).toBase58(); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  const cached = portfolioCache.get(owner);
  if (cached && Date.now() - cached.cachedAt < freshCacheMs) return json(cached.payload, "HIT");
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ jsonrpc: "2.0", id: "solgain", method: "getAssetsByOwner", params: { ownerAddress: owner, page: 1, limit: 1000, displayOptions: { showFungible: true } } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) return NextResponse.json({ error: payload.error?.message ?? "Helius could not load this wallet." }, { status: 502 });
    const assets = ((payload.result?.items ?? []) as HeliusAsset[]).flatMap(asset => {
      if (!asset.id || !asset.token_info) return [];
      const info = asset.token_info;
      const quantity = (Number(info.balance) || 0) / 10 ** (Number(info.decimals) || 0);
      if (quantity <= 0) return [];
      const price = Number(info.price_info?.price_per_token) || 0;
      return [{ id: asset.id, name: asset.content?.metadata?.name || "Unknown token", symbol: info.symbol || asset.content?.metadata?.symbol || "TOKEN", image: asset.content?.links?.image || "", quantity, price, value: Number(info.price_info?.total_price) || quantity * price }];
    });
    const assetPayload = { assets };
    portfolioCache.set(owner, { payload: assetPayload, cachedAt: Date.now() });
    return json(assetPayload);
  } catch {
    if (cached && Date.now() - cached.cachedAt < staleCacheMs) return json(cached.payload, "STALE");
    return NextResponse.json({ error: "Portfolio data is temporarily unavailable." }, { status: 502 });
  }
}
