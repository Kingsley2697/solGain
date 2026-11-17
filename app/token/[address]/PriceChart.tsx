"use client";

import { AreaSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

const ranges = ["5m", "15m", "1h", "4h"] as const;
type Range = (typeof ranges)[number];
type ChartState = "loading" | "live" | "preview" | "unavailable";

function previewPoints(address: string, price: number, intervalSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  let value = price || 1;
  return Array.from({ length: 72 }, (_, index) => {
    const wave = Math.sin(index * 0.31 + address.length) * 0.012 + Math.cos(index * 0.09) * 0.008;
    value = Math.max(value * (1 + wave), 0.00000001);
    return { time: (now - (71 - index) * intervalSeconds) as UTCTimestamp, value };
  });
}

export default function PriceChart({ address, price }: { address: string; price: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("5m");
  const [state, setState] = useState<ChartState>("loading");

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const chart = createChart(element, { width: element.clientWidth, height: 300, layout: { background: { type: ColorType.Solid, color: "#131316" }, textColor: "#777780", fontFamily: "Inter, sans-serif" }, grid: { vertLines: { color: "#202024" }, horzLines: { color: "#202024" } }, rightPriceScale: { borderColor: "#2a2a30" }, timeScale: { borderColor: "#2a2a30", timeVisible: true, secondsVisible: false }, crosshair: { vertLine: { color: "#797184", labelBackgroundColor: "#38313f" }, horzLine: { color: "#797184", labelBackgroundColor: "#38313f" } } });
    const series = chart.addSeries(AreaSeries, { lineColor: "#a78bfa", topColor: "rgba(167,139,250,.22)", bottomColor: "rgba(167,139,250,0)", lineWidth: 2, priceLineColor: "#a78bfa" });
    let active = true;
    const intervalSeconds = range === "5m" ? 300 : range === "15m" ? 900 : range === "1h" ? 3600 : 14400;
    const load = async () => {
      setState("loading");
      const apiKey = process.env.NEXT_PUBLIC_BIRDEYE_API_KEY;
      if (!apiKey) {
        if (active) { series.setData(previewPoints(address, price, intervalSeconds)); chart.timeScale().fitContent(); setState("preview"); }
        return;
      }
      try {
        const now = Math.floor(Date.now() / 1000);
        const params = new URLSearchParams({ address, type: range, time_from: String(now - intervalSeconds * 72), time_to: String(now) });
        const response = await fetch(`https://public-api.birdeye.so/defi/ohlcv?${params}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" } });
        if (!response.ok) throw new Error("Chart request failed");
        const payload = await response.json();
        const points = (payload.data?.items ?? []).map((item: { unixTime: number; c: number }) => ({ time: item.unixTime as UTCTimestamp, value: Number(item.c) })).filter((item: { value: number }) => item.value > 0);
        if (!points.length) throw new Error("No chart data");
        if (active) { series.setData(points); chart.timeScale().fitContent(); setState("live"); }
      } catch {
        if (active) setState("unavailable");
      }
    };
    void load();
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) chart.applyOptions({ width }); });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); chart.remove(); };
  }, [address, price, range]);

  const label = state === "live" ? "Chart data from Birdeye" : state === "preview" ? "Simulated preview chart" : state === "unavailable" ? "Live chart data unavailable" : "Loading chart data";
  return <section className="chart-panel"><div className="chart-heading"><div><strong>Price action</strong><span>USD · {range} intervals</span></div><div className="chart-ranges" role="tablist" aria-label="Chart timeframe">{ranges.map(item => <button key={item} role="tab" aria-selected={range === item} className={range === item ? "selected" : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div><div className="chart-wrap"><div ref={host} className="chart-canvas" />{state === "loading" && <div className="chart-loader" aria-label="Loading chart"><i /></div>}{state === "unavailable" && <div className="chart-loader" role="status">Chart unavailable. Try another timeframe.</div>}</div><div className="chart-foot"><span><i /> {state === "live" ? "LIVE PRICE" : state === "preview" ? "PREVIEW" : "NO DATA"}</span><span>{label}</span></div></section>;
}
