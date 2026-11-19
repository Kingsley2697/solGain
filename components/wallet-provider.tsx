"use client";

import { getWallets } from "@wallet-standard/app";
import { StandardConnect, StandardDisconnect, StandardEvents, type StandardEventsFeature } from "@wallet-standard/features";
import { SolanaSignMessage, SolanaSignTransaction, type SolanaSignMessageFeature, type SolanaSignTransactionFeature } from "@solana/wallet-standard-features";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { SolanaMobileWalletAdapter, createDefaultAddressSelector, createDefaultAuthorizationResultCache, createDefaultWalletNotFoundHandler } from "@solana-mobile/wallet-adapter-mobile";

type MobileWallet = Pick<SolanaMobileWalletAdapter, "connect" | "disconnect" | "signMessage" | "signTransaction" | "publicKey">;
type NativePublicKey = { toBase58(): string };
type NativeWallet = { publicKey?: NativePublicKey | null; connect(): Promise<{ publicKey?: NativePublicKey } | void>; disconnect?(): Promise<void>; signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>; signMessage?(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array> };
type WalletEntry = { id: string; name: string; icon?: string; standard?: Wallet; native?: NativeWallet; mobile?: MobileWallet };
export type WalletOption = Pick<WalletEntry, "id" | "name" | "icon">;

type WalletContextValue = { publicKey: string; connecting: boolean; wallets: WalletOption[]; selectedWalletId: string; selectWallet: (walletId: string) => void; signTransaction?: (transaction: VersionedTransaction) => Promise<VersionedTransaction>; signMessage?: (message: Uint8Array) => Promise<Uint8Array>; connect: (walletId?: string) => Promise<void>; disconnect: () => Promise<void> };
const WalletContext = createContext<WalletContextValue | null>(null);
const solanaMainnet = "solana:mainnet";
const mobileAddress = (publicKey: MobileWallet["publicKey"]) => publicKey?.toBase58() ?? "";
let mobileWallet: MobileWallet | null = null;
const nativeWalletNames = new Set(["phantom", "solflare", "backpack"]);

declare global {
  interface Window {
    phantom?: { solana?: NativeWallet };
    solflare?: NativeWallet;
    backpack?: NativeWallet | { solana?: NativeWallet };
  }
}

function getMobileWallet(): MobileWallet | null {
  if (typeof window === "undefined" || !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return null;
  if (!mobileWallet) mobileWallet = new SolanaMobileWalletAdapter({
    addressSelector: createDefaultAddressSelector(),
    appIdentity: { name: "SolGain", uri: window.location.origin, icon: "/icon-192.png" },
    chain: solanaMainnet,
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
  return mobileWallet;
}

function discoverWallets(): WalletEntry[] {
  if (typeof window === "undefined") return [];
  const entries: WalletEntry[] = getWallets().get()
    .filter(wallet => wallet.chains.some(chain => String(chain).startsWith("solana:")) && nativeWalletNames.has(wallet.name.toLowerCase()))
    .map((wallet, index) => ({ id: `standard:${wallet.name}:${index}`, name: wallet.name, icon: wallet.icon, standard: wallet }));
  // Wallet Standard is preferred, with a narrowly-scoped fallback for the
  // three native Solana browser extensions. This keeps Phantom, Solflare, and
  // Backpack usable in browsers that delay or omit standard registration.
  const standardNames = new Set(entries.map(entry => entry.name.toLowerCase()));
  const backpack = window.backpack;
  const backpackSolana = backpack && "connect" in backpack ? backpack : backpack?.solana;
  const injected: Array<[string, NativeWallet | undefined]> = [
    ["Phantom", window.phantom?.solana],
    ["Solflare", window.solflare],
    ["Backpack", backpackSolana],
  ];
  for (const [name, native] of injected) if (native && !standardNames.has(name.toLowerCase())) entries.push({ id: `native:${name.toLowerCase()}`, name, native });
  const mobile = getMobileWallet();
  // The mobile adapter is a deep-link/session bridge for native mobile wallets.
  return [...entries, ...(mobile ? [{ id: "mobile-wallet", name: "Mobile Wallet", mobile }] : [])];
}

function feature<T>(wallet: Wallet, name: string) { return wallet.features[name as `${string}:${string}`] as T | undefined; }

export function WalletProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const registry = getWallets();
    const refresh = () => { const wallets = discoverWallets(); setEntries(wallets); setSelectedWalletId(current => wallets.some(wallet => wallet.id === current) ? current : wallets[0]?.id ?? ""); };
    refresh();
    const unregister = registry.on("register", refresh);
    const unregistration = registry.on("unregister", refresh);
    return () => { unregister(); unregistration(); };
  }, []);

  const selected = useMemo(() => entries.find(wallet => wallet.id === selectedWalletId), [entries, selectedWalletId]);
  const publicKey = account?.address ?? (selected?.native?.publicKey?.toBase58() ?? (selected?.mobile ? mobileAddress(selected.mobile.publicKey) : ""));
  const selectWallet = useCallback((walletId: string) => { if (!entries.some(wallet => wallet.id === walletId)) throw new Error("That wallet is no longer available. Open the wallet selector again."); setAccount(null); setSelectedWalletId(walletId); }, [entries]);

  const connect = useCallback(async (walletId?: string) => {
    const entry = entries.find(wallet => wallet.id === (walletId ?? selectedWalletId));
    if (!entry) throw new Error("No supported Solana wallet was found. Install Phantom, Solflare, or Backpack, then refresh this page.");
    setConnecting(true);
    try {
      if (entry.standard) {
        const connectFeature = feature<{ connect: () => Promise<{ accounts: readonly WalletAccount[] }> }>(entry.standard, StandardConnect);
        if (!connectFeature) throw new Error(`${entry.name} does not support Wallet Standard connection.`);
        const result = await connectFeature.connect();
        const connected = result.accounts.find(candidate => candidate.chains.includes(solanaMainnet)) ?? result.accounts[0];
        if (!connected) throw new Error(`${entry.name} did not return a Solana account.`);
        setAccount(connected);
      } else if (entry.native) {
        const result = await entry.native.connect();
        const address = result?.publicKey?.toBase58() ?? entry.native.publicKey?.toBase58() ?? "";
        if (!address) throw new Error(`${entry.name} did not return a Solana account.`);
        setAccount({ address, publicKey: new Uint8Array(), chains: [solanaMainnet], features: [] });
      } else if (entry.mobile) {
        await entry.mobile.connect();
        const address = mobileAddress(entry.mobile.publicKey);
        if (!address) throw new Error(`${entry.name} did not return a Solana account.`);
        setAccount({ address, publicKey: new Uint8Array(), chains: [solanaMainnet], features: [] });
      }
    } finally { setConnecting(false); }
  }, [entries, selectedWalletId]);

  useEffect(() => {
    if (!selected?.standard) return;
    const events = feature<StandardEventsFeature[typeof StandardEvents]>(selected.standard, StandardEvents);
    return events?.on("change", ({ accounts }) => {
      if (!accounts) return;
      const replacement = accounts.find(candidate => candidate.chains.includes(solanaMainnet)) ?? null;
      setAccount(replacement);
    });
  }, [selected]);

  const disconnect = useCallback(async () => { if (selected?.standard) await feature<{ disconnect: () => Promise<void> }>(selected.standard, StandardDisconnect)?.disconnect(); else if (selected?.native) await selected.native.disconnect?.(); else await selected?.mobile?.disconnect(); setAccount(null); }, [selected]);
  const signTransaction = useCallback(async (transaction: VersionedTransaction) => {
    if (selected?.standard && account) {
      const signer = feature<SolanaSignTransactionFeature[typeof SolanaSignTransaction]>(selected.standard, SolanaSignTransaction);
      if (!signer) throw new Error(`${selected.name} cannot sign transactions.`);
      const [result] = await signer.signTransaction({ account, chain: solanaMainnet, transaction: transaction.serialize() });
      if (!result) throw new Error("Wallet did not return a signed transaction.");
      return VersionedTransaction.deserialize(result.signedTransaction);
    }
    if (selected?.native) return selected.native.signTransaction(transaction);
    if (!selected?.mobile) throw new Error("This wallet cannot sign versioned transactions.");
    return selected.mobile.signTransaction(transaction);
  }, [account, selected]);
  const signMessage = useCallback(async (message: Uint8Array) => {
    if (selected?.standard && account) {
      const signer = feature<SolanaSignMessageFeature[typeof SolanaSignMessage]>(selected.standard, SolanaSignMessage);
      if (!signer) throw new Error(`${selected.name} does not support message signing.`);
      const [result] = await signer.signMessage({ account, message });
      if (!result) throw new Error("Wallet did not return a message signature.");
      return result.signature;
    }
    if (selected?.native?.signMessage) {
      const result = await selected.native.signMessage(message, "utf8");
      return result instanceof Uint8Array ? result : result.signature;
    }
    if (!selected?.mobile) throw new Error("This wallet does not support message signing.");
    return selected.mobile.signMessage(message);
  }, [account, selected]);

  const wallets = useMemo<WalletOption[]>(() => entries.map(({ id, name, icon }) => ({ id, name, icon })), [entries]);
  const value = useMemo<WalletContextValue>(() => ({ publicKey, connecting, wallets, selectedWalletId, selectWallet, signTransaction, signMessage, connect, disconnect }), [connect, connecting, disconnect, publicKey, selectWallet, selectedWalletId, signMessage, signTransaction, wallets]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useSolanaWallet() { const wallet = useContext(WalletContext); if (!wallet) throw new Error("useSolanaWallet must be used inside WalletProvider."); return wallet; }
