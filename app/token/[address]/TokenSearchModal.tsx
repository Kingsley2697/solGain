"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { searchBirdeyeTokens, type BirdeyeSearchToken } from "@/lib/birdeye";

export function TokenSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BirdeyeSearchToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Search by token name, ticker, or mint address.");
  useEffect(() => {
    if (query.trim().length < 2) { setItems([]); setMessage("Search by token name, ticker, or mint address."); return; }
    let active = true; const timer = window.setTimeout(() => {
      setLoading(true); void searchBirdeyeTokens(query.trim()).then(results => { if (active) { setItems(results); setMessage(results.length ? "" : "No Solana tokens matched that search."); } }).catch(() => { if (active) setMessage("Search is temporarily unavailable. Try again shortly."); }).finally(() => { if (active) setLoading(false); });
    }, 240);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  return <div className="token-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="token-modal token-search-modal" role="dialog" aria-modal="true" aria-label="Quick token search" onMouseDown={event => event.stopPropagation()}><header><div><span>QUICK TOKEN SEARCH</span><strong>Open a Solana market</strong></div><button onClick={onClose} aria-label="Close search"><X size={17} /></button></header><label className="terminal-search"><Search size={16} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, symbol, or mint" /></label><div className="token-search-results">{loading && <div className="search-skeleton"><i /><i /><i /></div>}{!loading && message && <p>{message}</p>}{items.map(item => <Link href={`/token/${item.address}`} key={item.address} onClick={onClose}><span className="search-token-mark">{item.symbol.slice(0, 2)}</span><span><strong>{item.name}</strong><small>{item.symbol} · {item.address.slice(0, 5)}…{item.address.slice(-4)}</small></span></Link>)}</div></section></div>;
}
