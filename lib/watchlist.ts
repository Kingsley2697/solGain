import { supabase } from "@/lib/supabase";

const storageKey = (owner: string) => `solgain:watchlist:${owner}`;
const legacyStorageKey = (owner: string) => `solpulse:watchlist:${owner}`;

function readLocal(owner: string): string[] {
  try {
    const saved = localStorage.getItem(storageKey(owner));
    const addresses = JSON.parse(saved ?? localStorage.getItem(legacyStorageKey(owner)) ?? "[]") as string[];
    if (!saved && addresses.length) writeLocal(owner, addresses);
    return addresses;
  }
  catch { return []; }
}

function writeLocal(owner: string, addresses: string[]) {
  localStorage.setItem(storageKey(owner), JSON.stringify(addresses));
}

export async function getWatchlist(owner: string): Promise<string[]> {
  if (!supabase) return readLocal(owner);
  try {
    const { data, error } = await supabase.from("watchlists").select("token_address").eq("wallet_address", owner);
    if (error) throw error;
    const addresses = (data ?? []).map(row => row.token_address as string);
    writeLocal(owner, addresses);
    return addresses;
  } catch { return readLocal(owner); }
}

export async function toggleWatchlist(owner: string, address: string): Promise<string[]> {
  const current = await getWatchlist(owner);
  const exists = current.includes(address);
  const next = exists ? current.filter(item => item !== address) : [...current, address];
  writeLocal(owner, next);
  if (supabase) {
    try {
      const { error } = exists
        ? await supabase.from("watchlists").delete().eq("wallet_address", owner).eq("token_address", address)
        : await supabase.from("watchlists").upsert({ wallet_address: owner, token_address: address }, { onConflict: "wallet_address,token_address" });
      if (error) throw error;
    } catch { return next; }
  }
  return next;
}

