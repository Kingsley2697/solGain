"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink, Flame, LayoutGrid, Search, ShieldCheck, SlidersHorizontal, Sparkles, Wallet } from "lucide-react";
import { fetchBirdeyeDiscovery, fetchBirdeyeToken, fetchBirdeyeTokens, prefetchBirdeyeToken, readCachedBirdeyeTokens, searchBirdeyeTokens, type BirdeyeSearchToken } from "@/lib/birdeye";
import type { MarketToken } from "@/lib/market";
import { WatchlistButton } from "@/components/watchlist-button";
import { InstallAppButton } from "@/components/install-app-button";
import { useSolanaWallet } from "@/components/wallet-provider";
import { scoreMarketToken } from "@/lib/market-score";

type MarketTab = "Trending" | "Top Gainers" | "Top Losers" | "New Launches" | "Memecoins";
const tabs: MarketTab[] = ["Trending", "Top Gainers", "Top Losers", "New Launches", "Memecoins"];
const marketFeedSize = 50;
const tableSize = 20;
const solanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const price = (value: number) => value >= 1 ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : value >= 0.01 ? `$${value.toFixed(4)}` : `$${value.toPrecision(3)}`;
const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(value);

function TokenRow({ token, index, pinned }: { token: MarketToken; index: number; pinned: boolean }) {
  const up = token.change >= 0;
  return <div className={`token-row${pinned ? " pinned-token" : ""}`}>
    <Link href={`/token/${token.address}`} className="token-identity" aria-label={`Open ${token.name} token page`} onMouseEnter={() => void prefetchBirdeyeToken(token.address)} onFocus={() => void prefetchBirdeyeToken(token.address)}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="token-mark" style={{ "--token-color": token.color } as React.CSSProperties}>{token.symbol.slice(0, 2)}</span><span className="token-name"><strong>{token.name}</strong><small>{token.symbol}</small></span></Link>
    <div className="metric"><strong>{price(token.price)}</strong><small>USD</small></div>
    <div className={`metric change ${up ? "positive" : "negative"}`}><strong>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(token.change).toFixed(1)}%</strong><small>{token.changeWindow.toUpperCase()}</small></div>
    <div className="metric"><strong>{compact(token.volume24h)}</strong><small>24H VOL</small></div>
    <div className="metric"><strong>{compact(token.marketCap)}</strong><small>MARKET CAP</small></div>
    <div className="metric holders"><strong>{token.holders?.toLocaleString() ?? "—"}</strong><small>HOLDERS</small></div>
    <Link href={`/token/${token.address}`} className="market-detail">Live chart</Link><div className="row-actions"><WatchlistButton address={token.address} /><Link href={`/token/${token.address}`} className="row-open" aria-label={`Open ${token.name}`}><ExternalLink size={14} /></Link></div>
  </div>;
}

function SearchResults({ results, loading, error, onSelect }: { results: BirdeyeSearchToken[]; loading: boolean; error: string; onSelect: (token: BirdeyeSearchToken) => void }) {
  if (!loading && !error && !results.length) return null;
  return <div className="search-results" role="status" aria-live="polite">{loading ? <span className="search-result-status">Searching market data…</span> : error ? <span className="search-result-status">{error}</span> : results.length ? results.map(token => <button key={token.address} type="button" className="search-result" onMouseEnter={() => void prefetchBirdeyeToken(token.address)} onFocus={() => void prefetchBirdeyeToken(token.address)} onClick={() => onSelect(token)}><span className="token-mark" style={{ "--token-color": "#86a9d8" } as React.CSSProperties}>{token.symbol.slice(0, 2)}</span><span><strong>{token.name}</strong><small>{token.symbol} · {token.address.slice(0, 5)}…{token.address.slice(-5)}</small></span><em>Add to table</em></button>) : <span className="search-result-status">No Solana tokens found.</span>}</div>;
}

