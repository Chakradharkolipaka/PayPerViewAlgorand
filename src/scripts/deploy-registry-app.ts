/* eslint-disable no-console */
/**
 * Registry TEAL app deploy script (Algorand TestNet).
 *
 * Best practices / security:
 * - NEVER import this file from the Next.js app runtime.
 * - Reads secrets only from process.env (DEPLOYER_MNEMONIC) at execution time.
 * - Does not write mnemonic to disk.
 * - Optional: writes the resulting appId to `.env.local` (safe, no secrets).
 *
 * Usage:
 *   DEPLOYER_MNEMONIC="..." npm run deploy:registry
 */

import fs from "node:fs";
import path from "node:path";

import algosdk from "algosdk";

import { ALGOD_CONFIG } from "@/lib/network";
import { createRegistryApp } from "@/lib/registryApp";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function upsertEnvLine(filePath: string, key: string, value: string) {
  const line = `${key}=${value}`;
  const exists = fs.existsSync(filePath);
  const prev = exists ? fs.readFileSync(filePath, "utf8") : "";

  const lines = prev.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));

  if (idx >= 0) lines[idx] = line;
  else lines.push(line);

  fs.writeFileSync(filePath, lines.join("\n") + "\n", { encoding: "utf8" });
}

async function main() {
  // Secret only read here at runtime.
  const mnemonic = requireEnv("DEPLOYER_MNEMONIC").trim();
  const privateKey = algosdk.mnemonicToSecretKey(mnemonic);

  const sender = String(privateKey.addr);

  console.log("Deploying FanFunding registry app...");
  console.log("Network:", ALGOD_CONFIG.server);
  console.log("Deployer:", sender);

  // Use the same wallet-signing path as the UI, but sign locally with deployer key.
  const res = await createRegistryApp({
    sender,
    signTransactions: async (txns) => {
      return txns.map((raw) => {
        const txn = algosdk.decodeUnsignedTransaction(raw);
        return txn.signTxn(privateKey.sk);
      });
    },
  });

  console.log("Registry app deployed successfully");
  console.log("appId:", res.appId);
  console.log("txId:", res.txId);

  const shouldWrite = (process.env.WRITE_ENV_LOCAL ?? "1") !== "0";
  if (shouldWrite) {
    const envPath = path.resolve(process.cwd(), ".env.local");
    upsertEnvLine(envPath, "NEXT_PUBLIC_REGISTRY_APP_ID", String(res.appId));
    console.log(`Wrote NEXT_PUBLIC_REGISTRY_APP_ID to ${envPath}`);
  } else {
    console.log("WRITE_ENV_LOCAL=0 set; not writing .env.local");
  }
}

main().catch((err) => {
  console.error("DEPLOY_REGISTRY_APP_FAILED", err);
  process.exit(1);
});
