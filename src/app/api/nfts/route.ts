import { getIndexerClient } from "@/lib/algorand";

export const dynamic = "force-dynamic";

const INDEXER_BASE = process.env.NEXT_PUBLIC_INDEXER_URL || "https://testnet-idx.algonode.cloud";

export async function GET() {
  try {
    const appIdStr = process.env.NEXT_PUBLIC_REGISTRY_APP_ID;
    const appId = appIdStr ? Number(appIdStr) : NaN;
    if (!Number.isFinite(appId) || appId <= 0) {
      return Response.json([]);
    }

    const timeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    // ── 1. Read registry global state via direct REST (algosdk v3 typed
    //       models lose global-state entries during deserialization) ──
    let globalState: any[];
    try {
      const res = await timeout(
        fetch(`${INDEXER_BASE}/v2/applications/${appId}`).then(r => {
          if (!r.ok) throw new Error(`Indexer ${r.status}`);
          return r.json();
        }),
        8000
      );
      globalState = res?.application?.params?.["global-state"] ?? [];
    } catch {
      return Response.json([]);
    }

    // ── 2. Parse asset IDs from registry keys ("a:" + itob(assetId)) ──
    const assetIds: number[] = [];
    for (const entry of globalState) {
      const keyBytes = Buffer.from(entry.key as string, "base64");
      if (keyBytes.length !== 10) continue;
      if (keyBytes[0] !== 0x61 || keyBytes[1] !== 0x3a) continue; // "a:"
      const assetId = Number(keyBytes.readBigUInt64BE(2));
      if (Number.isFinite(assetId) && assetId > 0) assetIds.push(assetId);
    }

    const uniqueAssetIds = [...new Set(assetIds)].slice(0, 50);
    if (uniqueAssetIds.length === 0) return Response.json([]);

    // ── 3. Fetch asset info + IPFS metadata, filter to video-only NFTs ──
    const nfts: any[] = [];
    const metadataMap: Record<number, any> = {};

    for (const id of uniqueAssetIds) {
      try {
        const assetRes = await timeout(
          fetch(`${INDEXER_BASE}/v2/assets/${id}`).then(r => r.ok ? r.json() : null),
          5000
        );
        if (!assetRes?.asset) continue;
        const params = assetRes.asset.params ?? {};

        // Resolve IPFS metadata
        let ipfsMeta: any = null;
        const rawUrl: string = params?.url ?? "";
        let metaUrl = rawUrl.trim();
        if (metaUrl.startsWith("ipfs://")) {
          metaUrl = metaUrl.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
        } else if (/^[a-zA-Z0-9]{46,}$/.test(metaUrl) && !metaUrl.startsWith("http")) {
          metaUrl = `https://gateway.pinata.cloud/ipfs/${metaUrl}`;
        }
        if (metaUrl) {
          try {
            ipfsMeta = await timeout(
              fetch(metaUrl, { cache: "no-store" }).then(r => r.ok ? r.json() : null),
              5000
            );
          } catch { /* ignore */ }
        }

        // Skip non-video NFTs
        const hasVideo =
          ipfsMeta?.video ||
          ipfsMeta?.mime_type?.startsWith("video/") ||
          rawUrl.match(/\.(mp4|mov|webm|mkv)(\?|$)/i);
        if (!hasVideo) continue;

        nfts.push({ index: assetRes.asset.index, params });
        metadataMap[assetRes.asset.index] = ipfsMeta;
      } catch { /* ignore */ }
    }

    // ── 4. Aggregate pay-per-view revenue per asset ──
    const donationTotals: Record<number, bigint> = {};
    for (const asset of nfts) {
      const assetId = Number(asset.index);
      const creator = asset.params?.creator;
      if (!creator) { donationTotals[assetId] = 0n; continue; }

      const notePrefix = `PayPerView for ${assetId}`;
      try {
        const txnsRes = await timeout(
          fetch(
            `${INDEXER_BASE}/v2/transactions?address=${creator}&tx-type=pay` +
            `&note-prefix=${Buffer.from(notePrefix).toString("base64")}` +
            `&limit=200`
          ).then(r => r.ok ? r.json() : null),
          5000
        );

        let total = 0n;
        for (const txn of txnsRes?.transactions ?? []) {
          const receiver = txn?.["payment-transaction"]?.receiver;
          if (receiver !== creator) continue;
          const rawAmt = txn?.["payment-transaction"]?.amount ?? 0;
          total += BigInt(rawAmt);
        }
        donationTotals[assetId] = total;
      } catch {
        donationTotals[assetId] = 0n;
      }
    }

    // ── 5. Return JSON (bigint → string for serialization) ──
    return Response.json(
      nfts.map((asset) => {
        const ipfsMeta = metadataMap[Number(asset.index)] ?? null;
        return {
          tokenId: Number(asset.index),
          metadata: ipfsMeta ?? {
            name: asset.params?.name,
            video: asset.params?.url,
          },
          owner: asset.params?.creator,
          totalDonations: String(donationTotals[Number(asset.index)] ?? 0n),
        };
      })
    );
  } catch (err) {
    console.error("API_ERROR", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
