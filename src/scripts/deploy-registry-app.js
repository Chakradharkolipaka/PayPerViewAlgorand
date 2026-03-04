/* eslint-disable no-console */
/**
 * Registry TEAL app deploy script (Algorand TestNet).
 *
 * Best practices / security:
 * - NEVER import this file from the Next.js runtime.
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
import "dotenv/config";

// Note: this repo is TypeScript-first; for this standalone Node script we import
// the TS sources directly.
import { ALGOD_CONFIG } from "../lib/network.ts";
import { createRegistryApp } from "../lib/registryApp.ts";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function upsertEnvLine(filePath, key, value) {
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
  const mnemonic = requireEnv("DEPLOYER_MNEMONIC").trim();
  const secret = algosdk.mnemonicToSecretKey(mnemonic);

  const sender = String(secret.addr);

  console.log("Deploying FanFunding registry app...");
  console.log("Network:", ALGOD_CONFIG.server);
  console.log("Deployer:", sender);

  const res = await createRegistryApp({
    sender,
    signTransactions: async (txns) => {
      return txns.map((raw) => {
        const txn = algosdk.decodeUnsignedTransaction(raw);
        return txn.signTxn(secret.sk);
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
