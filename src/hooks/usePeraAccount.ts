"use client";

import { useEffect, useSyncExternalStore } from "react";

import { getAccountsSnapshot, reconnectOnce, subscribeAccounts } from "@/lib/peraWallet";

export function usePeraAccount(): {
  account: string | null;
  accounts: string[] | null;
} {
  const accounts = useSyncExternalStore(subscribeAccounts, getAccountsSnapshot, () => null);

  useEffect(() => {
    // Best-effort session restore.
    void reconnectOnce();
  }, []);

  const account = accounts?.[0] ?? null;
  return { account, accounts };
}
