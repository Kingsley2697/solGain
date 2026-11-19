"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleAlert, RefreshCw, Wallet } from "lucide-react";
import { useSolanaWallet } from "@/components/wallet-provider";
import { getAssetsByOwner, type PortfolioAsset } from "@/lib/helius";

type CostBasis = Record<string, number>;
const basisKey = (owner: string) => `solgain:cost-basis:${owner}`;
const legacyBasisKey = (owner: string) => `solpulse:cost-basis:${owner}`;
const formatUsd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

export default function PortfolioPage() {
  const { publicKey: owner, connect: connectWallet } = useSolanaWallet();
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [basis, setBasis] = useState<CostBasis>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestInFlight = useRef(false);

  const load = useCallback(async (walletAddress: string) => {
    if (document.visibilityState === "hidden" || requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true); setError("");
    try {
      const walletAssets = await getAssetsByOwner(walletAddress);
      const saved = JSON.parse(localStorage.getItem(basisKey(walletAddress)) ?? localStorage.getItem(legacyBasisKey(walletAddress)) ?? "{}") as CostBasis;
      for (const asset of walletAssets) if (saved[asset.id] === undefined && asset.price > 0) saved[asset.id] = asset.price;
      localStorage.setItem(basisKey(walletAddress), JSON.stringify(saved));
      setBasis(saved); setAssets(walletAssets);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load portfolio."); }
    finally { requestInFlight.current = false; setLoading(false); }
  }, []);

  useEffect(() => {
    if (!owner) return;
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void load(owner); };
    refreshWhenVisible();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const refresh = window.setInterval(refreshWhenVisible, 30_000);
    return () => { document.removeEventListener("visibilitychange", refreshWhenVisible); window.clearInterval(refresh); };
  }, [load, owner]);

  const promptConnect = async () => {
    setError("");
    try { await connectWallet(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Wallet connection was cancelled."); }
  };

  if (!owner) return <main className="portfolio-page"><header className="portfolio-topbar"><Link href="/" className="brand"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><Link href="/" className="back-markets"><ArrowLeft size={14} /> Markets</Link></header><section className="connect-state"><span className="connect-icon"><Wallet size={22} /></span><p className="eyebrow">SOLGAIN PORTFOLIO</p><h1>Your positions, in one place.</h1><p>Connect a wallet to view your Solana assets and tracked portfolio performance.</p><button className="connect-cta" onClick={promptConnect}><Wallet size={15} /> Connect wallet</button>{error && <span className="portfolio-error">{error}</span>}</section></main>;

  const total = assets.reduce((sum, asset) => sum + asset.value, 0);
  const pnl = assets.reduce((sum, asset) => sum + (asset.price - (basis[asset.id] ?? asset.price)) * asset.quantity, 0);
  const ordered = [...assets].sort((a, b) => ((b.price - (basis[b.id] ?? b.price)) / (basis[b.id] || 1)) - ((a.price - (basis[a.id] ?? a.price)) / (basis[a.id] || 1)));

  const initialLoading = loading && assets.length === 0;
  return <main className="portfolio-page"><header className="portfolio-topbar"><Link href="/" className="brand"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><div><span className="connected-wallet"><i />{owner.slice(0, 5)}…{owner.slice(-5)}</span><button className="refresh-button" onClick={() => void load(owner)} disabled={loading} aria-label="Refresh portfolio"><RefreshCw size={15} /></button></div></header><div className="portfolio-main"><div className="portfolio-heading"><div><p className="eyebrow">ACCOUNT OVERVIEW</p><h1>Portfolio</h1></div><Link href="/" className="back-markets"><ArrowLeft size={14} /> Markets</Link></div>
    {error && <div className="portfolio-banner"><CircleAlert size={16} />{error}</div>}
    <div className="portfolio-stats"><section><span>TOTAL VALUE</span><strong>{initialLoading ? "Loading…" : formatUsd(total)}</strong><small>Helius live balance</small></section><section><span>TRACKED P&L</span><strong className={pnl >= 0 ? "positive" : "negative"}>{initialLoading ? "Loading…" : `${pnl >= 0 ? "+" : ""}${formatUsd(pnl)}`}</strong><small>Since first portfolio sync</small></section><section><span>BEST PERFORMER</span><strong>{ordered[0]?.symbol ?? "—"}</strong><small className="positive">{ordered[0] ? `${((ordered[0].price - (basis[ordered[0].id] ?? ordered[0].price)) / (basis[ordered[0].id] || 1) * 100).toFixed(2)}% tracked` : "No positions"}</small></section><section><span>WORST PERFORMER</span><strong>{ordered.at(-1)?.symbol ?? "—"}</strong><small className="negative">{ordered.at(-1) ? `${((ordered.at(-1)!.price - (basis[ordered.at(-1)!.id] ?? ordered.at(-1)!.price)) / (basis[ordered.at(-1)!.id] || 1) * 100).toFixed(2)}% tracked` : "No positions"}</small></section></div>
    <section className="portfolio-assets"><div className="panel-title"><strong>Token balances</strong><span>{assets.length} assets</span></div>{initialLoading ? <div className="asset-skeletons">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div> : assets.length ? <div className="asset-table"><div className="asset-header"><span>ASSET</span><span>BALANCE</span><span>PRICE</span><span>VALUE</span><span>TRACKED P&L</span><span /></div>{assets.map(asset => { const assetPnl = (asset.price - (basis[asset.id] ?? asset.price)) * asset.quantity; const token = asset.symbol; return <div className="asset-row" key={asset.id}><div className="asset-name">{asset.image ? <Image src={asset.image} alt="" width={32} height={32} unoptimized /> : <span>{token.slice(0, 1)}</span>}<div><strong>{asset.name}</strong><small>{asset.symbol}</small></div></div><strong>{asset.quantity.toLocaleString("en-US", { maximumFractionDigits: 5 })} {asset.symbol}</strong><span>{formatUsd(asset.price)}</span><strong>{formatUsd(asset.value)}</strong><span className={assetPnl >= 0 ? "positive" : "negative"}>{assetPnl >= 0 ? "+" : ""}{formatUsd(assetPnl)}</span><Link href={`/token/${asset.id}`} className="sell-link">Sell</Link></div>; })}</div> : <div className="portfolio-empty"><Wallet size={20} /><strong>No token assets found</strong><span>Your wallet is connected, but Helius returned no priced token balances.</span></div>}<p className="portfolio-disclaimer">P&L is tracked from the first successful portfolio sync on this device. It is not historical cost basis.</p></section>
    </div></main>;
}
