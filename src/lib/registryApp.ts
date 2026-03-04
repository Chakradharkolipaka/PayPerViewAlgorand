import algosdk from "algosdk";

import { getAlgodClient } from "./algorand.ts";

// Minimal TEAL app (AVM8) to register assetId -> creator.
// Storage: global key `a:<assetId>` => creator address bytes
// Call: NoOp with args: ["register", itob(assetId)] and foreignAssets [assetId]
// Checks: Txn.sender == asset_params_get(AssetCreator, assetId)
// Notes:
// - This is intentionally small and deterministic.
// - For production, you’d typically keep TEAL in dedicated files and compile in CI.

const APPROVAL_TEAL = `#pragma version 8

// Minimal registry app:
// - Create: always approve
// - Call: NoOp only
// - Args: ["register", itob(assetId)]
// - Stores: global key "a:" + itob(assetId) => Txn.Sender (bytes)

txn ApplicationID
int 0
==
bnz approve

txn OnCompletion
int NoOp
==
bz reject

txn NumAppArgs
int 2
==
bz reject

txna ApplicationArgs 0
byte "register"
==
bz reject

// key = "a:" + arg1
byte "a:"
txna ApplicationArgs 1
concat
txn Sender
app_global_put

approve:
int 1
return

reject:
int 0
return
`;

const CLEAR_TEAL = `#pragma version 8
int 1
return
`;

export type CreateRegistryAppResult = {
  appId: number;
  txId: string;
};

export async function createRegistryApp(params: {
  sender: string;
  signTransactions: (txns: Uint8Array[]) => Promise<Uint8Array[]>;
}): Promise<CreateRegistryAppResult> {
  const algod = getAlgodClient();
  const suggestedParams = await algod.getTransactionParams().do();

  const approval = await algod.compile(APPROVAL_TEAL).do();
  const clear = await algod.compile(CLEAR_TEAL).do();

  const txn = algosdk.makeApplicationCreateTxnFromObject({
    sender: params.sender,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    approvalProgram: new Uint8Array(Buffer.from(approval.result, "base64")),
    clearProgram: new Uint8Array(Buffer.from(clear.result, "base64")),
    numGlobalByteSlices: 64,
    numGlobalInts: 0,
    numLocalByteSlices: 0,
    numLocalInts: 0,
    suggestedParams,
  });

  const encoded = algosdk.encodeUnsignedTransaction(txn);
  const signedArr = await params.signTransactions([encoded]);
  const signed = signedArr?.[0];
  if (!(signed instanceof Uint8Array)) throw new Error("Failed to sign app create transaction");

  const sendResp = await algod.sendRawTransaction(signed).do();
  const txId = (sendResp as any).txId ?? (sendResp as any).txid;
  if (!txId) throw new Error("App create submission failed: missing txId");

  const confirmed = await algosdk.waitForConfirmation(algod, txId, 4);
  const appId = (confirmed as any)["application-index"] ?? (confirmed as any).applicationIndex;
  if (!appId) throw new Error("App create confirmed but appId missing");

  return { appId: Number(appId), txId };
}

export async function registerAssetInApp(params: {
  appId: number;
  sender: string;
  assetId: number;
  signTransactions: (txns: Uint8Array[]) => Promise<Uint8Array[]>;
}): Promise<{ txId: string }> {
  const algod = getAlgodClient();
  const suggestedParams = await algod.getTransactionParams().do();
  suggestedParams.flatFee = true;
  suggestedParams.fee = 1000n;

  const appArgs = [
    new TextEncoder().encode("register"),
    algosdk.encodeUint64(params.assetId),
  ];

  const txn = algosdk.makeApplicationCallTxnFromObject({
    sender: params.sender,
    appIndex: params.appId,
    onComplete: algosdk.OnApplicationComplete.NoOpOC,
    appArgs,
    foreignAssets: [params.assetId],
    suggestedParams,
  });

  const encoded = algosdk.encodeUnsignedTransaction(txn);
  const signedArr = await params.signTransactions([encoded]);
  const signed = signedArr?.[0];
  if (!(signed instanceof Uint8Array)) throw new Error("Failed to sign registry app call");

  const sendResp = await algod.sendRawTransaction(signed).do();
  const txId = (sendResp as any).txId ?? (sendResp as any).txid;
  if (!txId) throw new Error("Registry call submission failed: missing txId");
  await algosdk.waitForConfirmation(algod, txId, 4);
  return { txId };
}
