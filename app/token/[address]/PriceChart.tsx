"use client";

import { AreaSeries, CandlestickSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

const ranges = ["5m", "15m", "1h", "4h"] as const;
const chartTypes = ["candles", "line"] as const;
type Range = (typeof ranges)[number];
type ChartType = (typeof chartTypes)[number];
type ChartState = "loading" | "live" | "reconnecting";
type OhlcvItem = { unixTime?: number; time?: number; o?: number; h?: number; l?: number; c?: number };

function readCandles(items: OhlcvItem[]) {
  return items.map(item => ({
    time: Number(item.unixTime ?? item.time) as UTCTimestamp,
    open: Number(item.o), high: Number(item.h), low: Number(item.l), close: Number(item.c),
  })).filter(item => Number.isFinite(item.time) && item.time > 0 && [item.open, item.high, item.low, item.close].every(value => Number.isFinite(value) && value > 0));
}

export default function PriceChart({ address }: { address: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("5m");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [state, setState] = useState<ChartState>("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const chart = createChart(element, {
      width: element.clientWidth, height: 300,
      layout: { background: { type: ColorType.Solid, color: "#131316" }, textColor: "#777780", fontFamily: "Inter, sans-serif" },
      grid: { vertLines: { color: "#202024" }, horzLines: { color: "#202024" } }, rightPriceScale: { borderColor: "#2a2a30" },
      timeScale: { borderColor: "#2a2a30", timeVisible: true, secondsVisible: false }, crosshair: { vertLine: { color: "#797184", labelBackgroundColor: "#38313f" }, horzLine: { color: "#797184", labelBackgroundColor: "#38313f" } },
    });
    const series = chartType === "candles"
      ? chart.addSeries(CandlestickSeries, { upColor: "#22e889", downColor: "#ff5f6d", borderVisible: false, wickUpColor: "#31f09a", wickDownColor: "#ff7480", priceLineColor: "#a78bfa" })
      : chart.addSeries(AreaSeries, { lineColor: "#a78bfa", topColor: "rgba(167,139,250,.22)", bottomColor: "rgba(167,139,250,0)", lineWidth: 2, priceLineColor: "#a78bfa" });
    let active = true;
    let hasData = false;
    let retryTimer: number | undefined;
    let abort: AbortController | undefined;
    const load = async () => {
      abort?.abort();
      abort = new AbortController();
      if (!hasData) setState("loading");
      try {
        const response = await fetch(`/api/market/chart/${encodeURIComponent(address)}?range=${range}`, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("Chart request failed");
        const payload = await response.json() as { data?: { items?: OhlcvItem[] } };
        const candles = readCandles(payload.data?.items ?? []);
        if (!candles.length) throw new Error("No chart data");
        if (!active) return;
        if (chartType === "candles") series.setData(candles);
        else series.setData(candles.map(item => ({ time: item.time, value: item.close })));
        if (!hasData) chart.timeScale().fitContent();
        hasData = true;
        setState("live");
        setUpdatedAt(new Date());
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setState("reconnecting");
      } finally {
        if (active) retryTimer = window.setTimeout(() => void load(), hasData ? 5_000 : 1_500);
      }
    };
    void load();
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) chart.applyOptions({ width }); });
    observer.observe(element);
    return () => { active = false; abort?.abort(); if (retryTimer) window.clearTimeout(retryTimer); observer.disconnect(); chart.remove(); };
  }, [address, chartType, range]);

  const label = state === "live" ? `Birdeye live refresh · ${updatedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "syncing"}` : "Reconnecting to live chart data";
  return <section className="chart-panel"><div className="chart-heading"><div><strong>Price action</strong><span>USD · {range} intervals</span></div><div className="chart-controls"><div className="chart-types" role="tablist" aria-label="Chart type">{chartTypes.map(item => <button key={item} role="tab" aria-selected={chartType === item} className={chartType === item ? "selected" : ""} onClick={() => setChartType(item)}>{item === "candles" ? "Candles" : "Line"}</button>)}</div><div className="chart-ranges" role="tablist" aria-label="Chart timeframe">{ranges.map(item => <button key={item} role="tab" aria-selected={range === item} className={range === item ? "selected" : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div></div><div className="chart-wrap"><div ref={host} className="chart-canvas" />{state === "loading" && <div className="chart-loader" aria-label="Loading chart"><i /></div>}</div><div className="chart-foot"><span><i className={state === "live" ? "" : "reconnecting"} /> {state === "live" ? "LIVE FEED" : "RECONNECTING"}</span><span>{label}</span></div></section>;
}
