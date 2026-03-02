import { getAlgodClient, getIndexerClient } from "@/lib/algorand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result: {
    algod: "ok" | "fail";
    indexer: "ok" | "fail";
    pinata: "configured" | "missing";
  } = {
    algod: "fail",
    indexer: "fail",
    pinata: process.env.PINATA_JWT ? "configured" : "missing",
  };

  try {
    await getAlgodClient().status().do();
    result.algod = "ok";
  } catch {
    result.algod = "fail";
  }

  try {
    // Indexer has a lightweight health endpoint
    await getIndexerClient().makeHealthCheck().do();
    result.indexer = "ok";
  } catch {
    result.indexer = "fail";
  }

  return Response.json(result);
}
