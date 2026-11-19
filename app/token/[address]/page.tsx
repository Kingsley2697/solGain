"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, ShieldAlert, Wallet } from "lucide-react";
import { useSolanaWallet } from "@/components/wallet-provider";
import type { MarketToken } from "@/lib/market";
import { fetchBirdeyeToken } from "@/lib/birdeye";
import { executeJupiterSwap, getJupiterQuote, simulateJupiterSwap, SOL_MINT, type JupiterQuote, type SwapSimulation } from "@/lib/jupiter";
import { TriggerStrategy } from "@/components/trigger-strategy";
import { TokenAlerts } from "@/components/token-alerts";
import PriceChart from "./PriceChart";

type TradeSide = "Buy" | "Sell";
type TradingMode = "instant" | "strategy";
type TokenRisk = { score: number; liquidityLocked: boolean; liquidityLockedPct: number; mintAuthorityDisabled: boolean; freezeAuthorityDisabled: boolean; topHolderPct: number; topTenPct: number; decimals?: number; holders: { address: string; amount: number; percentage: number }[] };
const short = (value: string) => value.slice(0, 5) + "…" + value.slice(-5);
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
const quoteTtlMs = 20_000;

function formatTokenAmount(amount: string, decimals: number) {
  const raw = amount.replace(/^0+/, "") || "0";
  if (!decimals) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "").slice(0, 9);
  return fraction ? `${whole}.${fraction}` : whole;
}

function minimumAmount(amount: string, slippageBps: number) {
  return ((BigInt(amount) * BigInt(10_000 - slippageBps)) / BigInt(10_000)).toString();
}

