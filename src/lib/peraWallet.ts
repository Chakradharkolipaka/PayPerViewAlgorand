"use client";

import { PeraWalletConnect } from "@perawallet/connect";

type Listener = (accounts: string[] | null) => void;

// Single shared Pera instance for the whole app.
// IMPORTANT: Keep this module client-only.
export const peraWallet = new PeraWalletConnect();

const LS_KEY = "ff.pera.accounts";

let accounts: string[] | null = null;
let listeners: Set<Listener> | null = null;
let reconnectStarted = false;

function ensureListeners() {
  if (!listeners) listeners = new Set();
  return listeners;
}

function publish(next: string[] | null) {
  accounts = next;

  // Persist most-recent session for fast hydration on refresh.
  // WalletConnect session restore can be async; this keeps UI responsive.
  try {
    if (typeof window !== "undefined") {
      if (next?.length) localStorage.setItem(LS_KEY, JSON.stringify(next));
      else localStorage.removeItem(LS_KEY);
    }
  } catch {
    // ignore storage errors
  }

  for (const l of ensureListeners()) l(accounts);
}

export function getAccountsSnapshot(): string[] | null {
  return accounts;
}

function hydrateFromStorageOnce() {
  if (accounts !== null) return;
  try {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string") && parsed.length) {
      accounts = parsed;
    }
  } catch {
    // ignore
  }
}

export function subscribeAccounts(listener: Listener): () => void {
  // Hydrate immediately so pages depending on `account` can fetch without waiting
  // for reconnectSession to resolve.
  hydrateFromStorageOnce();
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
