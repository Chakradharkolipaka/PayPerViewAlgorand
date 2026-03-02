import { getIndexerClient } from "@/lib/algorand";
import { APP_TAG } from "@/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const indexerClient = getIndexerClient();

    const timeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    // Strict limits for demo stability
    const MAX_TXNS = 50;
    const notePrefix = new TextEncoder().encode(`{"app":"${APP_TAG}"`);

    let response: any;
    try {
      response = await timeout(
        indexerClient.searchForTransactions().limit(MAX_TXNS).notePrefix(notePrefix).do(),
        5000
      );
    } catch {
      // Per requirements: indexer failure returns empty array (never 500)
      return Response.json([]);
    }

    const assetIds: number[] = [];
    for (const txn of response.transactions ?? []) {
      if (!txn.note) continue;
      try {
        const noteRaw = txn.note as unknown;
        const noteJson =
          typeof noteRaw === "string"
            ? Buffer.from(noteRaw, "base64").toString()
            : Buffer.from(noteRaw as Uint8Array).toString();
        const decoded = JSON.parse(noteJson);
        if (decoded.app === APP_TAG && decoded.assetId) assetIds.push(Number(decoded.assetId));
      } catch {
        // ignore
      }
    }

    const uniqueAssetIds = [...new Set(assetIds)]
      .filter((n) => Number.isFinite(n))
      .slice(0, 50);

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
