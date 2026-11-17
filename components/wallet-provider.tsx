"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { VersionedTransaction } from "@solana/web3.js";

type PublicKeyLike = { toBase58?: () => string; toString: () => string };
type InjectedWallet = {
  publicKey?: PublicKeyLike | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKeyLike }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (transaction: VersionedTransaction) => Promise<VersionedTransaction>;
  on?: (event: "connect" | "disconnect" | "accountChanged", listener: (publicKey?: PublicKeyLike | null) => void) => void;
  off?: (event: "connect" | "disconnect" | "accountChanged", listener: (publicKey?: PublicKeyLike | null) => void) => void;
};

declare global {
  interface Window {
    solana?: InjectedWallet;
    phantom?: { solana?: InjectedWallet };
  }
}

type WalletContextValue = {
  publicKey: string;
  connecting: boolean;
  signTransaction?: (transaction: VersionedTransaction) => Promise<VersionedTransaction>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function walletAddress(publicKey?: PublicKeyLike | null) {
  return publicKey?.toBase58?.() ?? publicKey?.toString() ?? "";
}

function getInjectedWallet() {
  if (typeof window === "undefined") return undefined;
  return window.phantom?.solana ?? window.solana;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState("");
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    const wallet = getInjectedWallet();
    if (!wallet) throw new Error("Install a Phantom-compatible Solana wallet to connect.");
    setConnecting(true);
    try {
      const account = await wallet.connect();
      setPublicKey(walletAddress(account.publicKey));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const wallet = getInjectedWallet();
    await wallet?.disconnect?.();
    setPublicKey("");
  }, []);

  const signTransaction = useCallback(async (transaction: VersionedTransaction) => {
    const wallet = getInjectedWallet();
    if (!wallet?.signTransaction) throw new Error("This wallet cannot sign versioned transactions.");
    return wallet.signTransaction(transaction);
  }, []);

  useEffect(() => {
    const wallet = getInjectedWallet();
    if (!wallet) return;
    const setConnected = (key?: PublicKeyLike | null) => setPublicKey(walletAddress(key ?? wallet.publicKey));
    const setDisconnected = () => setPublicKey("");
    setConnected();
    wallet.on?.("connect", setConnected);
    wallet.on?.("accountChanged", setConnected);
    wallet.on?.("disconnect", setDisconnected);
    return () => {
      wallet.off?.("connect", setConnected);
      wallet.off?.("accountChanged", setConnected);
      wallet.off?.("disconnect", setDisconnected);
    };
  }, []);

  const value = useMemo<WalletContextValue>(() => ({
    publicKey,
    connecting,
    signTransaction,
    connect,
    disconnect,
  }), [connect, connecting, disconnect, publicKey, signTransaction]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useSolanaWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useSolanaWallet must be used inside WalletProvider.");
  return wallet;
}
