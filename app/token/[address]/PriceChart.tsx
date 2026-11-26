"use client";

import { AreaSeries, BaselineSeries, CandlestickSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { Expand, LineChart, Settings2 } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { MarketToken } from "@/lib/market";
import { TokenCommunityNews } from "./TokenCommunityNews";

const ranges = ["1h", "24h", "7d", "30d", "90d", "1y", "All"] as const;
const periods = ["24h", "7d", "30d", "YTD"] as const;
type Range = (typeof ranges)[number];
type Period = (typeof periods)[number];
type ChartType = "area" | "candles";
type ChartState = "loading" | "live" | "reconnecting" | "unavailable";
type OhlcvItem = { unixTime?: number; time?: number; o?: number; h?: number; l?: number; c?: number; v?: number };

function readCandles(items: OhlcvItem[]) {
  return items.map(item => ({ time: Number(item.unixTime ?? item.time) as UTCTimestamp, open: Number(item.o), high: Number(item.h), low: Number(item.l), close: Number(item.c), volume: Number(item.v) })).filter(item => Number.isFinite(item.time) && item.time > 0 && [item.open, item.high, item.low, item.close].every(value => Number.isFinite(value) && value > 0));
}

function compact(value?: number) {
  return value === undefined || !Number.isFinite(value) ? "Not reported" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export default function PriceChart({ address, token }: { address: string; token: MarketToken }) {
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("24h");
  const [chartType, setChartType] = useState<ChartType>("area");
  const [state, setState] = useState<ChartState>("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("24h");
  const [periodPerformance, setPeriodPerformance] = useState<number | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const chart = createChart(element, { width: element.clientWidth, height: element.clientHeight || 338, layout: { background: { type: ColorType.Solid, color: "#09100b" }, textColor: "#78907f", fontFamily: "var(--font-mono), monospace" }, grid: { vertLines: { color: showGrid ? "#14231a" : "transparent" }, horzLines: { color: showGrid ? "#14231a" : "transparent" } }, rightPriceScale: { borderColor: "#1b3022", mode: logScale ? 1 : 0 }, timeScale: { borderColor: "#1b3022", timeVisible: true, secondsVisible: false }, crosshair: { vertLine: { color: "#50745d", labelBackgroundColor: "#173424" }, horzLine: { color: "#50745d", labelBackgroundColor: "#173424" } } });
    const candleSeries = chartType === "candles" ? chart.addSeries(CandlestickSeries, { upColor: "#14f195", downColor: "#ff6b7a", borderVisible: false, wickUpColor: "#55ffc0", wickDownColor: "#ff91a0" }) : null;
    const priceSeries = chartType === "area" ? (showBaseline ? chart.addSeries(BaselineSeries, { baseValue: { type: "price", price: token.price || 1 }, topLineColor: "#14f195", topFillColor1: "rgba(20,241,149,.28)", topFillColor2: "rgba(20,241,149,.02)", bottomLineColor: "#ff6b7a", bottomFillColor1: "rgba(255,107,122,.02)", bottomFillColor2: "rgba(255,107,122,.25)", lineWidth: 2, priceLineVisible: false }) : chart.addSeries(AreaSeries, { lineColor: token.change >= 0 ? "#14f195" : "#ff6b7a", topColor: token.change >= 0 ? "rgba(20,241,149,.25)" : "rgba(255,107,122,.25)", bottomColor: "rgba(9,16,11,0)", lineWidth: 2, priceLineVisible: false })) : null;
    let active = true; let hasData = false; let retryTimer: number | undefined; let abort: AbortController | undefined;
    const load = async () => {
      abort?.abort(); abort = new AbortController(); if (!hasData) setState("loading");
      try {
        const response = await fetch(`/api/market/chart/${encodeURIComponent(address)}?range=${range}`, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("Chart request failed");
        const payload = await response.json() as { data?: { items?: OhlcvItem[] } }; const candles = readCandles(payload.data?.items ?? []);
        if (!candles.length) throw new Error("No chart data"); if (!active) return;
        candleSeries?.setData(candles);
        if (priceSeries) { const baseline = candles[0]?.close ?? token.price; if (showBaseline && "applyOptions" in priceSeries) priceSeries.applyOptions({ baseValue: { type: "price", price: baseline } }); priceSeries.setData(candles.map(item => ({ time: item.time, value: item.close }))); }
        const now = Date.now();
        const periodStart = period === "24h" ? now - 86_400_000 : period === "7d" ? now - 7 * 86_400_000 : period === "30d" ? now - 30 * 86_400_000 : new Date(new Date().getFullYear(), 0, 1).getTime();
        const periodOpen = candles.find(item => Number(item.time) * 1_000 >= periodStart)?.close;
        setPeriodPerformance(periodOpen ? ((candles[candles.length - 1].close - periodOpen) / periodOpen) * 100 : null);
        if (!hasData) chart.timeScale().fitContent(); hasData = true; setState("live"); setUpdatedAt(new Date());
      } catch (error) { if (!active || (error instanceof DOMException && error.name === "AbortError")) return; setState(hasData ? "reconnecting" : "unavailable"); }
      finally { if (active) retryTimer = window.setTimeout(() => void load(), hasData ? 5_000 : 20_000); }
    };
    void load();
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; const height = entries[0]?.contentRect.height; if (width && height) chart.applyOptions({ width, height }); }); observer.observe(element);
    return () => { active = false; abort?.abort(); if (retryTimer) window.clearTimeout(retryTimer); observer.disconnect(); chart.remove(); };
  }, [address, chartType, range, showBaseline, showGrid, logScale, token.change, token.price, period]);

  const up = token.change >= 0;
  const label = state === "live" ? `Live market refresh · ${updatedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "syncing"}` : state === "unavailable" ? "Historical data is unavailable for this timeframe" : "Reconnecting to live chart data";
  const insight = `${token.symbol} is ${up ? "up" : "down"} ${Math.abs(token.change).toFixed(2)}% over ${token.changeWindow}. ${token.volume24h ? `${compact(token.volume24h)} has traded in the last 24h` : "Volume is not reported"}${token.liquidity ? ` against ${compact(token.liquidity)} in liquidity` : ""}.`;
  const settingRows: [string, boolean, Dispatch<SetStateAction<boolean>>][] = [["Baseline", showBaseline, setShowBaseline], ["Gridlines", showGrid, setShowGrid], ["Log scale", logScale, setLogScale]];

  return <section className="chart-panel terminal-chart-panel">
    <button className="insight-strip" type="button" onClick={() => setInsightOpen(value => !value)} aria-expanded={insightOpen}><span><b>AI MARKET READ</b> Why is {token.symbol}&apos;s price {up ? "up" : "down"} today?</span><i>{insightOpen ? "−" : "+"}</i></button>
    {insightOpen && <div className="insight-detail"><strong>Live market signals</strong><p>{insight} Momentum follows the current 24h snapshot; use it as context, not investment advice.</p></div>}
    <div className="chart-heading"><div><strong>Price action</strong><span>USD · {range} view · {chartType === "area" ? "Baseline area" : "Candlesticks"}</span></div><div className="chart-controls"><div className="chart-types" role="tablist" aria-label="Chart type"><button role="tab" aria-selected={chartType === "area"} className={chartType === "area" ? "selected" : ""} onClick={() => setChartType("area")}><LineChart size={13} /> Area</button><button role="tab" aria-selected={chartType === "candles"} className={chartType === "candles" ? "selected" : ""} onClick={() => setChartType("candles")}>Candles</button></div><div className="chart-ranges" role="tablist" aria-label="Chart timeframe">{ranges.map(item => <button key={item} role="tab" aria-selected={range === item} className={range === item ? "selected" : ""} onClick={() => setRange(item)}>{item}</button>)}</div><div className="chart-settings"><button type="button" aria-label="Chart settings" onClick={() => setSettingsOpen(value => !value)}><Settings2 size={14} /></button>{settingsOpen && <div className="chart-settings-menu">{settingRows.map(([label, checked, setChecked]) => <label key={label}><span>{label}</span><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /></label>)}</div>}</div></div></div>
    <div className={"chart-wrap " + (fullscreen ? "chart-fullscreen" : "")}><button className="chart-expand" type="button" aria-label={fullscreen ? "Exit expanded chart" : "Expand chart"} onClick={() => setFullscreen(value => !value)}><Expand size={14} /><span>{fullscreen ? "Exit" : "Expand"}</span></button><div ref={host} className="chart-canvas" />{state === "loading" && <div className="chart-loader" aria-label="Loading chart"><i /><i /><i /></div>}{state === "unavailable" && <div className="chart-unavailable"><strong>No historical candles yet</strong><span>New or thinly traded tokens may not have {range} history. Try a shorter timeframe.</span><button onClick={() => setRange("24h")}>Show 24h</button></div>}</div>
    <div className="chart-foot"><span><i className={state === "live" ? "" : "reconnecting"} /> {state === "live" ? "LIVE FEED" : state === "unavailable" ? "HISTORY LIMITED" : "RECONNECTING"}</span><span>{label}</span></div>
    <div className="statistics-strip"><div className="statistics-heading"><strong>Statistics</strong><button type="button" onClick={() => setMetricsOpen(value => !value)}>{metricsOpen ? "Hide full metrics" : "Full metrics"}</button></div><div className="statistics-grid"><article><span>Market Cap</span><strong>{compact(token.marketCap)}</strong><small className={up ? "positive" : "negative"}>{up ? "+" : ""}{token.change.toFixed(2)}% 24h</small></article><article><span>24h Volume</span><strong>{compact(token.volume24h)}</strong><small>{token.liquidity ? `${compact(token.liquidity)} liquidity` : "Liquidity not reported"}</small></article><article><span>FDV</span><strong>{compact(token.fdv)}</strong><small>{token.fdv === undefined ? "Not reported" : "Provider reported"}</small></article><article className="performance-card"><span>Performance <select value={period} onChange={event => { const next = event.target.value as Period; setPeriod(next); setRange(next === "24h" ? "24h" : next === "7d" ? "7d" : next === "30d" ? "30d" : "All"); }} aria-label="Performance period">{periods.map(item => <option key={item}>{item}</option>)}</select></span><strong className={periodPerformance === null ? "" : periodPerformance >= 0 ? "positive" : "negative"}>{periodPerformance === null ? "—" : `${periodPerformance >= 0 ? "+" : ""}${periodPerformance.toFixed(2)}%`}</strong><small>{periodPerformance === null ? "History unavailable" : "From chart history"}</small></article></div>{metricsOpen && <div className="full-token-metrics"><span>Circulating supply <b>{token.circulatingSupply?.toLocaleString() ?? "Not reported"}</b></span><span>Total supply <b>{token.totalSupply?.toLocaleString() ?? "Not reported"}</b></span><span>Liquidity <b>{compact(token.liquidity)}</b></span><span>Holders <b>{token.holders?.toLocaleString() ?? "Not reported"}</b></span></div>}</div>
    <TokenCommunityNews token={token} />
  </section>;
}
