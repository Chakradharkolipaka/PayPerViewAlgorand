import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Vercel serverless function timeout (seconds)

const INDEXER_BASE = "https://testnet-idx.algonode.cloud";
const PINATA_GW = "https://gateway.pinata.cloud/ipfs/";

// ── Helpers ──────────────────────────────────────────────────────────

/** Resolve ipfs:// or bare CID URLs to an https gateway URL */
function resolveIpfs(raw?: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (s.startsWith("ipfs://")) return PINATA_GW + s.slice(7);
  if (/^(Qm[a-zA-Z0-9]{44}|bafy[a-zA-Z0-9]{50,})/.test(s)) return PINATA_GW + s;
  return s; // already https or empty
}

/** Fetch JSON with an AbortSignal timeout. Returns null on failure. */
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

/** Decode a big-endian uint64 from a buffer starting at `offset`. */
function decodeUint64(buf: Buffer, offset: number): number {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    n = n * 256 + buf[offset + i];
  }
  return n;
}

// ── GET /api/nfts ────────────────────────────────────────────────────

export async function GET() {
  try {
    const appId = Number(process.env.NEXT_PUBLIC_REGISTRY_APP_ID);
    if (!Number.isFinite(appId) || appId <= 0) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_REGISTRY_APP_ID not configured" },
        { status: 500 }
      );
    }

    // ── 1. Read registry global state via direct REST ──
    //    (algosdk v3 typed models drop global-state entries)
    const appData = await fetchJson(
      `${INDEXER_BASE}/v2/applications/${appId}`,
      10_000
    );
    const globalState: any[] =
      appData?.application?.params?.["global-state"] ?? [];

    if (globalState.length === 0) {
      // No assets registered yet — return empty array (not an error)
      return NextResponse.json([]);
    }

    // ── 2. Parse asset IDs from registry keys  ("a:" + itob(assetId)) ──
    const assetIds: number[] = [];
    for (const entry of globalState) {
      const keyBuf = Buffer.from(entry.key as string, "base64");
      // Keys are exactly 10 bytes: 2-byte prefix "a:" + 8-byte big-endian uint64
      if (keyBuf.length !== 10) continue;
      if (keyBuf[0] !== 0x61 || keyBuf[1] !== 0x3a) continue; // 'a' ':'
      const id = decodeUint64(keyBuf, 2);
      if (id > 0) assetIds.push(id);
    }

    if (assetIds.length === 0) {
      return NextResponse.json([]);
    }

    // ── 3. Fetch asset params + IPFS metadata in parallel ──
    const results = await Promise.all(
      assetIds.map(async (id) => {
        // 3a. Fetch on-chain asset info
        const assetData = await fetchJson(
          `${INDEXER_BASE}/v2/assets/${id}`,
          10_000
        );
        if (!assetData?.asset) return null;
        const params = assetData.asset.params ?? {};
        const creator: string = params.creator ?? "";

        // 3b. Resolve & fetch IPFS JSON metadata
        //     Use generous timeout — Pinata can be slow (>5s)
        const metaUrl = resolveIpfs(params.url);
        let meta: any = null;
        if (metaUrl) {
          meta = await fetchJson(metaUrl, 15_000);
        }

        // 3c. Determine if this is a video NFT.
        //     TRUST THE REGISTRY: everything registered through our app is a
        //     video NFT, so we only skip if metadata explicitly says otherwise
        //     (e.g., old image NFTs that were somehow registered).
        const hasVideo =
          meta?.video ||
          meta?.mime_type?.startsWith("video/") ||
          params.url?.match(/\.(mp4|mov|webm|mkv)(\?|$)/i);

        // If metadata loaded and clearly has no video field, skip.
        // If metadata failed to load (meta===null), still include it since
        // it's in our registry — use asset params as fallback metadata.
        if (meta && !hasVideo) return null;

        return { id, params, creator, meta };
      })
    );

    const validAssets = results.filter(Boolean) as {
      id: number;
      params: any;
      creator: string;
      meta: any;
    }[];

    if (validAssets.length === 0) {
      return NextResponse.json([]);
    }

    // ── 4. Aggregate pay-per-view revenue per asset ──
    const revenueResults = await Promise.all(
      validAssets.map(async ({ id, creator }) => {
        if (!creator) return { id, total: 0n };

        const notePrefix = `PayPerView for ${id}`;
        const b64Prefix = Buffer.from(notePrefix).toString("base64");
        const txnData = await fetchJson(
          `${INDEXER_BASE}/v2/transactions?address=${encodeURIComponent(creator)}` +
            `&tx-type=pay&note-prefix=${encodeURIComponent(b64Prefix)}&limit=200`,
          10_000
        );

        let total = 0n;
        for (const txn of txnData?.transactions ?? []) {
          const pt = txn?.["payment-transaction"];
          if (pt?.receiver === creator) {
            total += BigInt(pt.amount ?? 0);
          }
        }
        return { id, total };
      })
    );

    const revenueMap = new Map(revenueResults.map((r) => [r.id, r.total]));

    // ── 5. Build response (bigint → string for JSON serialization) ──
    const payload = validAssets.map(({ id, params, creator, meta }) => ({
      tokenId: id,
      metadata: meta ?? {
        name: params.name ?? `Video #${id}`,
        video: resolveIpfs(params.url),
      },
      owner: creator,
      totalDonations: String(revenueMap.get(id) ?? 0n),
    }));

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("[/api/nfts] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: err?.message },
      { status: 500 }
    );
  }
}
