import algosdk from "algosdk";

const indexer = new algosdk.Indexer("", "https://testnet-idx.algonode.cloud", "");

async function test() {
  const appInfo = await indexer.lookupApplications(756723661).do();
  
  console.log("Type of appInfo:", typeof appInfo);
  console.log("Top-level keys:", Object.keys(appInfo));
  
  const app = appInfo?.application ?? appInfo;
  console.log("\napplication keys:", Object.keys(app));
  
  const params = app?.params;
  console.log("\nparams keys:", params ? Object.keys(params) : "NO PARAMS");
  
  // Check both casing
  const gs1 = params?.globalState;
  const gs2 = params?.["global-state"];
  console.log("\nparams.globalState:", gs1 ? `array(${gs1.length})` : "undefined");
  console.log('params["global-state"]:', gs2 ? `array(${gs2.length})` : "undefined");
  
  // Try direct access patterns
  const gs3 = appInfo?.application?.params?.globalState;
  const gs4 = appInfo?.application?.params?.["global-state"];
  console.log("\nDirect access globalState:", gs3 ? `array(${gs3.length})` : "undefined");
  console.log('Direct access ["global-state"]:', gs4 ? `array(${gs4.length})` : "undefined");
  
  // Dump the first entry
  const gs = gs1 ?? gs2 ?? gs3 ?? gs4 ?? [];
  console.log("\nFinal global state entries:", gs.length);
  if (gs.length > 0) {
    console.log("First entry:", JSON.stringify(gs[0]));
  }
}

test().catch(console.error);