function WalletButton() {
  const { publicKey: address, connect, disconnect, connecting, wallets, selectedWalletId, selectWallet } = useSolanaWallet();
  const [message, setMessage] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const toggleConnection = async () => {
    setMessage("");
    try { if (address) await disconnect(); else await connect(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Wallet connection was cancelled"); }
  };
  const chooseWallet = async (walletId: string) => {
    setMessage(""); setPickerOpen(false); selectWallet(walletId);
    try { await connect(walletId); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Wallet connection was cancelled"); }
  };
  return <div className="wallet-wrap"><button className={`wallet-button ${address ? "connected" : ""}`} onClick={() => { if (!address && wallets.length > 1) setPickerOpen(open => !open); else void toggleConnection(); }} disabled={connecting}><Wallet size={15} /><span>{connecting ? "Connecting" : address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Connect wallet"}</span>{!address && <ChevronDown size={14} />}</button>{pickerOpen && <div className="wallet-picker" role="menu" aria-label="Choose a Solana wallet">{wallets.map(wallet => <button key={wallet.id} role="menuitem" className={wallet.id === selectedWalletId ? "selected" : ""} onClick={() => void chooseWallet(wallet.id)}>{wallet.name}</button>)}</div>}{message && <span className="wallet-error" role="status">{message}</span>}</div>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<MarketTab>("Trending");
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [pinnedTokens, setPinnedTokens] = useState<MarketToken[]>([]);
  const [query, setQuery] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minimumLiquidity, setMinimumLiquidity] = useState("0");
  const [minimumVolume, setMinimumVolume] = useState("0");
  const [minimumScore, setMinimumScore] = useState("0");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [newPairsOnly, setNewPairsOnly] = useState(false);
  const [searchResults, setSearchResults] = useState<BirdeyeSearchToken[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const refreshInFlight = useRef(false);
  const holderRefreshInFlight = useRef(false);
  const providerRetryAt = useRef(0);
  const refreshHolders = useCallback(async (addresses: string[]) => {
    if (!addresses.length || holderRefreshInFlight.current) return;
    holderRefreshInFlight.current = true;
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(`/api/market/holders?addresses=${encodeURIComponent(addresses.join(","))}`, { cache: "no-store", signal: controller.signal }).finally(() => window.clearTimeout(timeout));
      if (!response.ok) return;
      const result = await response.json() as { holders?: Record<string, number> };
      const holders = result.holders ?? {};
      setTokens(current => current.map(token => typeof holders[token.address] === "number" ? { ...token, holders: holders[token.address] } : token));
      setPinnedTokens(current => current.map(token => typeof holders[token.address] === "number" ? { ...token, holders: holders[token.address] } : token));
    } catch { /* The market rows remain usable while holder data retries. */ }
    finally { holderRefreshInFlight.current = false; }
  }, []);
  const pinSearchedToken = useCallback(async (address: string) => {
    setSearching(true); setSearchError("");
    try {
      const token = await fetchBirdeyeToken(address);
      if (!token) throw new Error("This token could not be resolved to a live Solana market.");
      // Most-recent searches stay pinned. The table reserves the remaining
      // positions for the current market ranking, and caps pins at 20 rows.
      setPinnedTokens(current => [token, ...current.filter(item => item.address !== token.address)].slice(0, tableSize));
      void refreshHolders([token.address]);
      setQuery(""); setSearchResults([]);
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : "Token lookup is unavailable.");
    } finally { setSearching(false); }
  }, [refreshHolders]);
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden" || Date.now() < providerRetryAt.current || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      const specialized = activeTab === "New Launches" || activeTab === "Memecoins";
      const discovery = specialized ? await fetchBirdeyeDiscovery(activeTab === "New Launches" ? "launches" : "memecoins") : null;
      const live = discovery?.tokens ?? await fetchBirdeyeTokens({ limit: marketFeedSize });
      if (!live.length) throw new Error("The market providers returned no tokens.");
      setTokens(previous => live.map(token => ({ ...token, holders: token.holders ?? previous.find(current => current.address === token.address)?.holders })));
      void refreshHolders(live.map(token => token.address));
      setUpdated(new Date()); setError("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Live market data is currently unavailable. Please try again shortly.";
      if (/compute units|rate limit|too many/i.test(message)) {
        providerRetryAt.current = Date.now() + 5 * 60_000;
        setError("Birdeye quota is temporarily exhausted. Live refresh will retry in about five minutes.");
      } else setError(message);
    }
    finally { refreshInFlight.current = false; setRefreshing(false); }
  }, [activeTab, refreshHolders]);
  useEffect(() => {
    if (activeTab === "Trending") {
      const cached = readCachedBirdeyeTokens();
      if (cached) { setTokens(cached.value); setUpdated(new Date(cached.savedAt)); setRefreshing(false); }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    refreshWhenVisible();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    // Ten seconds is responsive for REST data without rapidly exhausting a
    // provider's compute-unit quota. WebSocket streaming is the next step for
    // sub-second feeds on a provider plan that supports it.
    const timer = window.setInterval(refreshWhenVisible, 10_000);
    return () => { document.removeEventListener("visibilitychange", refreshWhenVisible); window.clearInterval(timer); };
  }, [activeTab, refresh]);

  useEffect(() => {
    const term = query.trim();
    if (!term || (term.length < 2 && !solanaAddress.test(term))) { setSearchResults([]); setSearchError(""); setSearching(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError("");
      const lookup = solanaAddress.test(term)
        ? fetchBirdeyeToken(term).then(token => token ? [{ address: token.address, name: token.name, symbol: token.symbol, logoURI: token.logoURI }] : [])
        : searchBirdeyeTokens(term);
      void lookup.then(results => { if (active) setSearchResults(results); }).catch(error => { if (active) { setSearchResults([]); setSearchError(error instanceof Error ? error.message : "Search is unavailable."); } }).finally(() => { if (active) setSearching(false); });
    }, solanaAddress.test(term) ? 120 : 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  const visible = useMemo(() => {
    const filtered = tokens.filter(token => {
      const score = scoreMarketToken(token);
      const isNew = token.createdAt !== undefined && token.createdAt <= Date.now() && Date.now() - token.createdAt < 7 * 24 * 60 * 60 * 1000;
      return (token.liquidity ?? 0) >= Number(minimumLiquidity || 0)
        && token.volume24h >= Number(minimumVolume || 0)
        && score.total >= Number(minimumScore || 0)
        && (!verifiedOnly || token.verified === true)
        && (!newPairsOnly || isNew);
    });
    const ranked = [...filtered].sort((left, right) => {
      if (activeTab === "Top Gainers") return right.change - left.change;
      if (activeTab === "Top Losers") return left.change - right.change;
      if (activeTab === "New Launches") return (right.createdAt ?? 0) - (left.createdAt ?? 0);
      return right.volume24h - left.volume24h;
    });
    const pins = pinnedTokens.slice(0, tableSize);
    const pinnedAddresses = new Set(pins.map(token => token.address));
    return [...pins, ...ranked.filter(token => !pinnedAddresses.has(token.address)).slice(0, Math.max(0, tableSize - pins.length))];
  }, [activeTab, minimumLiquidity, minimumScore, minimumVolume, newPairsOnly, pinnedTokens, tokens, verifiedOnly]);
  const pinnedAddresses = useMemo(() => new Set(pinnedTokens.map(token => token.address)), [pinnedTokens]);
  const totalVolume = visible.reduce((sum, token) => sum + token.volume24h, 0);
  const largestMover = visible.reduce<MarketToken | null>((best, token) => !best || token.change > best.change ? token : best, null);
  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (solanaAddress.test(term)) { void pinSearchedToken(term); return; }
    if (searchResults[0]) void pinSearchedToken(searchResults[0].address);
  };

  return <main className="terminal-shell">
    <header className="topbar"><Link href="/" className="brand" aria-label="solGain home"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><nav className="primary-nav" aria-label="Main navigation"><Link className="active" href="/">Markets</Link><Link href="/portfolio">Portfolio</Link><Link href="/watchlist">Watchlist</Link></nav><div className="topbar-actions"><div className="network-status"><i /> SOLANA MAINNET</div><InstallAppButton /><WalletButton /></div></header>
    <section className="market-main"><div className="market-heading"><div><div className="eyebrow"><i /> SOLANA ECOSYSTEM <span>/</span> TOKEN SCREENER</div><h1>Market overview</h1><p>Live data from multiple market providers.</p></div><div className="market-tools"><div className="market-search"><form className="search-box" onSubmit={submitSearch}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search any token or paste a mint address" aria-label="Search tokens by name, ticker, or address" autoComplete="off" /></form><SearchResults results={searchResults} loading={searching} error={searchError} onSelect={token => void pinSearchedToken(token.address)} /></div><button className="filter-button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}><SlidersHorizontal size={14} /> Filters</button></div></div>
      {filtersOpen && <section className="discovery-filters" aria-label="Token discovery filters"><div><label>Min liquidity (USD)<input type="number" min="0" value={minimumLiquidity} onChange={event => setMinimumLiquidity(event.target.value)} /></label><label>Min 24h volume (USD)<input type="number" min="0" value={minimumVolume} onChange={event => setMinimumVolume(event.target.value)} /></label><label>Min transparent score<input type="number" min="0" max="100" value={minimumScore} onChange={event => setMinimumScore(event.target.value)} /></label></div><div className="discovery-toggles"><label><input type="checkbox" checked={verifiedOnly} onChange={event => setVerifiedOnly(event.target.checked)} /> Verified only</label><label><input type="checkbox" checked={newPairsOnly} onChange={event => setNewPairsOnly(event.target.checked)} /> New pairs (under 7 days)</label><button onClick={() => { setMinimumLiquidity("0"); setMinimumVolume("0"); setMinimumScore("0"); setVerifiedOnly(false); setNewPairsOnly(false); }}>Reset</button></div><p>Transparent score: liquidity (30), 24h activity (25), holder count (20), verification (15), and market cap (10). Authority and holder-concentration filters remain available on each token&apos;s live safety scan.</p></section>}
      <div className="market-strip"><div className="live-label"><i /> {error ? "MARKET UNAVAILABLE" : "LIVE MARKET"}</div><div className="market-stat"><small>TRACKED TOKENS</small><strong>{visible.length}</strong><em>TOP {tableSize} RANKING</em></div><div className="market-stat"><small>24H VOLUME</small><strong>{compact(totalVolume)}</strong><em>TRACKED TOKENS</em></div><div className="market-stat"><small>TOP 24H MOVER</small><strong>{largestMover?.symbol ?? "—"}</strong><em className={largestMover && largestMover.change >= 0 ? "positive" : "negative"}>{largestMover ? `${largestMover.change >= 0 ? "+" : ""}${largestMover.change.toFixed(1)}%` : "—"}</em></div><div className="market-signal"><span><Sparkles size={14} /></span><small>DATA MODE</small><strong>{error ? "Unavailable" : "Live feed"}</strong></div></div>
      <section className="tokens-section" aria-labelledby="tokens-heading"><div className="section-topline"><div className="tab-list" role="tablist" aria-label="Token rankings">{tabs.map(tab => <button key={tab} role="tab" data-market-tab={tab} aria-selected={activeTab === tab} className={activeTab === tab ? "selected" : ""} onClick={() => setActiveTab(tab)}>{tab === "Trending" && <Flame size={14} />}{tab}</button>)}</div><div className="table-status"><i className={refreshing ? "refreshing" : ""} />{error ? "Market data unavailable" : "Market data live"}<span>·</span>{updated ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Syncing market"}</div></div>
        <div className="token-table" role="table" aria-labelledby="tokens-heading"><div className="table-header" role="row"><span id="tokens-heading" role="columnheader">TOKEN <ChevronDown size={12} /></span><span role="columnheader">PRICE</span><span role="columnheader">24H CHANGE</span><span role="columnheader">24H VOLUME</span><span role="columnheader">MARKET CAP</span><span role="columnheader">HOLDERS</span><span role="columnheader">DETAILS</span><span role="columnheader" /></div>{visible.length ? visible.map((token, index) => <TokenRow key={token.address} token={token} index={index} pinned={pinnedAddresses.has(token.address)} />) : <div className="empty-state"><Search size={19} /><strong>{error ? "Live market data unavailable" : "No tokens found"}</strong><span>{error ? "No cached or simulated prices are shown. Check your market-data connection and retry." : "Try another loaded token or paste a token address."}</span></div>}</div>
        <div className="table-footer"><span>Showing <strong>{visible.length}</strong> of <strong>{tableSize}</strong> ranked tokens{pinnedTokens.length ? ` · ${pinnedTokens.length} pinned` : ""}</span><span>Search results replace the lowest-ranked unpinned row.</span></div></section>
      <footer className="page-footer"><span>Live market data from Birdeye, DexScreener, and GeckoTerminal</span><div><span><ShieldCheck size={13} /> Non-custodial</span><span><Sparkles size={13} /> Data may be delayed</span><Link href="/terms">Terms & risk</Link><Link href="/privacy">Privacy</Link></div></footer></section>
    <nav className="mobile-dock" aria-label="Mobile navigation"><Link href="/" className="dock-active"><LayoutGrid size={17} /><span>Markets</span></Link><Link href="/portfolio"><Wallet size={17} /><span>Portfolio</span></Link><Link href="/watchlist"><Sparkles size={17} /><span>Watchlist</span></Link></nav>
  </main>;
}
