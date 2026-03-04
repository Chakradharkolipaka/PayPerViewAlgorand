"use client";

import { PeraWalletConnect } from "@perawallet/connect";

type Listener = (accounts: string[] | null) => void;

// Single shared Pera instance for the whole app.
// IMPORTANT: Keep this module client-only.
export const peraWallet = new PeraWalletConnect();

let accounts: string[] | null = null;
let listeners: Set<Listener> | null = null;
let reconnectStarted = false;

function ensureListeners() {
  if (!listeners) listeners = new Set();
  return listeners;
}

function publish(next: string[] | null) {
  accounts = next;
  for (const l of ensureListeners()) l(accounts);
}

export function getAccountsSnapshot(): string[] | null {
  return accounts;
}

export function subscribeAccounts(listener: Listener): () => void {
  ensureListeners().add(listener);
  return () => {
    listeners?.delete(listener);
  };
}

export async function reconnectOnce(): Promise<string[] | null> {
  if (reconnectStarted) return accounts;
  reconnectStarted = true;

  try {
    const accs = await peraWallet.reconnectSession();
    publish(accs?.length ? accs : null);
    return accs?.length ? accs : null;
  } catch {
    publish(null);
    return null;
  }
}

export async function connectPera(): Promise<string[]> {
  const accs = await peraWallet.connect();
  publish(accs?.length ? accs : null);
  return accs;
}

export async function disconnectPera(): Promise<void> {
  try {
    await peraWallet.disconnect();
  } finally {
    publish(null);
  }
}
