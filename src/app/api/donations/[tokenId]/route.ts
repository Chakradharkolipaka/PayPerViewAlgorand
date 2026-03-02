import { NextResponse } from "next/server";

import { indexerClient } from "@/lib/algorand";

export const dynamic = "force-dynamic";

// Compatibility route: previously tokenId mapped to an on-chain NFT.
// In the Algorand-native version, donations are simple ALGO payment transactions.
// We query by receiver address supplied via query param: ?address=...
export async function GET(request: Request, { params }: { params: { tokenId: string } }) {
  try {
    // tokenId kept only for backward compatibility; not used in Algorand queries
    void params.tokenId;

    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address")?.trim();
    if (!address) {
      return NextResponse.json(
        { error: "Missing required query parameter: address" },
        { status: 400 }
      );
    }

    // Fetch payment transactions received by this address.
    const res = await indexerClient
      .searchForTransactions()
      .address(address)
      .txType("pay")
      .do();

    const txns = (res.transactions ?? []) as any[];
    const donations = txns
      .filter((t) => t["payment-transaction"]?.receiver === address)
      .map((t) => ({
        donor: t.sender as string,
        amount: String(t["payment-transaction"]?.amount ?? 0), // microAlgos as string
        roundTime: t["round-time"] as number | undefined,
        confirmedRound: t["confirmed-round"] as number | undefined,
        txId: t.id as string,
      }));

    return NextResponse.json(donations);
  } catch (error) {
    console.error("Error fetching donations:", error);
    return NextResponse.json({ error: "Failed to fetch donations" }, { status: 500 });
  }
}
