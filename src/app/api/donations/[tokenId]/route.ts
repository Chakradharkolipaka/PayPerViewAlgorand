import { NextResponse } from "next/server";

import { getIndexerClient } from "@/lib/algorand";

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

    const timeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    // Fetch payment transactions received by this address.
    const res = await timeout(
      getIndexerClient().searchForTransactions().address(address).txType("pay").limit(50).do(),
      5000
    );

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
    console.error("API_ERROR", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
