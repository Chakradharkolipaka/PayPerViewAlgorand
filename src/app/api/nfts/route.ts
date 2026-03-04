import { getIndexerClient } from "@/lib/algorand";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const appIdStr = process.env.NEXT_PUBLIC_REGISTRY_APP_ID;
    const appId = appIdStr ? Number(appIdStr) : NaN;
    if (!Number.isFinite(appId) || appId <= 0) {
      // If not configured, return empty list (keeps app usable) 
      return Response.json([]);
    }

    const indexerClient = getIndexerClient();

    const timeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    // Read registry from app global state
    let appInfo: any;
    try {
      appInfo = await timeout(indexerClient.lookupApplications(appId).do(), 5000);
    } catch {
      return Response.json([]);
    }

    const globalState: any[] = appInfo?.application?.params?.globalState ?? appInfo?.application?.params?.["global-state"] ?? [];

    const assetIds: number[] = [];
    for (const entry of globalState) {
      const keyB64 = entry.key as string;
      if (!keyB64) continue;
      const keyBytes = Buffer.from(keyB64, "base64");
      // keys are: "a:" + itob(assetId)
      if (keyBytes.length !== 2 + 8) continue;
      if (keyBytes[0] !== 0x61 || keyBytes[1] !== 0x3a) continue; // 'a:'
      const assetId = Number(keyBytes.readBigUInt64BE(2));
      if (Number.isFinite(assetId) && assetId > 0) assetIds.push(assetId);
    }

    const uniqueAssetIds = [...new Set(assetIds)].slice(0, 50);

    const nfts: any[] = [];
    for (const id of uniqueAssetIds) {
      try {
        const assetInfo = await timeout(indexerClient.lookupAssetByID(id).do(), 5000);
        if (assetInfo?.asset) nfts.push(assetInfo.asset);
      } catch {
        // ignore bad lookup (keep demo stable)
      }
    }

    // Aggregate donation totals (keep it small and safe)
    const creators = [...new Set(nfts.map((n) => n?.params?.creator).filter(Boolean))] as string[];
    const donationTotals: Record<string, bigint> = {};

    for (const creator of creators) {
      let txnsRes: any;
      try {
        txnsRes = await timeout(
          indexerClient.searchForTransactions().address(creator).txType("pay").limit(50).do(),
          5000
        );
      } catch {
        donationTotals[creator] = 0n;
        continue;
      }

      let total = 0n;
      for (const txn of txnsRes.transactions ?? []) {
        const amount = BigInt(
          (txn as any).paymentTransaction?.amount ??
            (txn as any)["payment-transaction"]?.amount ??
            0
        );
        if (amount > 0n) total += amount;
      }
      donationTotals[creator] = total;
    }

    return Response.json(
      nfts.map((asset) => ({
        tokenId: asset.index,
        metadata: {
          name: asset.params?.name,
          image: asset.params?.url,
        },
        owner: asset.params?.creator,
        totalDonations: donationTotals[asset.params?.creator] ?? 0n,
      }))
    );
  } catch (err) {
    console.error("API_ERROR", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
