"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink, Flame, LayoutGrid, Search, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { fetchBirdeyeTokens } from "@/lib/birdeye";
import type { MarketToken } from "@/lib/market";
import { WatchlistButton } from "@/components/watchlist-button";
import { InstallAppButton } from "@/components/install-app-button";
import { useSolanaWallet } from "@/components/wallet-provider";

type MarketTab = "Trending" | "Top Gainers" | "Top Losers";
const tabs: MarketTab[] = ["Trending", "Top Gainers", "Top Losers"];
const price = (value: number) => value >= 1 ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : value >= 0.01 ? `$${value.toFixed(4)}` : `$${value.toPrecision(3)}`;
const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(value);

function TokenRow({ token, index }: { token: MarketToken; index: number }) {
  const up = token.change >= 0;
  return <div className="token-row">
    <Link href={`/token/${token.address}`} className="token-identity" aria-label={`Open ${token.name} token page`}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="token-mark" style={{ "--token-color": token.color } as React.CSSProperties}>{token.symbol.slice(0, 2)}</span><span className="token-name"><strong>{token.name}</strong><small>{token.symbol}</small></span></Link>
    <div className="metric"><strong>{price(token.price)}</strong><small>USD</small></div>
    <div className={`metric change ${up ? "positive" : "negative"}`}><strong>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(token.change).toFixed(1)}%</strong><small>{token.changeWindow.toUpperCase()}</small></div>
    <div className="metric"><strong>{compact(token.volume24h)}</strong><small>24H VOL</small></div>
    <div className="metric"><strong>{compact(token.marketCap)}</strong><small>MARKET CAP</small></div>
    <div className="metric holders"><strong>{token.holders?.toLocaleString() ?? "—"}</strong><small>HOLDERS</small></div>
    <div className="spark-cell" aria-label="Historical trend is available on the token page">—</div><div className="row-actions"><WatchlistButton address={token.address} /><Link href={`/token/${token.address}`} className="row-open" aria-label={`Open ${token.name}`}><ExternalLink size={14} /></Link></div>
  </div>;
}

