"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Wallet, Video as VideoIcon, Coins, Trophy } from "lucide-react";

import NFTCard from "@/components/NFTCard";
import SkeletonCard from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { fromMicroAlgos } from "@/lib/algorand";
import { useToast } from "@/components/ui/use-toast";
import { usePeraAccount } from "@/hooks/usePeraAccount";
import { fetchAllNFTsWithFundingData, type NftData } from "@/lib/nftService";

// Re-export NftData so existing imports from "@/app/page" keep working.
export type { NftData };

export default function Home() {
  const [nfts, setNfts] = useState<NftData[]>([]);
  const [hiddenTokenIds, setHiddenTokenIds] = useState<number[]>([]);
  const { toast } = useToast();
  const { account } = usePeraAccount();
  const [isLoading, setIsLoading] = useState(false);
  const fetchIdRef = useRef(0); // guards against stale closures / race conditions

  // ── 🔟 WALLET SWITCH / MOUNT: fetch via single source of truth ──
  const loadNFTs = useCallback(
    async (addr: string) => {
      const id = ++fetchIdRef.current;
      setIsLoading(true);
      console.log("[Home] loadNFTs triggered for:", addr, "fetchId:", id);

      try {
        const result = await fetchAllNFTsWithFundingData(addr);
        if (fetchIdRef.current !== id) {
          console.log("[Home] Stale fetch ignored (id mismatch)");
          return;
        }
        setNfts(result);
        console.log("[Home] NFT state set:", result.length, "items");
        toast({
          title: "Videos loaded",
          description: `Loaded ${result.length} videos with revenue data.`,
        });
      } catch (e) {
        if (fetchIdRef.current !== id) return;
        console.error("[Home] loadNFTs failed:", e);
        toast({
          title: "Failed to load videos",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
        setNfts([]);
      } finally {
        if (fetchIdRef.current === id) setIsLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!account) {
      console.warn("[Home] Account null — clearing NFTs");
      setNfts([]);
      return;
    }
    void loadNFTs(account);
  }, [account, loadNFTs]);

  // ── Derived state: ALWAYS recomputed when nfts change ──
  const visibleNfts = useMemo(
    () => nfts.filter((nft) => !hiddenTokenIds.includes(nft.tokenId)),
    [nfts, hiddenTokenIds]
  );

  // 3️⃣ Total depends on nfts state — NOT computed once
  const totalDonationsAll = useMemo(
    () => visibleNfts.reduce((sum, nft) => sum + (nft.totalDonations ?? 0n), 0n),
    [visibleNfts]
  );

  const topDonatedNfts = useMemo(
    () =>
      [...visibleNfts]
        .sort((a, b) => Number(b.totalDonations) - Number(a.totalDonations))
        .slice(0, 10),
    [visibleNfts]
  );

  const topSupportedNames = useMemo(() => {
    if (topDonatedNfts.length === 0) return "No views yet";
    return topDonatedNfts
      .slice(0, 3)
      .map((nft) => nft.metadata?.name || `Video #${nft.tokenId}`)
      .join(", ");
  }, [topDonatedNfts]);

  const handleDeleteNft = useCallback((tokenId: number) => {
    setHiddenTokenIds((prev) =>
      prev.includes(tokenId) ? prev : [...prev, tokenId]
    );
  }, []);

  // ── 4️⃣ OPTIMISTIC UPDATE: bump funded amount instantly, then hard refetch ──
  const handleDonationOptimistic = useCallback(
    ({ donor, amount, tokenId }: { donor: string; amount: bigint; tokenId: number }) => {
      console.log("[Home] Optimistic update — tokenId:", tokenId, "amount:", amount.toString());

      // 8️⃣ Functional update — no stale closure on `nfts`
      // 9️⃣ State immutability — spread, never mutate
      setNfts((prev) =>
        prev.map((nft) =>
          nft.tokenId === tokenId
            ? { ...nft, totalDonations: (nft.totalDonations ?? 0n) + amount }
            : nft
        )
      );

      console.log("[Home] Updated Total (optimistic):", "recomputed via useMemo");
    },
    []
  );

  // Called by NFTCard AFTER on-chain confirmation — hard refetch for consistency
  const handleDonationConfirmed = useCallback(async () => {
    if (!account) return;
    console.log("[Home] Post-confirmation hard refetch triggered");
    await loadNFTs(account);
  }, [account, loadNFTs]);

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const isPageLoading = !!account && isLoading;

  return (
    <main className="container mx-auto px-4 py-10 space-y-10">
      {/* ── Dashboard Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connected Wallet */}
        <div className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-lg hover:border-primary/30 dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-slate-800/60">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Connected Wallet
              </p>
              <p className="text-sm font-semibold font-mono break-all">
                {account ? shortenAddress(account) : "Not connected"}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                account
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  account ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {account ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        {/* Video Count */}
        <div className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-lg hover:border-blue-500/30 dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-blue-950/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your Videos
              </p>
              <p className="text-3xl font-bold tracking-tight">
                {visibleNfts.length}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <VideoIcon className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {visibleNfts.length === 0
              ? "Upload your first video to get started"
              : `${visibleNfts.length} video${visibleNfts.length !== 1 ? "s" : ""} in your collection`}
          </p>
        </div>

        {/* Total Revenue */}
        <div className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-lg hover:border-emerald-500/30 dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-emerald-950/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Revenue
              </p>
              <p className="text-3xl font-bold tracking-tight">
                {fromMicroAlgos(totalDonationsAll)}
                <span className="ml-1.5 text-base font-medium text-muted-foreground">
                  ALGO
                </span>
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Coins className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {totalDonationsAll > 0n
              ? "Across all your videos"
              : "Revenue will appear here"}
          </p>
        </div>

        {/* Most Watched */}
        <div className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-lg hover:border-indigo-500/30 dark:bg-gradient-to-br dark:from-slate-900/80 dark:to-indigo-950/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Most Watched
              </p>
              <p className="text-sm font-semibold leading-snug truncate max-w-[180px]">
                {topSupportedNames}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Trophy className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {topDonatedNfts.length > 0
              ? `Top ${Math.min(topDonatedNfts.length, 3)} by view revenue`
              : "No views recorded yet"}
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Pay Per View
          </h1>
          <p className="text-muted-foreground max-w-xl text-sm md:text-base">
            Upload videos, earn ALGO per view. Viewers pay a fixed fee to watch
            exclusive content on Algorand.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">All Videos</h2>
          <Button asChild>
            <Link href="/mint">Upload Video</Link>
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
              <NFTCard
                key={nft.tokenId}
                nft={nft}
                onDelete={handleDeleteNft}
                onDonation={handleDonationOptimistic}
                onTotalsChange={handleDonationConfirmed}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-10 text-center">
            <h3 className="text-lg font-semibold">No videos yet</h3>
            <p className="text-muted-foreground text-sm mt-2">
              Be the first to upload a video and start earning through Pay Per
              View.
            </p>
            <Button className="mt-6" asChild>
              <Link href="/mint">Upload your first video</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
