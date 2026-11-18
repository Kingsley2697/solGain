"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink, Flame, LayoutGrid, Search, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { fetchBirdeyeTokens } from "@/lib/birdeye";
import { mockTokens, type MarketToken } from "@/lib/mock";
import { WatchlistButton } from "@/components/watchlist-button";
import { InstallAppButton } from "@/components/install-app-button";
import { useSolanaWallet } from "@/components/wallet-provider";

type MarketTab = "New Pairs" | "Trending" | "Top Gainers" | "Top Losers";
const tabs: MarketTab[] = ["New Pairs", "Trending", "Top Gainers", "Top Losers"];
const price = (value: number) => value >= 1 ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : value >= 0.01 ? `$${value.toFixed(4)}` : `$${value.toPrecision(3)}`;
const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(value);

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((value, index) => `${index / (values.length - 1) * 100},${27 - (value - min) / range * 24}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label={`${up ? "Rising" : "Falling"} price trend`}><polyline points={points} fill="none" stroke={up ? "#22c55e" : "#ef4444"} strokeWidth="1.7" vectorEffect="non-scaling-stroke" /></svg>;
}

function TokenRow({ token, index }: { token: MarketToken; index: number }) {
  const up = token.change1h >= 0;
  return <div className="token-row">
    <Link href={`/token/${token.address}`} className="token-identity" aria-label={`Open ${token.name} token page`}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="token-mark" style={{ "--token-color": token.color } as React.CSSProperties}>{token.symbol.slice(0, 2)}</span><span className="token-name"><strong>{token.name}</strong><small>{token.symbol}<i> · {token.ageLabel}</i></small></span></Link>
    <div className="metric"><strong>{price(token.price)}</strong><small>USD</small></div>
    <div className={`metric change ${up ? "positive" : "negative"}`}><strong>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(token.change1h).toFixed(1)}%</strong><small>1H</small></div>
    <div className="metric"><strong>{compact(token.volume24h)}</strong><small>24H VOL</small></div>
    <div className="metric"><strong>{compact(token.marketCap)}</strong><small>MARKET CAP</small></div>
    <div className="metric holders"><strong>{token.holders.toLocaleString()}</strong><small>HOLDERS</small></div>
    <div className="spark-cell"><Sparkline values={token.sparkline} up={up} /></div><div className="row-actions"><WatchlistButton address={token.address} /><Link href={`/token/${token.address}`} className="row-open" aria-label={`Open ${token.name}`}><ExternalLink size={14} /></Link></div>
  </div>;
}

function WalletButton() {
  const { publicKey: address, connect, disconnect, connecting } = useSolanaWallet();
  const [message, setMessage] = useState("");
  const toggleConnection = async () => {
    setMessage("");
    try {
      if (address) await disconnect();
      else await connect();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Wallet connection was cancelled"); }
  };
  return <div className="wallet-wrap"><button className={`wallet-button ${address ? "connected" : ""}`} onClick={toggleConnection} disabled={connecting}><Wallet size={15} /><span>{connecting ? "Connecting" : address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Connect wallet"}</span>{!address && <ChevronDown size={14} />}</button>{message && <span className="wallet-error" role="status">{message}</span>}</div>;
}
export default function Home() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MarketTab>("Trending");
  const [tokens, setTokens] = useState<MarketToken[]>(mockTokens);
  const [query, setQuery] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const live = await fetchBirdeyeTokens();
      if (live.length) { setTokens(live); setMockMode(false); }
      else { setTokens(mockTokens); setMockMode(true); }
    } catch { setTokens(mockTokens); setMockMode(true); }
    finally { setUpdated(new Date()); setRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 10_000); return () => window.clearInterval(timer); }, [refresh]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = tokens.filter(token => !term || `${token.name} ${token.symbol} ${token.address}`.toLowerCase().includes(term));
    if (activeTab === "New Pairs") return filtered.sort((a, b) => a.ageHours - b.ageHours);
    if (activeTab === "Trending") return filtered.sort((a, b) => b.volume24h - a.volume24h);
    if (activeTab === "Top Gainers") return filtered.sort((a, b) => b.change1h - a.change1h);
    return filtered.sort((a, b) => a.change1h - b.change1h);
  }, [activeTab, query, tokens]);
  const totalVolume = tokens.reduce((sum, token) => sum + token.volume24h, 0);
  const largestMover = tokens.reduce<MarketToken | null>((best, token) => !best || token.change1h > best.change1h ? token : best, null);
  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(term)) router.push(`/token/${term}`);
  };

  return <main className="terminal-shell">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="solGain home"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link>
      <nav className="primary-nav" aria-label="Main navigation"><Link className="active" href="/">Markets</Link><Link href="/portfolio">Portfolio</Link><Link href="/watchlist">Watchlist</Link></nav>
      <div className="topbar-actions"><div className="network-status"><i /> SOLANA MAINNET</div><InstallAppButton /><WalletButton /></div>
    </header>
    <section className="market-main">
      <div className="market-heading"><div><div className="eyebrow"><i /> SOLANA ECOSYSTEM <span>/</span> TOKEN SCREENER</div><h1>Market overview</h1><p>Find momentum before it finds everyone else.</p></div>
        <div className="market-tools"><form className="search-box" onSubmit={submitSearch}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or paste a token address" aria-label="Search tokens by name or address" /></form></div>
      </div>
      <div className="market-strip"><div className="live-label"><i /> {mockMode ? "DEMO MARKET" : "LIVE MARKET"} <span /></div><div className="market-stat"><small>TRACKED TOKENS</small><strong>{tokens.length}</strong><em>IN THIS VIEW</em></div><div className="market-stat"><small>24H VOLUME</small><strong>{compact(totalVolume)}</strong><em>TRACKED TOKENS</em></div><div className="market-stat"><small>TOP 1H MOVER</small><strong>{largestMover?.symbol ?? "—"}</strong><em className={largestMover && largestMover.change1h >= 0 ? "positive" : "negative"}>{largestMover ? `${largestMover.change1h >= 0 ? "+" : ""}${largestMover.change1h.toFixed(1)}%` : "—"}</em></div><div className="market-signal"><span><Sparkles size={14} /></span><small>DATA MODE</small><strong>{mockMode ? "Preview" : "Live feed"}</strong></div></div>
      <section className="tokens-section" aria-labelledby="tokens-heading">
        <div className="section-topline"><div className="tab-list" role="tablist" aria-label="Token rankings">{tabs.map(tab => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "selected" : ""} onClick={() => setActiveTab(tab)}>{tab === "Trending" && <Flame size={14} />}{tab === "New Pairs" && <i />}{tab}</button>)}</div><div className="table-status"><i className={refreshing ? "refreshing" : ""} />{mockMode ? "Demo market" : "Birdeye live"}<span>·</span>{updated ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Syncing market"}</div></div>
        <div className="token-table" role="table" aria-labelledby="tokens-heading"><div className="table-header" role="row"><span id="tokens-heading" role="columnheader">TOKEN <ChevronDown size={12} /></span><span role="columnheader">PRICE</span><span role="columnheader">1H CHANGE</span><span role="columnheader">24H VOLUME</span><span role="columnheader">MARKET CAP</span><span role="columnheader">HOLDERS</span><span role="columnheader">7D TREND</span><span role="columnheader" /></div>
          {visible.length ? visible.map((token, index) => <TokenRow key={token.address} token={token} index={index} />) : <div className="empty-state"><Search size={19} /><strong>No tokens found</strong><span>Try a different name, symbol, or address.</span></div>}
        </div>
        <div className="table-footer"><span>Showing <strong>{visible.length}</strong> of {tokens.length} tracked tokens</span><span>{query && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query.trim()) ? "Press Enter to open this token address" : "Use search or rankings to narrow the list"}</span></div>
      </section>
      <footer className="page-footer"><span>Market data {mockMode ? "is simulated for preview" : "provided by Birdeye"}</span><div><span><ShieldCheck size={13} /> Non-custodial</span><span><Sparkles size={13} /> Data may be delayed</span><Link href="/terms">Terms & risk</Link><Link href="/privacy">Privacy</Link></div></footer>
    </section>
    <nav className="mobile-dock" aria-label="Mobile navigation"><Link href="/" className="dock-active"><LayoutGrid size={17} /><span>Markets</span></Link><Link href="/portfolio"><Wallet size={17} /><span>Portfolio</span></Link><Link href="/watchlist"><Sparkles size={17} /><span>Watchlist</span></Link></nav>
  </main>;
}
