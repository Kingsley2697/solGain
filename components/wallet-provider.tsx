"use client";

import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useCallback, useContext, useMemo, createContext, type ReactNode } from "react";
import type { VersionedTransaction } from "@solana/web3.js";

export type WalletOption = { id: string; name: string; icon?: string };

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
  openWalletModal: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);
const rpcEndpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT ?? "https://api.mainnet-beta.solana.com";

function WalletBridge({ children }: { children: ReactNode }) {
  const { publicKey, connecting, wallet, wallets, select, connect: connectSelected, disconnect, signMessage, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const options = useMemo<WalletOption[]>(() => wallets.map(({ adapter }) => ({ id: adapter.name, name: adapter.name, icon: adapter.icon })), [wallets]);
  const selectWallet = useCallback((walletId: string) => select(walletId as WalletName), [select]);
  const openWalletModal = useCallback(() => setVisible(true), [setVisible]);
  const connect = useCallback(async (walletId?: string) => {
    if (walletId && walletId !== wallet?.adapter.name) {
      selectWallet(walletId);
      openWalletModal();
      return;
    }
    if (!wallet) {
      openWalletModal();
      return;
    }
    await connectSelected();
  }, [connectSelected, openWalletModal, selectWallet, wallet]);
  const signVersionedTransaction = useMemo(() => signTransaction ? async (transaction: VersionedTransaction) => signTransaction(transaction) as Promise<VersionedTransaction> : undefined, [signTransaction]);
  const value = useMemo<WalletContextValue>(() => ({
    publicKey: publicKey?.toBase58() ?? "",
    connecting,
    wallets: options,
    selectedWalletId: wallet?.adapter.name ?? "",
    selectWallet,
    signTransaction: signVersionedTransaction,
    signMessage,
    connect,
    disconnect,
    openWalletModal,
  }), [connect, connecting, disconnect, openWalletModal, options, publicKey, selectWallet, signMessage, signVersionedTransaction, wallet]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // WalletProvider adapts Wallet Standard wallets registered by Phantom,
  // Solflare, Backpack, and compatible mobile wallets without shipping an
  // all-wallet bundle. The modal provides wallet selection and connection UI.
  return <ConnectionProvider endpoint={rpcEndpoint}><SolanaWalletProvider wallets={[]} autoConnect><WalletModalProvider><WalletBridge>{children}</WalletBridge></WalletModalProvider></SolanaWalletProvider></ConnectionProvider>;
}

export function useSolanaWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useSolanaWallet must be used inside WalletProvider.");
  return wallet;
}
