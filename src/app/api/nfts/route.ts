import { indexerClient } from "@/lib/algorand";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = await indexerClient
    .searchForTransactions()
    .limit(100)
    .notePrefix(new TextEncoder().encode('{"app":"FanFundingAlgorand"'))
    .do();

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

      if (decoded.app === "FanFundingAlgorand" && decoded.assetId) {
        assetIds.push(Number(decoded.assetId));
      }
    } catch {
      // ignore parse errors
    }
  }

  const uniqueAssetIds = [...new Set(assetIds)].filter((n) => Number.isFinite(n));

  const nfts: any[] = [];
  for (const id of uniqueAssetIds) {
    const assetInfo = await indexerClient.lookupAssetByID(id).do();
    if (assetInfo?.asset) nfts.push(assetInfo.asset);
  }

  // Aggregate donation totals per creator (sum of payment txns received)
  const creators = [...new Set(nfts.map((n) => n?.params?.creator).filter(Boolean))] as string[];
  const donationTotals: Record<string, bigint> = {};

  for (const creator of creators) {
    const txnsRes = await indexerClient
      .searchForTransactions()
      .address(creator)
      .txType("pay")
      .limit(200)
      .do();

    let total = 0n;
    for (const txn of txnsRes.transactions ?? []) {
      const amount = BigInt(
        (txn as any).paymentTransaction?.amount ??
          (txn as any)["payment-transaction"]?.amount ??
          0
      );
      // ignore 0-amount self-tags and any zero payments
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
}
