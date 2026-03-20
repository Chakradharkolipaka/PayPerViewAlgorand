import { NextResponse } from "next/server";

import { PAY_PER_VIEW_AMOUNT_ALGO } from "@/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const INDEXER_BASE = "https://testnet-idx.algonode.cloud";
const PINATA_GW = "https://gateway.pinata.cloud/ipfs/";

function resolveIpfs(raw?: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (s.startsWith("ipfs://")) return PINATA_GW + s.slice(7);
  if (/^(Qm[a-zA-Z0-9]{44}|bafy[a-zA-Z0-9]{50,})/.test(s)) return PINATA_GW + s;
  return s;
}

async function fetchJson(url: string, timeoutMs: number): Promise<any | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

function decodeUint64(buf: Buffer, offset: number): number {
  let n = 0;
  for (let i = 0; i < 8; i++) n = n * 256 + buf[offset + i];
  return n;
}

function microAlgosFromAlgo(algo: number): bigint {
  // Avoid float drift for our use (0.5) by rounding to microAlgos.
  return BigInt(Math.round(algo * 1_000_000));
}

/**
 * x402-style watch gate.
 *
 * Contract:
 * - Input: tokenId (path param) + viewer (query param)
 * - Output:
 *   - 200: { tokenId, owner, metadata, videoUrl }
 *   - 402: { requiredPayment: { receiver, amountMicro, note } }
 */
export async function GET(
  request: Request,
  { params }: { params: { tokenId: string } }
) {
  try {
    const tokenId = Number(params.tokenId);
    if (!Number.isFinite(tokenId) || tokenId <= 0) {
      return NextResponse.json({ error: "Invalid tokenId" }, { status: 400 });
    }

    const url = new URL(request.url);
    const viewer = (url.searchParams.get("viewer") ?? "").trim();
    if (!viewer) {
      return NextResponse.json(
        { error: "Missing required query parameter: viewer" },
        { status: 400 }
      );
    }

    // 1) Resolve asset owner + metadata (reuse registry assumptions)
    const assetData = await fetchJson(
      `${INDEXER_BASE}/v2/assets/${tokenId}`,
      10_000
    );
    if (!assetData?.asset?.params) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    const paramsObj = assetData.asset.params;
    const owner = (paramsObj.creator ?? "").trim();

    const metaUrl = resolveIpfs(paramsObj.url);
    const meta = metaUrl ? await fetchJson(metaUrl, 15_000) : null;

    // Fallback metadata if IPFS slow/unavailable
    const metadata =
      meta ??
      ({
        name: paramsObj.name ?? `Video #${tokenId}`,
        description: "",
        video: resolveIpfs(paramsObj.url),
      } as any);

    const videoUrl = resolveIpfs(metadata?.video ?? metadata?.image ?? paramsObj.url);

    // 2) Owner watches free
    if (viewer === owner) {
      return NextResponse.json({ tokenId, owner, metadata, videoUrl });
    }

    // 3) Verify on-chain payment exists
    const amountMicro = microAlgosFromAlgo(PAY_PER_VIEW_AMOUNT_ALGO);
    const note = `PayPerView for ${tokenId}`;
    const b64Prefix = Buffer.from(note).toString("base64");

    // Query payments by viewer, filter to receiver==owner and amount==required
    const txns = await fetchJson(
      `${INDEXER_BASE}/v2/transactions?address=${encodeURIComponent(viewer)}` +
        `&tx-type=pay&note-prefix=${encodeURIComponent(b64Prefix)}&limit=200`,
      10_000
    );

    const paid = (txns?.transactions ?? []).some((t: any) => {
      if (t?.sender !== viewer) return false;
      const pt = t?.["payment-transaction"];
      if (!pt) return false;
      if (pt.receiver !== owner) return false;
      try {
        return BigInt(pt.amount ?? 0) >= amountMicro;
      } catch {
        return false;
      }
    });

    if (!paid) {
      // x402: server instructs client what payment is required
      return NextResponse.json(
        {
          tokenId,
          requiredPayment: {
            receiver: owner,
            amountMicro: amountMicro.toString(),
            amountAlgo: PAY_PER_VIEW_AMOUNT_ALGO,
            note,
          },
        },
        { status: 402 }
      );
    }

    // 4) Payment proven, allow watch
    return NextResponse.json({ tokenId, owner, metadata, videoUrl });
  } catch (err: any) {
    console.error("[/api/watch/:tokenId] error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: err?.message },
      { status: 500 }
    );
  }
}
