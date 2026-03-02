"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { PeraWalletConnect } from "@perawallet/connect";

export const peraWallet = new PeraWalletConnect();

export type WalletContextValue = {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

export const WalletContext = createContext<WalletContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    // Restore existing session if any.
    peraWallet
      .reconnectSession()
      .then((accounts) => {
        if (accounts?.length) setAddress(accounts[0]);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const connect = useCallback(async () => {
    const accounts = await peraWallet.connect();
    setAddress(accounts[0] ?? null);
  }, []);

  const disconnect = useCallback(async () => {
    peraWallet.disconnect();
    setAddress(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({ address, connect, disconnect }),
    [address, connect, disconnect]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
