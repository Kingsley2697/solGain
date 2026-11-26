"use client";

import { ExternalLink, Flame, Globe2, MessageCircle, Newspaper, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketToken } from "@/lib/market";

type Community = { description?: string; links: { label: string; url: string }[]; pairUrl?: string; boosts: number; buys: number; sells: number; volume24h: number; liquidity: number; priceChange24h: number };
type State = "loading" | "live" | "unavailable";

function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value); }

export function TokenCommunityNews({ token }: { token: MarketToken }) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [state, setState] = useState<State>("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(current => current === "live" ? current : "loading");
    setRefreshing(true);

    try {
      const response = await fetch(`/api/market/community/${encodeURIComponent(token.address)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Community data is unavailable.");
      const payload = await response.json() as { community?: Community; fetchedAt?: number };
      if (!payload.community) throw new Error("Community data is unavailable.");
      if (controller.signal.aborted) return;
      setCommunity(payload.community);
      setUpdatedAt(new Date(payload.fetchedAt ?? Date.now()));
      setState("live");
    } catch {
      if (!controller.signal.aborted) {
        setCommunity(null);
        setState("unavailable");
      }
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, [token.address]);
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearInterval(interval);
      request.current?.abort();
    };
  }, [load]);

  const change = community?.priceChange24h ?? token.change;
  const up = change >= 0;
  const tradeImbalance = community ? community.buys - community.sells : 0;
  const explanation = !community ? null : [
    `${up ? "Price is rising" : "Price is falling"} ${Math.abs(change).toFixed(2)}% over 24h.`,
    community.volume24h > 0 ? `${money(community.volume24h)} has traded in the last 24h.` : null,
    community.buys || community.sells ? `${community.buys.toLocaleString()} buys vs ${community.sells.toLocaleString()} sells (${tradeImbalance >= 0 ? "buy" : "sell"} pressure).` : null,
    community.boosts > 0 ? `${community.boosts} active DexScreener boost${community.boosts === 1 ? "" : "s"} is increasing visibility.` : null,
    community.liquidity > 0 ? `${money(community.liquidity)} liquidity is currently available.` : null,
  ].filter((item): item is string => Boolean(item));

  const searchUrl = `https://news.google.com/search?q=${encodeURIComponent(`${token.name} ${token.symbol} Solana crypto`)}&hl=en-US&gl=US&ceid=US:en`;

  return <section className="community-news-panel" aria-label={`${token.name} news and market drivers`}>
    <div className="community-heading"><div><span>NEWS & MARKET CONTEXT</span><strong>What&apos;s moving {token.symbol}</strong></div><button type="button" onClick={() => void load()} disabled={refreshing} aria-label="Refresh token news and market signals"><RefreshCw size={13} className={refreshing ? "spinning" : ""} /></button></div>
    <div className="community-grid">
      <article className="token-news-headlines">
        <div className="mini-heading"><Newspaper size={14} /> Token news</div>
        <p>Find current headlines and coverage about {token.name} ({token.symbol}).</p>
        <a className="token-news-search" href={searchUrl} target="_blank" rel="noreferrer">Search Google News <ExternalLink size={11} /></a>
      </article>
      <article className="trend-reason">
        <div className="mini-heading"><Flame size={14} /> Market drivers</div>
        {state === "loading" && <div className="community-skeleton"><i /><i /></div>}
        {state === "unavailable" && <div className="token-news-empty"><strong>Market signals are unavailable right now.</strong><span>Try refreshing in a moment.</span></div>}
        {state === "live" && community && <><strong className={up ? "positive" : "negative"}>{up ? "Upward" : "Downward"} market momentum</strong><ul>{explanation?.map(item => <li key={item}>{item}</li>)}</ul><small>Based on DEX activity and visibility signals. These are possible market factors, not confirmed causes or investment advice.</small></>}
      </article>
      <article className="community-links">
        <div className="mini-heading"><Users size={14} /> Community</div>
        {state === "live" && community ? <>{community.description && <p>{community.description}</p>}<div className="community-link-list">{community.links.map(link => <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>{/twitter|telegram|discord/i.test(link.label) ? <MessageCircle size={13} /> : <Globe2 size={13} />} {link.label}<ExternalLink size={11} /></a>)}{!community.links.length && <span>No verified social links reported for this token.</span>}</div></> : <span>Verified token links are unavailable.</span>}
      </article>
    </div>
    <div className="community-news-foot"><span><i /> Headlines via Google News · DEX signals {updatedAt ? `· updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>{community?.pairUrl && <a href={community.pairUrl} target="_blank" rel="noreferrer">View market source <ExternalLink size={11} /></a>}</div>
  </section>;
}
