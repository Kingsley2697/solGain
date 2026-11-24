"use client";

import { ExternalLink, Flame, Globe2, MessageCircle, Newspaper, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { MarketToken } from "@/lib/market";

type Community = { description?: string; links: { label: string; url: string }[]; pairUrl?: string; boosts: number; buys: number; sells: number; volume24h: number; liquidity: number; priceChange24h: number };
type State = "loading" | "live" | "unavailable";

function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value); }

export function TokenCommunityNews({ token }: { token: MarketToken }) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [state, setState] = useState<State>("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = async () => {
    setState(current => current === "live" ? current : "loading");
    try {
      const response = await fetch(`/api/market/community/${encodeURIComponent(token.address)}`, { cache: "no-store" });
      const payload = await response.json() as { community?: Community; fetchedAt?: number };
      if (!response.ok || !payload.community) throw new Error("No community data");
      setCommunity(payload.community); setUpdatedAt(new Date(payload.fetchedAt ?? Date.now())); setState("live");
    } catch { setState("unavailable"); }
  };
  useEffect(() => { void load(); const interval = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(interval); }, [token.address]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return <section className="community-news-panel">
    <div className="community-heading"><div><span>LIVE COMMUNITY & NEWS</span><strong>What&apos;s moving {token.symbol}</strong></div><button type="button" onClick={() => void load()} disabled={state === "loading"} aria-label="Refresh community and news"><RefreshCw size={13} className={state === "loading" ? "spinning" : ""} /></button></div>
    {state === "loading" && <div className="community-skeleton"><i /><i /><i /></div>}
    {state === "unavailable" && <div className="community-empty"><Newspaper size={18} /><strong>Live community feed unavailable</strong><span>Social and trading signals will appear when the market provider has a profile for this token.</span><button onClick={() => void load()}>Try again</button></div>}
    {state === "live" && community && <><div className="community-grid"><article className="trend-reason"><div className="mini-heading"><Flame size={14} /> Why it&apos;s trending</div><strong className={up ? "positive" : "negative"}>{up ? "Upward" : "Downward"} market momentum</strong><ul>{explanation?.map(item => <li key={item}>{item}</li>)}</ul><small>Derived from live DEX trading and visibility signals — not news or investment advice.</small></article><article className="community-links"><div className="mini-heading"><Users size={14} /> Community</div>{community.description && <p>{community.description}</p>}<div className="community-link-list">{community.links.map(link => <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>{/twitter|telegram|discord/i.test(link.label) ? <MessageCircle size={13} /> : <Globe2 size={13} />} {link.label}<ExternalLink size={11} /></a>)}{!community.links.length && <span>No verified social links reported for this token.</span>}</div></article></div><div className="community-news-foot"><span><i /> Live DEX market & community profile {updatedAt ? `· updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>{community.pairUrl && <a href={community.pairUrl} target="_blank" rel="noreferrer">View market source <ExternalLink size={11} /></a>}</div></>}
  </section>;
}
