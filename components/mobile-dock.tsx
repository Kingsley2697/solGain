"use client";

import Link from "next/link";
import { Bookmark, ChartNoAxesCombined, LayoutGrid, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { activeTokenChanged, getActiveToken } from "@/lib/active-token";
import { SOL_MINT } from "@/lib/jupiter";

type MobileSection = "markets" | "chart" | "portfolio" | "watchlist";

export function MobileDock({ active, activeToken }: { active: MobileSection; activeToken?: string }) {
  const [chartToken, setChartToken] = useState(activeToken ?? SOL_MINT);
  useEffect(() => {
    setChartToken(activeToken ?? getActiveToken());
  }, [activeToken]);
  useEffect(() => {
    const update = (event: Event) => setChartToken((event as CustomEvent<string>).detail || getActiveToken());
    window.addEventListener(activeTokenChanged, update);
    return () => window.removeEventListener(activeTokenChanged, update);
  }, []);
  return <nav className="mobile-dock" aria-label="Mobile navigation">
    <Link href="/" className={active === "markets" ? "dock-active" : ""}><LayoutGrid size={17} /><span>Markets</span></Link>
    <Link href={`/token/${chartToken}`} className={active === "chart" ? "dock-active" : ""}><ChartNoAxesCombined size={17} /><span>Chart</span></Link>
    <Link href="/portfolio" className={active === "portfolio" ? "dock-active" : ""}><Wallet size={17} /><span>Portfolio</span></Link>
    <Link href="/watchlist" className={active === "watchlist" ? "dock-active" : ""}><Bookmark size={17} /><span>Watchlist</span></Link>
  </nav>;
}
