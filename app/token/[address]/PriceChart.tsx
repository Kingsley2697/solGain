"use client";

import { AreaSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

const ranges = ["5m", "15m", "1h", "4h"] as const;
type Range = (typeof ranges)[number];
type ChartState = "loading" | "live" | "unavailable";

export default function PriceChart({ address }: { address: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range>("5m");
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
    const series = chart.addSeries(AreaSeries, { lineColor: "#a78bfa", topColor: "rgba(167,139,250,.22)", bottomColor: "rgba(167,139,250,0)", lineWidth: 2, priceLineColor: "#a78bfa" });
    let active = true;
    let initial = true;
    const load = async () => {
      if (initial) setState("loading");
      try {
        const response = await fetch(`/api/market/chart/${encodeURIComponent(address)}?range=${range}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Chart request failed");
        const payload = await response.json();
        const points = (payload.data?.items ?? []).map((item: { unixTime: number; c: number }) => ({ time: item.unixTime as UTCTimestamp, value: Number(item.c) })).filter((item: { value: number }) => Number.isFinite(item.value) && item.value > 0);
        if (!points.length) throw new Error("No chart data");
        if (active) { series.setData(points); if (initial) chart.timeScale().fitContent(); setState("live"); setUpdatedAt(new Date()); initial = false; }
      } catch { if (active && initial) setState("unavailable"); }
    };
    void load();
    const refresh = window.setInterval(() => void load(), 10_000);
    const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width) chart.applyOptions({ width }); });
    observer.observe(element);
    return () => { active = false; window.clearInterval(refresh); observer.disconnect(); chart.remove(); };
  }, [address, range]);

  const label = state === "live" ? `Birdeye live refresh · ${updatedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "syncing"}` : state === "unavailable" ? "Live chart data unavailable" : "Loading live chart data";
  return <section className="chart-panel"><div className="chart-heading"><div><strong>Price action</strong><span>USD · {range} intervals</span></div><div className="chart-ranges" role="tablist" aria-label="Chart timeframe">{ranges.map(item => <button key={item} role="tab" aria-selected={range === item} className={range === item ? "selected" : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div><div className="chart-wrap"><div ref={host} className="chart-canvas" />{state === "loading" && <div className="chart-loader" aria-label="Loading chart"><i /></div>}{state === "unavailable" && <div className="chart-loader" role="status">Chart unavailable. Try another timeframe.</div>}</div><div className="chart-foot"><span><i /> {state === "live" ? "LIVE FEED" : "NO DATA"}</span><span>{label}</span></div></section>;
}
