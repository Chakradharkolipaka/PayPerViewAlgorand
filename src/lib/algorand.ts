import algosdk from "algosdk";

import { ALGOD_CONFIG, INDEXER_CONFIG } from "./network.ts";

let _algodClient: algosdk.Algodv2 | null = null;
let _indexerClient: algosdk.Indexer | null = null;

export function getAlgodClient() {
  if (_algodClient) return _algodClient;
  // IMPORTANT: create lazily (no module-root side effects) and be explicit
  // about the TestNet endpoint for maximum runtime predictability.
  _algodClient = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
  return _algodClient;
}

export function getIndexerClient() {
  if (_indexerClient) return _indexerClient;
  _indexerClient = new algosdk.Indexer(
    INDEXER_CONFIG.token,
    INDEXER_CONFIG.server,
    INDEXER_CONFIG.port
  );
  return _indexerClient;
}

export const MICRO = 1_000_000;

export const toMicroAlgos = (algo: number) => BigInt(Math.round(algo * MICRO));

export const fromMicroAlgos = (micro: bigint | number) => {
  const m = typeof micro === "bigint" ? micro : BigInt(micro);
  // Keep this simple for UI: show up to 6 decimals (microAlgos)
  const whole = m / BigInt(MICRO);
  const frac = m % BigInt(MICRO);
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole.toString()}.${fracStr}` : whole.toString();
};
