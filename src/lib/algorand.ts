import algosdk from "algosdk";

const ALGOD_URL =
  process.env.NEXT_PUBLIC_ALGOD ?? "https://testnet-api.algonode.cloud";
const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER ?? "https://testnet-idx.algonode.cloud";

export const algodClient = new algosdk.Algodv2("", ALGOD_URL, "");
export const indexerClient = new algosdk.Indexer("", INDEXER_URL, "");

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
