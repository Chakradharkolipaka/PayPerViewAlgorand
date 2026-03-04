"use client";

import algosdk from "algosdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import NFTCard from "@/components/NFTCard";
import SkeletonCard from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { fromMicroAlgos } from "@/lib/algorand";
import { useToast } from "@/components/ui/use-toast";
import { usePeraAccount } from "@/hooks/usePeraAccount";

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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!account) {
      console.warn("Account null, skipping fetch");
      setNfts([]);
      return () => {
        cancelled = true;
      };
    }

    toast({
      title: "Loading your NFTs...",
      description: "Fetching your on-chain assets from Algorand Indexer.",
    });

    const fetchNFTs = async () => {
      setIsLoading(true);
      try {
        // STEP 1 — ADD NETWORK DIAGNOSTIC BLOCK
        console.log("=== NFT FETCH DEBUG START ===");
        console.log("Connected account:", account);

        const algod = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
        const status = await algod.status().do();
        console.log("Algod last round:", (status as any)["last-round"]);

        const indexer = new algosdk.Indexer("", "https://testnet-idx.algonode.cloud", "");

        // STEP 2 — LOG RAW INDEXER RESPONSE
        const res = await indexer.lookupAccountAssets(account).do();
        console.log("Raw indexer response:", res);
        console.log("Total assets returned:", (res as any)?.assets?.length);

        const assets = (res as any)?.assets ?? [];

        // STEP 3 — REMOVE ALL FILTERS TEMPORARILY
        const nftAssets = assets;
        console.log("Assets BEFORE filtering:", nftAssets);

        // STEP 4 — LOG EACH ASSET DETAILS
        nftAssets.forEach((a: any) => {
          console.log("Asset:", {
            assetId: a?.["asset-id"] ?? a?.assetId,
            amount: a?.amount,
            frozen: a?.["is-frozen"] ?? a?.isFrozen,
          });
        });

        const detailed = await Promise.all(
          nftAssets.map(async (holding: any) => {
            const rawAssetId = holding?.["asset-id"] ?? holding?.assetId;

            // Indexer holdings may be returned as bigint in newer SDKs.
            const assetId =
              typeof rawAssetId === "bigint"
                ? Number(rawAssetId)
                : Number(rawAssetId);

            console.log("Holding asset-id raw:", rawAssetId, "normalized:", assetId);

            if (!Number.isFinite(assetId) || assetId <= 0) {
              console.error(
                "Invalid asset-id encountered (skipping holding):",
                holding,
                "keys:",
                holding && typeof holding === "object" ? Object.keys(holding) : holding
              );
              return null;
            }

            const assetInfo = await indexer.lookupAssetByID(assetId).do();
            // STEP 5 — LOG FULL ASSET PARAMS
            console.log("Asset info for", holding?.["asset-id"], assetInfo);

            const params = (assetInfo as any)?.asset?.params ?? {};

            // STEP 11 — CHECK DECIMALS
            if (params?.decimals !== 0) {
              console.warn("Not an NFT (decimals != 0):", params?.decimals);
            }

            let metadata: any | null = null;

            // STEP 6 — HANDLE IPFS URL NORMALIZATION
            let url = params?.url ? String(params.url) : undefined;
            if (url?.startsWith("ipfs://")) {
              url = url.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
            }

            console.log("Metadata URL:", url);

            if (url) {
              try {
                const metaRes = await fetch(url, { cache: "no-store" });
                console.log("Metadata response status:", metaRes.status);
                metadata = await metaRes.json();
              } catch (err) {
                console.error("Metadata fetch failed:", err);
                metadata = null;
              }
            }

            return {
              tokenId: assetId,
              metadata: metadata ?? {
                name: params?.name,
                image: params?.url,
              },
              owner: account,
              totalDonations: 0n,
            } as NftData;
          })
        );

        const cleanedDetailed = detailed.filter(Boolean) as NftData[];

        if (cancelled) return;
        setNfts(cleanedDetailed);

        // STEP 7 — VERIFY STATE IS SET
  console.log("Final NFT state set:", cleanedDetailed);

        console.log("=== NFT FETCH DEBUG END ===");

        toast({
          title: "NFTs loaded",
          description: `Loaded ${cleanedDetailed.length} NFTs.`,
        });
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to load account NFTs", e);
        toast({
          title: "Failed to load NFTs",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
        setNfts([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchNFTs();

    return () => {
      cancelled = true;
    };
  }, [account, toast]);

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
      {/* STEP 8 — VERIFY RENDERING IS NOT BLOCKED */}
      <pre className="text-xs opacity-70 whitespace-pre-wrap break-words">
        Account: {String(account)}
        {"\n"}NFT Count: {nfts.length}
      </pre>

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
