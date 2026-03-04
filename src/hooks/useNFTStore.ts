"use client";

import { useCallback, useSyncExternalStore } from "react";
import algosdk from "algosdk";

export type ChainNft = {
  assetId: number;
  owner: string;
  params: {
    name?: string;
    unitName?: string;
    url?: string;
  };
  metadata: any | null;
  registryData?: any;
};

type StoreState = {
  nfts: ChainNft[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
};

let state: StoreState = {
  nfts: [],
  isLoading: false,
  error: null,
  lastFetchedAt: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  emit();
}

function getSnapshot() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function safeFetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`metadata fetch failed: HTTP ${res.status}`);
  return res.json();
}

function normalizeAssetUrl(url?: string) {
  if (!url) return null;
  // Asset URL may be:
  // - an IPFS gateway URL (https://.../ipfs/...) -> fine
  // - ipfs://<cid>
  // - raw CID
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("ipfs://")) {
    const cid = trimmed.replace("ipfs://", "");
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }

  if (/^[a-zA-Z0-9]{46,}$/.test(trimmed) && !trimmed.startsWith("http")) {
    return `https://gateway.pinata.cloud/ipfs/${trimmed}`;
  }

  return trimmed;
}

async function fetchNftMetadataFromAssetUrl(assetUrl?: string) {
  const url = normalizeAssetUrl(assetUrl);
  if (!url) return null;

  try {
    return await safeFetchJson(url);
  } catch {
    // Keep the UI stable even if metadata is missing/cors-blocked.
    return null;
  }
}

export async function fetchUserNFTs(account: string): Promise<ChainNft[]> {
  setState({ isLoading: true, error: null });

  try {
    const indexer = new algosdk.Indexer("", "https://testnet-idx.algonode.cloud", "");

    const accountAssets = await indexer.lookupAccountAssets(account).do();
    const assets = (accountAssets as any)?.assets ?? [];

    // STEP 1 — filter likely NFTs (simple heuristic)
    const nftHoldings = assets.filter(
      (asset: any) =>
        asset?.amount === 1 &&
        asset?.["is-frozen"] === false &&
        Number(asset?.["asset-id"] ?? 0) > 0
    );

    const nfts = await Promise.all(
      nftHoldings.map(async (holding: any): Promise<ChainNft | null> => {
        const assetId = Number(holding["asset-id"]);
        if (!Number.isFinite(assetId) || assetId <= 0) return null;

        let assetInfo: any;
        try {
          assetInfo = await indexer.lookupAssetByID(assetId).do();
        } catch {
          return null;
        }

        const params = assetInfo?.asset?.params ?? {};
        const metadata = await fetchNftMetadataFromAssetUrl(params?.url);

        return {
          assetId,
          owner: account,
          params: {
            name: params?.name,
            unitName: params?.["unit-name"],
            url: params?.url,
          },
          metadata,
        };
      })
    );

    const cleaned = nfts.filter(Boolean) as ChainNft[];
    setState({ nfts: cleaned, isLoading: false, lastFetchedAt: Date.now() });
    return cleaned;
  } catch (e) {
    setState({
      isLoading: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

export function useNFTStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refreshNFTs = useCallback(async (account: string) => {
    return fetchUserNFTs(account);
  }, []);

  return {
    ...snapshot,
    refreshNFTs,
    fetchUserNFTs,
  };
}
