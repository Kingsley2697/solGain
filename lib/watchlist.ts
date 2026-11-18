import { ensureWalletSession, type SignMessage } from "@/lib/wallet-auth-client";

const storageKey = (owner: string) => `solgain:watchlist:${owner}`;
const legacyStorageKey = (owner: string) => `solpulse:watchlist:${owner}`;
type RequestOptions = { method?: "PUT" | "DELETE"; tokenAddress?: string };

function readLocal(owner: string): string[] {
  try {
    const saved = localStorage.getItem(storageKey(owner));
    const addresses = JSON.parse(saved ?? localStorage.getItem(legacyStorageKey(owner)) ?? "[]") as string[];
    if (!saved && addresses.length) writeLocal(owner, addresses);
    return addresses;
  } catch { return []; }
}

function writeLocal(owner: string, addresses: string[]) {
  localStorage.setItem(storageKey(owner), JSON.stringify(addresses));
}

async function remoteRequest(owner: string, signMessage: SignMessage | undefined, options: RequestOptions = {}) {
  if (!await ensureWalletSession(owner, signMessage)) throw new Error("Sign the wallet message to sync your watchlist.");
  const response = await fetch(`/api/watchlist/${encodeURIComponent(owner)}`, {
    method: options.method ?? "GET",
    headers: options.tokenAddress ? { "Content-Type": "application/json" } : undefined,
    body: options.tokenAddress ? JSON.stringify({ tokenAddress: options.tokenAddress }) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as { addresses?: string[]; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Watchlist sync failed.");
  return payload;
}

export function getLocalWatchlist(owner: string): string[] {
  return readLocal(owner);
}

export async function getWatchlist(owner: string, signMessage?: SignMessage): Promise<string[]> {
  const local = readLocal(owner);
  if (!signMessage) return local;
  try {
    const remote = (await remoteRequest(owner, signMessage)).addresses ?? [];
    const addresses = Array.from(new Set([...local, ...remote]));
    await Promise.allSettled(local.filter(address => !remote.includes(address)).map(address => remoteRequest(owner, signMessage, { method: "PUT", tokenAddress: address })));
    writeLocal(owner, addresses);
    return addresses;
  } catch { return local; }
}

export async function toggleWatchlist(owner: string, address: string, signMessage?: SignMessage): Promise<string[]> {
  const current = readLocal(owner);
  const exists = current.includes(address);
  const next = exists ? current.filter(item => item !== address) : [...current, address];
  writeLocal(owner, next);
  if (signMessage) {
    try { await remoteRequest(owner, signMessage, { method: exists ? "DELETE" : "PUT", tokenAddress: address }); }
    catch { /* Local storage remains available while sync is unavailable. */ }
  }
  return next;
}
