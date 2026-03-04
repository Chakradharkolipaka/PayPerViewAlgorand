"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import NFTCard from "@/components/NFTCard";
import SkeletonCard from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { fromMicroAlgos } from "@/lib/algorand";
import { useToast } from "@/components/ui/use-toast";
import { usePeraAccount } from "@/hooks/usePeraAccount";
import { useNFTStore } from "@/hooks/useNFTStore";

export interface NftData {
  tokenId: number;
  metadata: any;
  owner: string;
  totalDonations: bigint;
}

interface DonorStat {
  total: bigint;
  donations: { tokenId: number; amount: bigint; name?: string }[];
}

export default function Home() {
  const [nfts, setNfts] = useState<NftData[]>([]);
  const [hiddenTokenIds, setHiddenTokenIds] = useState<number[]>([]);
  const [donorStats, setDonorStats] = useState<Record<string, DonorStat>>({});
  const { toast } = useToast();
  const { account } = usePeraAccount();
  const { isLoading, error, nfts: chainNfts, refreshNFTs } = useNFTStore();

  useEffect(() => {
    let cancelled = false;

    if (!account) {
      setNfts([]);
      return () => {
        cancelled = true;
      };
    }

    toast({
      title: "Loading your NFTs...",
      description: "Fetching your on-chain assets from Algorand Indexer.",
    });

    refreshNFTs(account)
      .then(() => {
        if (cancelled) return;
        toast({
          title: "NFTs loaded",
          description: `Loaded ${chainNfts.length} NFTs.`,
        });
      })
      .catch((e) => {
        console.error("Failed to load account NFTs", e);
      });

    return () => {
      cancelled = true;
    };
  }, [account, refreshNFTs]);

  useEffect(() => {
    if (!account) return;
    if (error) {
      toast({
        title: "Failed to load NFTs",
        description: error,
        variant: "destructive",
      });
    }
  }, [account, error, toast]);

  useEffect(() => {
    // Merge chain NFTs into the existing UI model.
    // Registry / marketplace fields can be layered in later via `registryData`.
    const mapped: NftData[] = chainNfts.map((n) => ({
      tokenId: n.assetId,
      metadata: n.metadata ?? {
        name: n.params?.name,
        image: n.params?.url,
      },
      owner: n.owner,
      totalDonations: 0n,
    }));
    setNfts(mapped);
  }, [chainNfts]);

  const visibleNfts = useMemo(
    () => nfts.filter((nft) => !hiddenTokenIds.includes(nft.tokenId)),
    [nfts, hiddenTokenIds]
  );

  const totalDonationsAll = useMemo(
    () => visibleNfts.reduce((sum, nft) => sum + (nft.totalDonations ?? 0n), 0n),
    [visibleNfts]
  );

  const topDonatedNfts = useMemo(
    () => [...visibleNfts].sort((a, b) => Number(b.totalDonations) - Number(a.totalDonations)).slice(0, 10),
    [visibleNfts]
  );

  const topSupportedNames = useMemo(() => {
    if (topDonatedNfts.length === 0) return "No support yet";
    return topDonatedNfts
      .slice(0, 3)
      .map((nft) => nft.metadata?.name || `NFT #${nft.tokenId}`)
      .join(", ");
  }, [topDonatedNfts]);

  const handleDeleteNft = useCallback((tokenId: number) => {
    setHiddenTokenIds((prev) => (prev.includes(tokenId) ? prev : [...prev, tokenId]));
  }, []);

  const handleDonation = useCallback(
    ({ donor, amount, tokenId }: { donor: string; amount: bigint; tokenId: number }) => {
      setDonorStats((prev) => {
        const current = prev[donor] ?? { total: 0n, donations: [] };
        return {
          ...prev,
          [donor]: {
            total: current.total + amount,
            donations: [...current.donations, { tokenId, amount }],
          },
        };
      });
    },
    []
  );

  const isPageLoading = !!account && isLoading;

  return (
    <main className="container mx-auto px-4 py-10 space-y-10">
      <section className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">Explore impact NFTs</h1>
          <p className="text-muted-foreground max-w-xl text-sm md:text-base">
            Discover NFTs, support creators, and track the most supported drops in the community.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-slate-800/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">NFTs</p>
            <p className="text-lg font-semibold">{visibleNfts.length}</p>
          </div>
          <div className="rounded-xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-emerald-900/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Total fan donations</p>
            <p className="text-lg font-semibold">{fromMicroAlgos(totalDonationsAll)} ALGO</p>
          </div>
          <div className="rounded-xl border bg-card dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-indigo-900/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Top supported</p>
            <p className="text-sm font-semibold truncate">{topSupportedNames}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">All NFTs</h2>
          <Button asChild>
            <Link href="/mint">Mint NFT</Link>
          </Button>
        </div>

        {isPageLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : visibleNfts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibleNfts.map((nft) => (
              <NFTCard key={nft.tokenId} nft={nft} onDelete={handleDeleteNft} onDonation={handleDonation} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-10 text-center">
            <h3 className="text-lg font-semibold">No NFTs yet</h3>
            <p className="text-muted-foreground text-sm mt-2">
              Be the first to mint an impact NFT and start building your fan funding journey.
            </p>
            <Button className="mt-6" asChild>
              <Link href="/mint">Mint your first NFT</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
