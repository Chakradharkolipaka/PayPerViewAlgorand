"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WalletId,
  WalletManager,
} from "@txnlab/use-wallet";

import { NETWORK } from "@/lib/network";

export type WalletContextValue = {
  address: string | null;
  connect: (providerId: "kibisis" | "pera") => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sign a single Algorand txn (algosdk.Transaction) and return raw signed bytes. */
  signTxn: (txn: any) => Promise<Uint8Array | null>;
  /** Which wallet is active: 'kibisis' | 'pera' */
  provider: "kibisis" | "pera";
  /** Optional UI hooks for friendly toasts */
  isConnecting?: boolean;
};

export const WalletContext = createContext<WalletContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [provider, setProvider] = useState<"kibisis" | "pera">("pera");
  const [isConnecting, setIsConnecting] = useState(false);

  const managerRef = useRef<WalletManager | null>(null);
  const connectedWalletIdRef = useRef<WalletId | null>(null);

  function getManager(): WalletManager {
    if (managerRef.current) return managerRef.current;

    // Note: WalletManager will validate availability at connect-time.
    const manager = new WalletManager({
      wallets: [
        {
          id: WalletId.KIBISIS,
          options: {},
        },
        {
          id: WalletId.PERA,
          options: {},
        },
      ],
    });

    managerRef.current = manager;
    return manager;
  }

  // Per requirements: do NOT auto reconnect or auto connect loops.

  const connect = useCallback(async (providerId: "kibisis" | "pera") => {
    setIsConnecting(true);
    try {
      const manager = getManager();

      const walletId = providerId === "kibisis" ? WalletId.KIBISIS : WalletId.PERA;
      const w = manager.getWallet(walletId);
      if (!w) throw new Error(`${providerId} wallet not available`);
      await w.connect();
      connectedWalletIdRef.current = walletId;
      setProvider(providerId);

      const active = manager.activeWallet;
      if (!active) throw new Error("Wallet connection failed.");

      const next = manager.activeAddress ?? null;
      if (!next) throw new Error("Connected wallet returned no accounts.");
      setAddress(next);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const manager = getManager();
    try {
      await manager.disconnect();
    } catch {
      // ignore
    }
    connectedWalletIdRef.current = null;
    setAddress(null);
  }, [provider]);

  const signTxn = useCallback(
    async (txn: any) => {
      const manager = getManager();
      const active = manager.activeWallet;
      if (!active) throw new Error("Wallet not connected");

      try {
        const result = await manager.signTransactions([txn]);
        const signed = Array.isArray(result) ? result[0] : (result as any);
        if (!signed) throw new Error("Wallet did not return a signed transaction");
        return signed;
      } catch (err) {
        // log once per runtime session
        if (!(globalThis as any).__WALLET_SIGN_LOGGED__) {
          (globalThis as any).__WALLET_SIGN_LOGGED__ = true;
          console.error("WALLET_SIGN_ERROR", err);
        }
        return null;
      }
    },
    [address, provider]
  );

  const value = useMemo<WalletContextValue>(
    () => ({ address, connect, disconnect, signTxn, provider, isConnecting }),
    [address, connect, disconnect, signTxn, provider, isConnecting]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
