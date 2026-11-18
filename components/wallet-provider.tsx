"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VersionedTransaction } from "@solana/web3.js";

type PublicKeyLike = { toBase58?: () => string; toString: () => string };
type InjectedWallet = {
  publicKey?: PublicKeyLike | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKeyLike }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction?: (transaction: VersionedTransaction) => Promise<VersionedTransaction>;
  on?: (event: "connect" | "disconnect" | "accountChanged", listener: (publicKey?: PublicKeyLike | null) => void) => void;
  off?: (event: "connect" | "disconnect" | "accountChanged", listener: (publicKey?: PublicKeyLike | null) => void) => void;
};

export type WalletOption = { id: string; name: string };
type DetectedWallet = WalletOption & { provider: InjectedWallet };

declare global {
  interface Window {
    solana?: InjectedWallet;
    phantom?: { solana?: InjectedWallet };
    solflare?: InjectedWallet;
    backpack?: { solana?: InjectedWallet };
  }
}

type WalletContextValue = {
  publicKey: string;
  connecting: boolean;
  wallets: WalletOption[];
  selectedWalletId: string;
  selectWallet: (walletId: string) => void;
  signTransaction?: (transaction: VersionedTransaction) => Promise<VersionedTransaction>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  connect: (walletId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function walletAddress(publicKey?: PublicKeyLike | null) {
  return publicKey?.toBase58?.() ?? publicKey?.toString() ?? "";
}

function findWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const candidates: DetectedWallet[] = [
    ...(window.phantom?.solana ? [{ id: "phantom", name: "Phantom", provider: window.phantom.solana }] : []),
    ...(window.solflare ? [{ id: "solflare", name: "Solflare", provider: window.solflare }] : []),
    ...(window.backpack?.solana ? [{ id: "backpack", name: "Backpack", provider: window.backpack.solana }] : []),
    ...(window.solana ? [{ id: "browser-wallet", name: "Browser wallet", provider: window.solana }] : []),
  ];
  const seen = new Set<InjectedWallet>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.provider)) return false;
    seen.add(candidate.provider);
    return true;
  });
}

function providerFor(walletId: string) {
  return findWallets().find(wallet => wallet.id === walletId)?.provider;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");

  useEffect(() => {
    const discover = () => {
      const wallets = findWallets();
      setDetectedWallets(wallets);
      setSelectedWalletId(current => wallets.some(wallet => wallet.id === current) ? current : wallets[0]?.id ?? "");
    };
    discover();
    window.addEventListener("load", discover);
    const retry = window.setTimeout(discover, 750);
    return () => { window.removeEventListener("load", discover); window.clearTimeout(retry); };
  }, []);

  const activeWallet = useMemo(() => detectedWallets.find(wallet => wallet.id === selectedWalletId)?.provider, [detectedWallets, selectedWalletId]);

  const selectWallet = useCallback((walletId: string) => {
    if (!providerFor(walletId)) throw new Error("That wallet is no longer available. Reopen the wallet picker.");
    setPublicKey("");
    setSelectedWalletId(walletId);
  }, []);

  const connect = useCallback(async (walletId?: string) => {
    const id = walletId ?? selectedWalletId;
    const wallet = providerFor(id) ?? activeWallet;
    if (!wallet) throw new Error("Install Phantom, Solflare, or Backpack to connect a Solana wallet.");
    setConnecting(true);
    try {
      const account = await wallet.connect();
      setPublicKey(walletAddress(account.publicKey));
    } finally { setConnecting(false); }
  }, [activeWallet, selectedWalletId]);

  const disconnect = useCallback(async () => {
    await activeWallet?.disconnect?.();
    setPublicKey("");
  }, [activeWallet]);

  const signTransaction = useCallback(async (transaction: VersionedTransaction) => {
    if (!activeWallet?.signTransaction) throw new Error("This wallet cannot sign versioned transactions.");
    return activeWallet.signTransaction(transaction);
  }, [activeWallet]);

  const signMessage = useCallback(async (message: Uint8Array) => {
    if (!activeWallet?.signMessage) throw new Error("This wallet does not support message signing.");
    return activeWallet.signMessage(message);
  }, [activeWallet]);

  useEffect(() => {
    if (!activeWallet) return;
    const setConnected = (key?: PublicKeyLike | null) => setPublicKey(walletAddress(key ?? activeWallet.publicKey));
    const setDisconnected = () => setPublicKey("");
    setConnected();
    activeWallet.on?.("connect", setConnected);
    activeWallet.on?.("accountChanged", setConnected);
    activeWallet.on?.("disconnect", setDisconnected);
    return () => {
      activeWallet.off?.("connect", setConnected);
      activeWallet.off?.("accountChanged", setConnected);
      activeWallet.off?.("disconnect", setDisconnected);
    };
  }, [activeWallet]);

  const wallets = useMemo<WalletOption[]>(() => detectedWallets.map(({ id, name }) => ({ id, name })), [detectedWallets]);
  const value = useMemo<WalletContextValue>(() => ({ publicKey, connecting, wallets, selectedWalletId, selectWallet, signTransaction, signMessage, connect, disconnect }), [connect, connecting, disconnect, publicKey, selectWallet, selectedWalletId, signMessage, signTransaction, wallets]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useSolanaWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useSolanaWallet must be used inside WalletProvider.");
  return wallet;
}
