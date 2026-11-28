"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Search, Sparkles } from "lucide-react";
import { useSolanaWallet } from "@/components/wallet-provider";
import { fetchBirdeyeToken } from "@/lib/birdeye";
import type { MarketToken } from "@/lib/market";
import { getLocalWatchlist, getWatchlist } from "@/lib/watchlist";
import { WatchlistButton } from "@/components/watchlist-button";
import { MobileDock } from "@/components/mobile-dock";
import { setActiveToken } from "@/lib/active-token";

export default function WatchlistPage() {
  const { publicKey: owner, connect, signMessage } = useSolanaWallet();
  const [addresses, setAddresses] = useState<string[]>([]);
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const refreshInFlight = useRef(false);
  const refreshTokens = useCallback(async (saved: string[]) => {
    if (!saved.length) { setTokens([]); setLoading(false); return; }
    if (document.visibilityState === "hidden" || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const live: MarketToken[] = [];
      // A bounded queue avoids turning a large watchlist into a burst of
      // provider overview calls, which commonly causes 429 responses.
      for (let index = 0; index < saved.length; index += 4) {
        const batch = await Promise.all(saved.slice(index, index + 4).map(address => fetchBirdeyeToken(address).catch(() => null)));
        live.push(...batch.filter((token): token is MarketToken => token !== null));
      }
      // Keep the last successful values during a temporary provider outage.
      if (live.length) setTokens(live);
    } finally { refreshInFlight.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    if (!owner) { setAddresses([]); setLoading(false); return; }
    const local = getLocalWatchlist(owner);
    setAddresses(local);
    void refreshTokens(local);
    void getWatchlist(owner, signMessage).then(saved => {
      setAddresses(saved);
      void refreshTokens(saved);
    });
    const update = (event: Event) => setAddresses((event as CustomEvent<string[]>).detail);
    window.addEventListener("solgain:watchlist", update);
    return () => window.removeEventListener("solgain:watchlist", update);
  }, [owner, refreshTokens, signMessage]);
  useEffect(() => {
    if (!owner) return;
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refreshTokens(addresses); };
    refreshWhenVisible();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const refresh = window.setInterval(refreshWhenVisible, 20_000);
    return () => { document.removeEventListener("visibilitychange", refreshWhenVisible); window.clearInterval(refresh); };
  }, [addresses, owner, refreshTokens]);
  const entries = useMemo(() => {
    const term = query.toLowerCase().trim();
    return tokens.filter(token => addresses.includes(token.address) && (!term || `${token.name} ${token.symbol} ${token.address}`.toLowerCase().includes(term)));
  }, [addresses, query, tokens]);

  if (!owner) return <main className="watchlist-page"><header className="watchlist-topbar"><Link href="/" className="brand"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><Link href="/" className="back-markets"><ArrowLeft size={14} /> Markets</Link></header><section className="connect-state"><span className="connect-icon"><Bookmark size={22} /></span><p className="eyebrow">SOLGAIN WATCHLIST</p><h1>Track tokens from one wallet.</h1><p>Connect and sign a message once to sync your watchlist to this wallet.</p><button className="connect-cta" onClick={() => void connect()}><Bookmark size={15} /> Connect wallet</button></section></main>;

  return <main className="watchlist-page"><header className="watchlist-topbar"><Link href="/" className="brand"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><nav><Link href="/">Markets</Link><Link href="/portfolio">Portfolio</Link><Link className="active" href="/watchlist">Watchlist</Link></nav><Link href="/" className="back-markets"><ArrowLeft size={14} /> Markets</Link></header><section className="watchlist-main"><div className="watchlist-heading"><div><p className="eyebrow">YOUR MARKET RADAR</p><h1>Watchlist</h1><p>Keep an eye on tokens you follow.</p></div><label className="search-box"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search watchlist" aria-label="Search watchlist" /></label></div>
    <section className="watchlist-panel"><div className="panel-title"><strong>Saved tokens</strong><span>{entries.length} tracked</span></div>{loading ? <div className="asset-skeletons">{Array.from({ length: 4 }, (_, index) => <i key={index} />)}</div> : entries.length ? <div className="watchlist-list">{entries.map((token, index) => { const up = token.change >= 0; return <div className="watchlist-row" key={token.address}><Link href={`/token/${token.address}`} className="token-identity" onClick={() => setActiveToken(token.address)}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="token-mark" style={{ "--token-color": token.color } as React.CSSProperties}>{token.symbol.slice(0, 2)}</span><span className="token-name"><strong>{token.name}</strong><small>{token.symbol}</small></span></Link><span className="watchlist-metric"><small>PRICE</small><strong>${token.price < .01 ? token.price.toPrecision(3) : token.price.toFixed(4)}</strong></span><span className={`watchlist-change ${up ? "positive" : "negative"}`}>{up ? "+" : ""}{token.change.toFixed(2)}%</span><span className="watchlist-metric watchlist-cap"><small>MARKET CAP</small><strong>{new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(token.marketCap)}</strong></span><Link href={`/token/${token.address}`} className="watchlist-open" onClick={() => setActiveToken(token.address)}>Open token</Link><WatchlistButton address={token.address} /></div>; })}</div> : <div className="watchlist-empty"><span><Bookmark size={20} /></span><strong>{query ? "No matching tokens" : addresses.length ? "Live token data unavailable" : "Your watchlist is clear"}</strong><p>{query ? "Try a different search." : addresses.length ? "Saved tokens could not be loaded from Birdeye. Try again shortly." : "Save tokens from Markets to keep them close."}</p><Link href="/" className="browse-markets"><Sparkles size={14} /> Browse markets</Link></div>}</section>
    <footer className="page-footer"><span>Watchlist storage: this wallet. Remote sync uses a one-time wallet signature.</span><div><span><Sparkles size={13} /> Solana tokens</span></div></footer></section><MobileDock active="watchlist" /></main>;
}
