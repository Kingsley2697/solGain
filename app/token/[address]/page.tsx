"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, Copy, ExternalLink, ShieldAlert, Sparkles, Wallet } from "lucide-react";
import { useSolanaWallet } from "@/components/wallet-provider";
import type { MarketToken } from "@/lib/market";
import { fetchBirdeyeToken } from "@/lib/birdeye";
import { executeJupiterSwap, getJupiterQuote, SOL_MINT, type JupiterQuote } from "@/lib/jupiter";
import PriceChart from "./PriceChart";

type TradeSide = "Buy" | "Sell";
type TokenRisk = { score: number; liquidityLocked: boolean; liquidityLockedPct: number; mintAuthorityDisabled: boolean; freezeAuthorityDisabled: boolean; topHolderPct: number; topTenPct: number; decimals?: number; holders: { address: string; amount: number; percentage: number }[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-5)}`;

function BuySellPanel({ token, decimals }: { token: MarketToken; decimals?: number }) {
  const { publicKey, signTransaction, connect } = useSolanaWallet();
  const [side, setSide] = useState<TradeSide>("Buy");
  const [amount, setAmount] = useState("0.5");
  const [slippage, setSlippage] = useState(100);
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const clearQuote = () => { setQuote(null); setSignature(""); };
  const setTradeSide = (next: TradeSide) => { setSide(next); clearQuote(); setMessage(""); };
  const requestQuote = async () => {
    setMessage(""); setSignature("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setMessage("Enter an amount greater than zero.");
    if (!publicKey) { try { await connect(); } catch (error) { setMessage(error instanceof Error ? error.message : "Connect a wallet to trade."); } return; }
    if (side === "Sell" && decimals === undefined) return setMessage("Token metadata is still loading. Try again in a moment.");
    setBusy(true);
    try {
      const inputMint = side === "Buy" ? SOL_MINT : token.address;
      const outputMint = side === "Buy" ? token.address : SOL_MINT;
      const inputDecimals = side === "Buy" ? 9 : decimals ?? 6;
      setQuote(await getJupiterQuote(inputMint, outputMint, String(Math.round(value * 10 ** inputDecimals)), slippage, publicKey));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not fetch a quote. Please retry."); }
    finally { setBusy(false); }
  };
  const confirmSwap = async () => {
    if (!quote || !signTransaction) return setMessage("Request a fresh quote before confirming.");
    setMessage(""); setSignature(""); setBusy(true);
    try { setSignature(await executeJupiterSwap(quote, signTransaction)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Swap failed. Your wallet was not charged if you rejected the signature."); }
    finally { setBusy(false); }
  };
  const outputAmount = quote ? Number(quote.outAmount) / 10 ** (side === "Buy" ? decimals ?? 6 : 9) : null;
  const priceImpact = Number(quote?.priceImpactPct ?? 0);
  return <section className="trade-panel">
    <div className="panel-title"><strong>Swap</strong><span className="route-status"><i /> Jupiter route</span></div>
    <div className="trade-tabs">{(["Buy", "Sell"] as const).map(item => <button key={item} className={`${side === item ? "active" : ""} ${item.toLowerCase()}`} onClick={() => setTradeSide(item)}>{item}</button>)}</div>
    <div className="amount-label"><span>You {side === "Buy" ? "pay" : "sell"}</span><span>{side === "Buy" ? "SOL" : token.symbol}</span></div>
    <div className="amount-input"><input type="number" min="0" step="any" value={amount} onChange={event => { setAmount(event.target.value); clearQuote(); }} aria-label={`Amount of ${side === "Buy" ? "SOL" : token.symbol} to ${side.toLowerCase()}`} /><span>{side === "Buy" ? "SOL" : token.symbol}</span></div>
    <div className="quick-amounts">{(side === "Buy" ? ["0.1", "0.5", "1"] : ["1000", "10000", "100000"]).map(value => <button key={value} onClick={() => { setAmount(value); clearQuote(); }}>{value}</button>)}</div>
    <div className="amount-label output-label"><span>You {side === "Buy" ? "receive" : "get"}</span><span className="estimate">{quote ? "LIVE QUOTE" : "REQUEST A QUOTE"}</span></div>
    <div className="output-box"><strong>{outputAmount === null ? "—" : outputAmount.toLocaleString("en-US", { maximumFractionDigits: 5 })}</strong><span>{side === "Buy" ? token.symbol : "SOL"}</span></div>
    <div className="slippage-row"><span>Slippage tolerance <i>ⓘ</i></span><div>{[50, 100, 300].map(value => <button key={value} className={slippage === value ? "selected" : ""} onClick={() => { setSlippage(value); clearQuote(); }}>{value / 100}%</button>)}</div></div>
    <div className="quote-details"><span>Price impact <strong className={priceImpact > 0.05 ? "negative" : "positive"}>{quote ? `${(priceImpact * 100).toFixed(2)}%` : "—"}</strong></span><span>Platform fee <strong>None</strong></span></div>
    {quote && <p className="trade-message" role="status">Review the live output and price impact. Network and route fees are shown by your wallet before signing.</p>}
    <button className={`swap-button ${side.toLowerCase()}`} onClick={quote ? confirmSwap : requestQuote} disabled={busy}>{busy ? (quote ? "Awaiting confirmation…" : "Fetching route…") : quote ? <><Wallet size={15} /> Confirm & sign</> : "Get quote"}</button>
    {message && <p className="trade-message" role="alert">{message}</p>}{signature && <a className="trade-success" href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer">Swap confirmed <ExternalLink size={12} /></a>}
  </section>;
}

function SafetyPanel({ risk, unavailable }: { risk: TokenRisk | null; unavailable: boolean }) {
  if (!risk) return <section className="safety-panel"><div className="panel-title"><strong>Rug checker</strong><span className="demo-chip">{unavailable ? "UNAVAILABLE" : "SCANNING"}</span></div><p className="risk-note">{unavailable ? "Safety data could not be verified. Do not treat this token as screened." : "Checking mint, liquidity, and holder data…"}</p></section>;
  const checks = [["Liquidity locked", `${risk.liquidityLocked ? "Yes" : "No"} · ${risk.liquidityLockedPct.toFixed(0)}%`, risk.liquidityLocked], ["Mint authority disabled", risk.mintAuthorityDisabled ? "Yes" : "No", risk.mintAuthorityDisabled], ["Freeze authority disabled", risk.freezeAuthorityDisabled ? "Yes" : "No", risk.freezeAuthorityDisabled], ["Top holder", `${risk.topHolderPct.toFixed(1)}%`, risk.topHolderPct < 10], ["Top 10 holders", `${risk.topTenPct.toFixed(1)}%`, risk.topTenPct < 30]] as const;
  return <section className="safety-panel"><div className="panel-title"><strong>Rug checker</strong><span className="demo-chip">RUGCHECK SCAN</span></div><div className="safety-score"><div className={`score-ring ${risk.score >= 70 ? "good" : risk.score >= 40 ? "medium" : "bad"}`}><strong>{risk.score}</strong><small>/100</small></div><div><strong>{risk.score >= 70 ? "Lower risk" : risk.score >= 40 ? "Moderate risk" : "High risk"}</strong><span>RugCheck + Solana mint data</span></div></div><div className="safety-list">{checks.map(([label, value, good]) => <div key={label}><span>{label}</span><strong className={good ? "safe" : "unknown"}>{good ? <Check size={12} /> : <ShieldAlert size={12} />}{value}</strong></div>)}</div><p className="risk-note">This is a signal, not an audit or investment advice.</p></section>;
}

function MarketSummary({ token, risk }: { token: MarketToken; risk: TokenRisk | null }) {
  if (!risk) return <section className="ai-panel"><div className="panel-title"><strong><Sparkles size={14} /> Market summary</strong><span>WAITING</span></div><p className="risk-note">Risk-dependent analysis is shown only after a verified scan.</p></section>;
  const liquidity = token.liquidity ?? 0;
  const riskLevel = risk.topHolderPct > 12 || liquidity < 100000 ? "Elevated" : risk.topHolderPct > 6 ? "Moderate" : "Lower";
  const liquidityStatus = liquidity > 1000000 ? "Deep liquidity" : liquidity > 100000 ? "Moderate liquidity" : "Thin liquidity";
  return <section className="ai-panel"><div className="panel-title"><strong><Sparkles size={14} /> Market summary</strong><span>RULE-BASED</span></div><ul><li><i className={riskLevel === "Elevated" ? "warning" : "steady"} /><span><b>Concentration</b>{riskLevel} holder concentration signal</span></li><li><i className="steady" /><span><b>Holders</b>{token.holders?.toLocaleString() ?? "Not reported"}</span></li><li><i className={liquidity < 100000 ? "warning" : "steady"} /><span><b>Liquidity</b>{token.liquidity === undefined ? "Not reported" : liquidityStatus}</span></li></ul></section>;
}

export default function TokenPage() {
  const { address } = useParams<{ address: string }>();
  const [token, setToken] = useState<MarketToken | null>(null);
  const [risk, setRisk] = useState<TokenRisk | null>(null);
  const [marketStatus, setMarketStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [riskUnavailable, setRiskUnavailable] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy address");
  useEffect(() => { setToken(null); setMarketStatus("loading"); void fetchBirdeyeToken(address).then(result => { setToken(result); setMarketStatus(result ? "ready" : "unavailable"); }).catch(() => setMarketStatus("unavailable")); }, [address]);
  useEffect(() => { setRisk(null); setRiskUnavailable(false); void fetch(`/api/rugcheck/${encodeURIComponent(address)}`).then(response => response.ok ? response.json() as Promise<TokenRisk> : null).then(result => { setRisk(result); setRiskUnavailable(!result); }).catch(() => setRiskUnavailable(true)); }, [address]);
  if (!token && marketStatus === "loading") return <main className="token-loading"><div className="loading-mark" /><strong>Loading token market</strong><span>Checking market data</span><Link href="/">Back to markets</Link></main>;
  if (!token) return <main className="token-loading"><ShieldAlert size={26} /><strong>Token market unavailable</strong><span>This address could not be resolved to a tradeable Solana token.</span><Link href="/">Back to markets</Link></main>;
  const up = token.change >= 0;
  const copy = async () => { await navigator.clipboard.writeText(token.address); setCopyLabel("Copied"); window.setTimeout(() => setCopyLabel("Copy address"), 1600); };
  return <main className="token-page"><header className="token-topbar"><Link href="/" className="brand"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><nav><Link href="/">Markets</Link><Link href="/portfolio">Portfolio</Link><Link href="/watchlist">Watchlist</Link></nav><Link className="back-markets" href="/"><ArrowLeft size={14} /> Markets</Link></header><div className="token-layout"><div className="token-content"><div className="token-crumb"><Link href="/">Markets</Link><span>/</span><strong>{token.symbol}</strong></div><section className="token-hero"><div className="hero-identity"><span className="token-mark hero-mark" style={{ "--token-color": token.color } as React.CSSProperties}>{token.symbol.slice(0, 2)}</span><div><div className="hero-name"><h1>{token.name}</h1><span>{token.symbol}</span></div><div className="hero-address"><span>{short(token.address)}</span><button onClick={copy} aria-label={copyLabel}><Copy size={12} /></button><a href={`https://solscan.io/token/${token.address}`} target="_blank" rel="noreferrer" aria-label="Open token in Solscan"><ExternalLink size={12} /></a></div></div></div><div className="hero-price"><strong>{token.price < .01 ? `$${token.price.toPrecision(4)}` : `$${token.price.toFixed(4)}`}</strong><span className={up ? "positive" : "negative"}>{up ? "+" : ""}{token.change.toFixed(2)}% <small>{token.changeWindow.toUpperCase()}</small></span></div><div className="hero-metrics"><div><span>MARKET CAP</span><strong>{money(token.marketCap)}</strong></div><div><span>LIQUIDITY</span><strong>{token.liquidity === undefined ? "Not reported" : money(token.liquidity)}</strong></div><div><span>HOLDERS</span><strong>{token.holders?.toLocaleString() ?? "Not reported"}</strong></div></div></section><PriceChart address={token.address} /><section className="holders-panel"><div className="panel-title"><strong>Top holders</strong><span>{risk ? "RugCheck holder distribution" : "Scan required"}</span></div>{risk?.holders.length ? <><div className="holder-header"><span>ACCOUNT</span><span>AMOUNT</span><span>SUPPLY</span></div>{risk.holders.map((holder, index) => <div className="holder-row" key={holder.address}><span><i>{String(index + 1).padStart(2, "0")}</i>{short(holder.address)}</span><strong>{holder.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong><span>{holder.percentage.toFixed(2)}%</span></div>)}</> : <p className="risk-note">Holder concentration is unavailable until the safety scan completes.</p>}</section></div><aside className="token-sidebar"><BuySellPanel token={token} decimals={risk?.decimals} /><SafetyPanel risk={risk} unavailable={riskUnavailable} /><MarketSummary token={token} risk={risk} /><div className="sidebar-link"><span>Trade at your own risk</span><a href={`https://birdeye.so/token/${token.address}?chain=solana`} target="_blank" rel="noreferrer">View on Birdeye <ArrowUpRight size={12} /></a></div></aside></div><nav className="mobile-dock"><Link href="/" className="dock-active"><ArrowDown size={17} /><span>Markets</span></Link><Link href="/portfolio"><Wallet size={17} /><span>Portfolio</span></Link><Link href="/watchlist"><Sparkles size={17} /><span>Watchlist</span></Link></nav></main>;
}