function relativeAge(timestamp: number) {
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  return hours < 24 ? `${hours || 1}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function TradePanel({ token, risk, riskUnavailable }: { token: MarketToken; risk: TokenRisk | null; riskUnavailable: boolean }) {
  const { publicKey, signTransaction, connect } = useSolanaWallet();
  const [side, setSide] = useState<TradeSide>("Buy");
  const [amount, setAmount] = useState("0.5");
  const [slippage, setSlippage] = useState(100);
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [simulation, setSimulation] = useState<SwapSimulation | null>(null);
  const [acknowledged, setAcknowledledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [quotedAt, setQuotedAt] = useState<number | null>(null);
  const [quoteAge, setQuoteAge] = useState(0);
  const clear = () => { setQuote(null); setSimulation(null); setAcknowledledged(false); setSignature(""); setQuotedAt(null); };
  const inputDecimals = side === "Buy" ? 9 : risk?.decimals ?? 6;
  const outputDecimals = side === "Buy" ? risk?.decimals ?? 6 : 9;
  const inputAmount = quote ? Number(quote.inAmount) / 10 ** inputDecimals : null;
  const outputAmount = quote ? Number(quote.outAmount) / 10 ** outputDecimals : null;
  const inputAmountExact = quote ? formatTokenAmount(quote.inAmount, inputDecimals) : null;
  const outputAmountExact = quote ? formatTokenAmount(quote.outAmount, outputDecimals) : null;
  const minimumOutput = quote ? formatTokenAmount(minimumAmount(quote.outAmount, slippage), outputDecimals) : null;
  const priceImpact = Number(quote?.priceImpactPct ?? 0);
  const priceImpactPercent = priceImpact * 100;
  const quoteFresh = quotedAt !== null && quoteAge < quoteTtlMs;
  const tokenIsNew = token.createdAt !== undefined && token.createdAt <= Date.now() && Date.now() - token.createdAt < 7 * 24 * 60 * 60 * 1000;
  const warnings = [
    ...(riskUnavailable ? ["Risk scan is unavailable. Verify this token independently before trading."] : []),
    ...(token.verified === false ? ["This token is not verified by the market-data provider."] : []),
    ...(tokenIsNew ? [`This token was created ${relativeAge(token.createdAt!)}. Newly created tokens can be especially volatile.`] : []),
    ...(risk && risk.score < 40 ? ["RugCheck reports a high-risk score."] : []),
    ...(risk && !risk.mintAuthorityDisabled ? ["Mint authority is active."] : []),
    ...(risk && !risk.freezeAuthorityDisabled ? ["Freeze authority is active."] : []),
    ...(risk && risk.topHolderPct >= 10 ? ["One holder controls 10% or more of supply."] : []),
    ...(risk && risk.topTenPct >= 50 ? ["The top ten holders control 50% or more of supply."] : []),
    ...(token.liquidity !== undefined && token.liquidity < 100_000 ? ["Liquidity is below $100k; price movement can be sharp."] : []),
    ...(quote && priceImpactPercent >= 1 ? [`Route price impact is ${priceImpactPercent.toFixed(2)}%.`] : []),
  ];
  const requestQuote = useCallback(async (refresh: boolean | unknown = false) => {
    setMessage("");
    if (refresh !== true) clear();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setMessage("Enter an amount greater than zero.");
    if (!publicKey) { try { await connect(); } catch (error) { setMessage(error instanceof Error ? error.message : "Connect a wallet to trade."); } return; }
    if (side === "Sell" && risk?.decimals === undefined) return setMessage("Token metadata is still loading.");
    setBusy(true);
    try {
      const fresh = await getJupiterQuote(side === "Buy" ? SOL_MINT : token.address, side === "Buy" ? token.address : SOL_MINT, String(Math.round(value * 10 ** inputDecimals)), slippage, publicKey);
      const nextSimulation = await simulateJupiterSwap(fresh);
      setQuote(fresh);
      setSimulation(nextSimulation);
      setQuotedAt(Date.now());
      setAcknowledledged(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not fetch and simulate the quote."); }
    finally { setBusy(false); }
  }, [amount, connect, inputDecimals, publicKey, risk?.decimals, side, slippage, token.address]);

  useEffect(() => {
    if (!quotedAt) return;
    const updateAge = () => setQuoteAge(Date.now() - quotedAt);
    updateAge();
    const timer = window.setInterval(updateAge, 1_000);
    return () => window.clearInterval(timer);
  }, [quotedAt]);

  useEffect(() => {
    if (!quote || !publicKey) return;
    const timer = window.setTimeout(() => void requestQuote(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [publicKey, quote, requestQuote]);

  const confirm = async () => {
    if (!quoteFresh) return setMessage("The live quote expired. Wait for the refreshed quote and simulation before signing.");
    if (!quote || !simulation?.ok || !acknowledged || !signTransaction) return setMessage("Review the successful simulation and acknowledge the trade risk before signing.");
    setBusy(true); setMessage(""); setSignature("");
    try { setSignature(await executeJupiterSwap(quote, signTransaction)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Swap failed. No transaction was sent if you rejected signing."); }
    finally { setBusy(false); }
  };
  return <section className="trade-panel">
    <div className="panel-title"><strong>Swap</strong><span className="route-status"><i /> Jupiter route</span></div>
    <div className="trade-tabs">{(["Buy", "Sell"] as const).map(item => <button key={item} className={(side === item ? "active " : "") + item.toLowerCase()} onClick={() => { setSide(item); clear(); setMessage(""); }}>{item}</button>)}</div>
    <div className="amount-label"><span>You {side === "Buy" ? "pay" : "sell"}</span><span>{side === "Buy" ? "SOL" : token.symbol}</span></div>
    <div className="amount-input"><input type="number" min="0" step="any" value={amount} onChange={event => { setAmount(event.target.value); clear(); }} /><span>{side === "Buy" ? "SOL" : token.symbol}</span></div>
    <div className="quick-amounts">{(side === "Buy" ? ["0.1", "0.5", "1"] : ["1000", "10000", "100000"]).map(value => <button key={value} onClick={() => { setAmount(value); clear(); }}>{value}</button>)}</div>
    <div className="amount-label output-label"><span>You {side === "Buy" ? "receive" : "get"}</span><span className="estimate">{quote ? "SIMULATED QUOTE" : "REQUEST A QUOTE"}</span></div>
    <div className="output-box"><strong>{outputAmount === null ? "—" : outputAmount.toLocaleString("en-US", { maximumFractionDigits: 9 })}</strong><span>{side === "Buy" ? token.symbol : "SOL"}</span></div>
    <div className="slippage-row"><span>Slippage tolerance</span><div>{[50, 100, 300].map(value => <button key={value} className={slippage === value ? "selected" : ""} onClick={() => { setSlippage(value); clear(); }}>{value / 100}%</button>)}</div></div>
    <div className="quote-details"><span>Price impact <strong className={priceImpact > .05 ? "negative" : "positive"}>{quote ? priceImpact.toFixed(2) + "%" : "—"}</strong></span><span>Slippage <strong>{(slippage / 100).toFixed(2)}%</strong></span></div>
    {quote && <div className="trade-review" role="status"><strong>Review before signing</strong><span>Exact input <b>{inputAmount?.toLocaleString("en-US", { maximumFractionDigits: 9 })} {side === "Buy" ? "SOL" : token.symbol}</b></span><span>Expected output <b>{outputAmount?.toLocaleString("en-US", { maximumFractionDigits: 9 })} {side === "Buy" ? token.symbol : "SOL"}</b></span><span>Jupiter route <b>{quote.router ?? "Not reported"}</b></span><span>Fee <b>{quote.feeBps !== undefined ? String(quote.feeBps) + " bps" + (quote.feeMint ? " · " + short(quote.feeMint) : "") : "Not reported"}</b></span><span>Simulation <b className={simulation?.ok ? "positive" : "negative"}>{simulation?.ok ? "Passed" + (simulation.unitsConsumed ? " · " + simulation.unitsConsumed.toLocaleString() + " units" : "") : simulation ? "Failed — request a new quote" : "Checking"}</b></span>{simulation?.error && <small>{simulation.error}</small>}</div>}
    {quote && <div className="trade-review trade-review-live" role="status"><strong>Live pre-sign review</strong><span>Exact input <b>{inputAmountExact} {side === "Buy" ? "SOL" : token.symbol}</b></span><span>Expected output <b>{outputAmountExact} {side === "Buy" ? token.symbol : "SOL"}</b></span><span>Minimum received <b>{minimumOutput} {side === "Buy" ? token.symbol : "SOL"}</b></span><span>Price impact <b className={priceImpactPercent >= 1 ? "negative" : "positive"}>{priceImpactPercent.toFixed(2)}%</b></span><span>Jupiter route <b>{quote.router ?? "Jupiter aggregator"}</b></span><span>Fee mint <b>{quote.feeMint ? short(quote.feeMint) : quote.platformFee?.feeMint ? short(quote.platformFee.feeMint) : "None reported"}</b></span><span>Token verification <b className={token.verified === false ? "negative" : token.verified ? "positive" : ""}>{token.verified === true ? "Verified" : token.verified === false ? "Unverified" : "Not reported"}</b></span><span>Simulation <b className={simulation?.ok ? "positive" : "negative"}>{simulation?.ok ? "Passed" + (simulation.unitsConsumed ? " · " + simulation.unitsConsumed.toLocaleString() + " units" : "") : simulation ? "Failed — request a new quote" : "Checking"}</b></span><span>Quote status <b className={quoteFresh ? "positive" : "negative"}>{quoteFresh ? `Live · refreshes in ${Math.max(0, Math.ceil((12_000 - quoteAge) / 1_000))}s` : "Expired — refreshing"}</b></span>{simulation?.error && <small>{simulation.error}</small>}</div>}
    {warnings.length > 0 && <div className="trade-warnings" role="alert"><strong>Trade warning</strong>{warnings.map(warning => <span key={warning}>{warning}</span>)}</div>}
    {quote && simulation?.ok && <label className="trade-acknowledgement"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledledged(event.target.checked)} /> I reviewed the output, fees, simulation, and risk warnings.</label>}
    <button className={"swap-button " + side.toLowerCase()} onClick={quote ? confirm : requestQuote} disabled={busy || Boolean(quote && (!simulation?.ok || !acknowledged || !quoteFresh))}>{busy ? (quote ? "Refreshing live route…" : "Fetching route…") : quote ? <><Wallet size={15} /> Confirm & sign</> : "Get quote"}</button>
    {message && <p className="trade-message" role="alert">{message}</p>}{signature && <a className="trade-success" href={"https://solscan.io/tx/" + signature} target="_blank" rel="noreferrer">Swap confirmed <ExternalLink size={12} /></a>}
  </section>;
}

function SafetyPanel({ risk, unavailable }: { risk: TokenRisk | null; unavailable: boolean }) {
  if (!risk) return <section className="safety-panel"><div className="panel-title"><strong>Rug checker</strong><span className="demo-chip">{unavailable ? "UNAVAILABLE" : "SCANNING"}</span></div><p className="risk-note">{unavailable ? "Safety data could not be verified. Do not treat this token as screened." : "Checking mint, liquidity, and holder data…"}</p></section>;
  const checks = [["Liquidity locked", (risk.liquidityLocked ? "Yes" : "No") + " · " + risk.liquidityLockedPct.toFixed(0) + "%", risk.liquidityLocked], ["Mint authority disabled", risk.mintAuthorityDisabled ? "Yes" : "No", risk.mintAuthorityDisabled], ["Freeze authority disabled", risk.freezeAuthorityDisabled ? "Yes" : "No", risk.freezeAuthorityDisabled], ["Top holder", risk.topHolderPct.toFixed(1) + "%", risk.topHolderPct < 10], ["Top 10 holders", risk.topTenPct.toFixed(1) + "%", risk.topTenPct < 30]] as const;
  return <section className="safety-panel"><div className="panel-title"><strong>Rug checker</strong><span className="demo-chip">RUGCHECK SCAN</span></div><div className="safety-score"><div className={"score-ring " + (risk.score >= 70 ? "good" : risk.score >= 40 ? "medium" : "bad")}><strong>{risk.score}</strong><small>/100</small></div><div><strong>{risk.score >= 70 ? "Lower risk" : risk.score >= 40 ? "Moderate risk" : "High risk"}</strong><span>RugCheck + Solana mint data</span></div></div><div className="safety-list">{checks.map(([label, value, good]) => <div key={label}><span>{label}</span><strong className={good ? "safe" : "unknown"}>{good ? <Check size={12} /> : <ShieldAlert size={12} />}{value}</strong></div>)}</div><p className="risk-note">This is a signal, not an audit or investment advice.</p></section>;
}

export default function TokenPage() {
  const { address } = useParams<{ address: string }>();
  const [token, setToken] = useState<MarketToken | null>(null);
  const [risk, setRisk] = useState<TokenRisk | null>(null);
  const [loading, setLoading] = useState(true);
  const [riskUnavailable, setRiskUnavailable] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy address");
  const [tradingMode, setTradingMode] = useState<TradingMode>("instant");
  useEffect(() => { setToken(null); setLoading(true); void fetchBirdeyeToken(address).then(setToken).finally(() => setLoading(false)); }, [address]);
  useEffect(() => { setRisk(null); setRiskUnavailable(false); void fetch("/api/rugcheck/" + encodeURIComponent(address)).then(response => response.ok ? response.json() as Promise<TokenRisk> : null).then(result => { setRisk(result); setRiskUnavailable(!result); }).catch(() => setRiskUnavailable(true)); }, [address]);
  if (!token && loading) return <main className="token-loading"><div className="loading-mark" /><strong>Loading token market</strong><span>Checking live market data</span><Link href="/">Back to markets</Link></main>;
  if (!token) return <main className="token-loading"><ShieldAlert size={26} /><strong>Token market unavailable</strong><span>This address could not be resolved to a tradeable Solana token.</span><Link href="/">Back to markets</Link></main>;
  const up = token.change >= 0;
  const copy = async () => { await navigator.clipboard.writeText(token.address); setCopyLabel("Copied"); window.setTimeout(() => setCopyLabel("Copy address"), 1600); };
  return <main className="token-page"><header className="token-topbar"><Link href="/" className="brand"><span className="brand-mark"><i /></span><span>SOL<span>GAIN</span></span></Link><nav><Link href="/">Markets</Link><Link href="/portfolio">Portfolio</Link><Link href="/watchlist">Watchlist</Link></nav><Link className="back-markets" href="/"><ArrowLeft size={14} /> Markets</Link></header><div className="token-layout"><div className="token-content"><div className="token-crumb"><Link href="/">Markets</Link><span>/</span><strong>{token.symbol}</strong></div><section className="token-hero"><div className="hero-identity"><span className="token-mark hero-mark" style={{ "--token-color": token.color } as React.CSSProperties}>{token.symbol.slice(0, 2)}</span><div><div className="hero-name"><h1>{token.name}</h1><span>{token.symbol}</span></div><div className="hero-address"><span>{short(token.address)}</span><button onClick={copy} aria-label={copyLabel}><Copy size={12} /></button><a href={"https://solscan.io/token/" + token.address} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a></div></div></div><div className="hero-price"><strong>{token.price < .01 ? "$" + token.price.toPrecision(4) : "$" + token.price.toFixed(4)}</strong><span className={up ? "positive" : "negative"}>{up ? "+" : ""}{token.change.toFixed(2)}% <small>{token.changeWindow.toUpperCase()}</small></span></div><div className="hero-metrics"><div><span>MARKET CAP</span><strong>{money(token.marketCap)}</strong></div><div><span>LIQUIDITY</span><strong>{token.liquidity === undefined ? "Not reported" : money(token.liquidity)}</strong></div><div><span>HOLDERS</span><strong>{token.holders?.toLocaleString() ?? "Not reported"}</strong></div></div></section><PriceChart address={token.address} /></div><aside className="token-sidebar"><section className="trade-mode-picker"><div className="panel-title"><strong>Choose trading mode</strong><span>{tradingMode === "instant" ? "WALLET-HELD" : "MANAGED VAULT"}</span></div><div><button className={tradingMode === "instant" ? "selected" : ""} onClick={() => setTradingMode("instant")}><strong>Instant swap</strong><small>Sign now. Funds stay in your wallet until execution.</small></button><button className={tradingMode === "strategy" ? "selected" : ""} onClick={() => setTradingMode("strategy")}><strong>Target / DCA</strong><small>Automate later with a limited Jupiter-managed deposit.</small></button></div></section>{tradingMode === "instant" ? <TradePanel token={token} risk={risk} riskUnavailable={riskUnavailable} /> : <TriggerStrategy token={token} decimals={risk?.decimals} />}<TokenAlerts token={token} /><SafetyPanel risk={risk} unavailable={riskUnavailable} /><div className="sidebar-link"><span>Trade at your own risk</span><a href={"https://birdeye.so/token/" + token.address + "?chain=solana"} target="_blank" rel="noreferrer">View on Birdeye <ArrowLeft size={12} /></a></div></aside></div></main>;
}
