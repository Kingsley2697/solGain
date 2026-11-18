"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useSolanaWallet } from "@/components/wallet-provider";
import { getLocalWatchlist, getWatchlist, toggleWatchlist } from "@/lib/watchlist";

export function WatchlistButton({ address }: { address: string }) {
  const [saved, setSaved] = useState(false);
  const { publicKey: owner, signMessage } = useSolanaWallet();
  useEffect(() => {
    if (!owner) { setSaved(false); return; }
    setSaved(getLocalWatchlist(owner).includes(address));
    void getWatchlist(owner, signMessage).then(items => setSaved(items.includes(address)));
  }, [address, owner, signMessage]);
  const toggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!owner) return;
    const items = await toggleWatchlist(owner, address, signMessage);
    setSaved(items.includes(address));
    window.dispatchEvent(new CustomEvent("solgain:watchlist", { detail: items }));
  };
  return <button className={`watchlist-toggle ${saved ? "saved" : ""}`} onClick={toggle} disabled={!owner} aria-label={saved ? "Remove from watchlist" : "Add to watchlist"} title={owner ? saved ? "Remove from watchlist" : "Add to watchlist" : "Connect a wallet to use watchlists"}><Star size={14} fill={saved ? "currentColor" : "none"} /></button>;
}