function WalletButton() {
  const { publicKey: address, connect, disconnect, connecting } = useSolanaWallet();
  const [message, setMessage] = useState("");
  const toggleConnection = async () => {
    setMessage("");
    try { if (address) await disconnect(); else await connect(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Wallet connection was cancelled"); }
  };
  return <div className="wallet-wrap"><button className={`wallet-button ${address ? "connected" : ""}`} onClick={toggleConnection} disabled={connecting}><Wallet size={15} /><span>{connecting ? "Connecting" : address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Connect wallet"}</span>{!address && <ChevronDown size={14} />}</button>{message && <span className="wallet-error" role="status">{message}</span>}</div>;
}

export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MarketTab>("Trending");
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [query, setQuery] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const live = await fetchBirdeyeTokens();
      if (!live.length) throw new Error("Birdeye returned no market tokens.");
      setTokens(live); setUpdated(new Date()); setError("");
    } catch { setTokens([]); setError("Live market data is currently unavailable. Please try again shortly."); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 10_000); return () => window.clearInterval(timer); }, [refresh]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = tokens.filter(token => !term || `${token.name} ${token.symbol} ${token.address}`.toLowerCase().includes(term));
    if (activeTab === "Top Gainers") return [...filtered].sort((a, b) => b.change - a.change);
    if (activeTab === "Top Losers") return [...filtered].sort((a, b) => a.change - b.change);
    return [...filtered].sort((a, b) => b.volume24h - a.volume24h);
  }, [activeTab, query, tokens]);
  const totalVolume = tokens.reduce((sum, token) => sum + token.volume24h, 0);
  const largestMover = tokens.reduce<MarketToken | null>((best, token) => !best || token.change > best.change ? token : best, null);
  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const term = query.trim(); if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(term)) router.push(`/token/${term}`); };

  return <main className="terminal-shell">
    <header className="topbar"><Link href="/" className="brand" aria-label="solGain home"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><nav className="primary-nav" aria-label="Main navigation"><Link className="active" href="/">Markets</Link><Link href="/portfolio">Portfolio</Link><Link href="/watchlist">Watchlist</Link></nav><div className="topbar-actions"><div className="network-status"><i /> SOLANA MAINNET</div><InstallAppButton /><WalletButton /></div></header>
    <section className="market-main"><div className="market-heading"><div><div className="eyebrow"><i /> SOLANA ECOSYSTEM <span>/</span> TOKEN SCREENER</div><h1>Market overview</h1><p>Live data from Birdeye.</p></div><div className="market-tools"><form className="search-box" onSubmit={submitSearch}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search loaded tokens or paste a token address" aria-label="Search tokens by name or address" /></form></div></div>
      <div className="market-strip"><div className="live-label"><i /> {error ? "MARKET UNAVAILABLE" : "LIVE MARKET"}</div><div className="market-stat"><small>TRACKED TOKENS</small><strong>{tokens.length}</strong><em>LIVE RESPONSE</em></div><div className="market-stat"><small>24H VOLUME</small><strong>{compact(totalVolume)}</strong><em>TRACKED TOKENS</em></div><div className="market-stat"><small>TOP 24H MOVER</small><strong>{largestMover?.symbol ?? "—"}</strong><em className={largestMover && largestMover.change >= 0 ? "positive" : "negative"}>{largestMover ? `${largestMover.change >= 0 ? "+" : ""}${largestMover.change.toFixed(1)}%` : "—"}</em></div><div className="market-signal"><span><Sparkles size={14} /></span><small>DATA MODE</small><strong>{error ? "Unavailable" : "Live feed"}</strong></div></div>
      <section className="tokens-section" aria-labelledby="tokens-heading"><div className="section-topline"><div className="tab-list" role="tablist" aria-label="Token rankings">{tabs.map(tab => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "selected" : ""} onClick={() => setActiveTab(tab)}>{tab === "Trending" && <Flame size={14} />}{tab}</button>)}</div><div className="table-status"><i className={refreshing ? "refreshing" : ""} />{error ? "Birdeye unavailable" : "Birdeye live"}<span>·</span>{updated ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Syncing market"}</div></div>
        <div className="token-table" role="table" aria-labelledby="tokens-heading"><div className="table-header" role="row"><span id="tokens-heading" role="columnheader">TOKEN <ChevronDown size={12} /></span><span role="columnheader">PRICE</span><span role="columnheader">24H CHANGE</span><span role="columnheader">24H VOLUME</span><span role="columnheader">MARKET CAP</span><span role="columnheader">HOLDERS</span><span role="columnheader">CHART</span><span role="columnheader" /></div>{visible.length ? visible.map((token, index) => <TokenRow key={token.address} token={token} index={index} />) : <div className="empty-state"><Search size={19} /><strong>{error ? "Live market data unavailable" : "No tokens found"}</strong><span>{error ? "No simulated prices are shown. Check your Birdeye connection and retry." : "Try another loaded token or paste a token address."}</span></div>}</div>
        <div className="table-footer"><span>Showing <strong>{visible.length}</strong> live tokens</span><span>{query && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query.trim()) ? "Press Enter to open this token address" : "Token charts are available on each token page"}</span></div></section>
      <footer className="page-footer"><span>Live market data provided by Birdeye</span><div><span><ShieldCheck size={13} /> Non-custodial</span><span><Sparkles size={13} /> Data may be delayed</span><Link href="/terms">Terms & risk</Link><Link href="/privacy">Privacy</Link></div></footer></section>
    <nav className="mobile-dock" aria-label="Mobile navigation"><Link href="/" className="dock-active"><LayoutGrid size={17} /><span>Markets</span></Link><Link href="/portfolio"><Wallet size={17} /><span>Portfolio</span></Link><Link href="/watchlist"><Sparkles size={17} /><span>Watchlist</span></Link></nav>
  </main>;
}
