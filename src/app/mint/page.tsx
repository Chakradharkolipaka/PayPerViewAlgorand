"use client";

import React, { useCallback, useContext, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload } from "lucide-react";
import algosdk from "algosdk";
import { useRouter } from "next/navigation";

import { getAlgodClient } from "@/lib/algorand";
import { connectPera, peraWallet } from "@/lib/peraWallet";
import { usePeraAccount } from "@/hooks/usePeraAccount";
import { useNFTStore } from "@/hooks/useNFTStore";
import { MAX_VIDEO_SIZE_BYTES } from "@/constants";

export default function MintPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isMinting, setIsMinting] = useState(false);

  const { toast } = useToast();
  const { account } = usePeraAccount();
  const router = useRouter();
  const { refreshNFTs } = useNFTStore();

  const connectWallet = useCallback(async () => {
    const accounts = await connectPera();
    const addr = accounts?.[0] ?? null;
    if (!addr) throw new Error("Connected wallet returned no accounts.");
  }, []);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const selectedFile = files[0];

      // Validate video type
      if (!selectedFile.type.startsWith("video/")) {
        toast({
          title: "Invalid file type",
          description: "Please select a video file (MP4, WebM, MOV, etc.).",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (2 MB)
      if (selectedFile.size > MAX_VIDEO_SIZE_BYTES) {
        toast({
          title: "File too large",
          description: `Video must be under ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB. Your file is ${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB.`,
          variant: "destructive",
        });
        return;
      }

      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
    }
  };

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    handleFileChange(files);
  }, []);

  const handleMint = async () => {
    if (!file || !name || !description) {
      toast({
        title: "Error",
        description: "Please fill in all fields and select a video.",
        variant: "destructive",
      });
      return;
    }
  if (!account) throw new Error("Wallet not connected");
  if (!algosdk.isValidAddress(account)) throw new Error("Invalid wallet address");

    try {
      setIsMinting(true);

      toast({
        title: "Uploading to IPFS...",
        description: "Please wait while we upload your video to IPFS.",
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("description", description);

      const uploadRes = await fetch("/api/pinata/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `Upload failed with status ${uploadRes.status}`);
      }

    const { tokenURI } = (await uploadRes.json()) as { tokenURI?: string };
    if (!tokenURI) throw new Error("Failed to get token URI from upload");

      toast({
        title: "Minting Video NFT...",
        description: "Please confirm the ASA creation transaction in your wallet.",
      });

    const algod = getAlgodClient();
    const suggestedParams = await algod.getTransactionParams().do();
    suggestedParams.flatFee = true;
    (suggestedParams as any).fee = 1000n;

      const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        sender: account,
        total: 1,
        decimals: 0,
        assetName: name,
        unitName: "PPV",
        assetURL: tokenURI,
        defaultFrozen: false,
        suggestedParams,
      });

      console.log("Mint txn prepared:", txn);

      toast({
        title: "Waiting for wallet signature...",
        description: "Approve the transaction in Pera Wallet to continue.",
      });

      const txnGroup = [
        {
          txn,
          signers: [account],
        },
      ];

  const signedTxns = await peraWallet.signTransaction([txnGroup]);
      if (!signedTxns?.[0]) throw new Error("Signing failed");

      const sendRes = await algod.sendRawTransaction(signedTxns[0]).do();
      const txId = (sendRes as any).txId ?? (sendRes as any).txid ?? txn.txID().toString();

      toast({
        title: "Transaction submitted",
        description: `TxID: ${txId}. Waiting for confirmation...`,
      });

      const confirmedTxn = await algosdk.waitForConfirmation(algod, txId, 4);

      if (confirmedTxn.poolError && confirmedTxn.poolError.length > 0) {
        throw new Error(`Transaction failed: ${confirmedTxn.poolError}`);
      }

      const assetIdRaw = confirmedTxn.assetIndex;

      if (assetIdRaw === undefined || assetIdRaw === null) {
        throw new Error("Mint failed: asset ID missing from confirmation");
      }

      const assetId = Number(assetIdRaw);

      if (Number.isNaN(assetId)) {
        throw new Error("Mint failed: invalid asset ID format");
      }

      console.log("Mint successful. Asset ID:", assetId);

      // Registry App Call
      const appIdStr = process.env.NEXT_PUBLIC_REGISTRY_APP_ID;
      const appId = appIdStr ? Number(appIdStr) : NaN;
      if (!Number.isFinite(appId) || appId <= 0) {
        throw new Error("Missing NEXT_PUBLIC_REGISTRY_APP_ID. Deploy the registry app and set it in .env.local.");
      }

      toast({
        title: "Registering on-chain...",
        description: "Confirm the registry registration transaction in Pera Wallet.",
      });

      const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: account,
        appIndex: appId,
        appArgs: [
          new TextEncoder().encode("register"),
          algosdk.encodeUint64(assetId),
        ],
        suggestedParams,
      });

      const appTxnGroup = [
        {
          txn: appCallTxn,
          signers: [account],
        },
      ];
      const signedApp = await peraWallet.signTransaction([appTxnGroup]);
      if (!signedApp?.[0]) throw new Error("Registry signing failed");

      await algod.sendRawTransaction(signedApp[0]).do();
      await algosdk.waitForConfirmation(algod, appCallTxn.txID().toString(), 4);

      await new Promise((resolve) => setTimeout(resolve, 3000));

  await refreshNFTs(account);

  router.refresh();

      toast({
        title: "Success!",
        description: `Video NFT created. Asset ID: ${assetId}`,
      });

      setFile(null);
      setPreviewUrl(null);
      setName("");
      setDescription("");
    } catch (err) {
      if (!(globalThis as any).__MINT_ERR_LOGGED__) {
        (globalThis as any).__MINT_ERR_LOGGED__ = true;
        console.error("MINT_ERROR", err);
      }

      toast({
        title: "Minting Failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsMinting(false);
    }
  };

  const isProcessing = isMinting;

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-80px)] p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">Upload Your Video</CardTitle>
            <CardDescription className="text-center">
              Upload a video (max 2MB) and mint it as a Pay-Per-View NFT on Algorand.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : "Wallet: not connected"}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await connectWallet();
                    toast({
                      title: "Connected",
                      description: "Pera Wallet connected.",
                    });
                  } catch (e) {
                    toast({
                      title: "Connection failed",
                      description: e instanceof Error ? e.message : String(e),
                      variant: "destructive",
                    });
                  }
                }}
                disabled={isProcessing}
              >
                {account ? "Reconnect" : "Connect Pera"}
              </Button>
            </div>

            <div
              className="border-2 border-dashed border-muted-foreground/50 rounded-lg p-8 text-center cursor-pointer hover:bg-accent transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept="video/*"
                onChange={(e) => handleFileChange(e.target.files)}
              />
              {previewUrl ? (
                <div className="relative w-full h-64">
                  <video
                    src={previewUrl}
                    controls
                    className="w-full h-full rounded-md object-contain"
                    playsInline
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                  <Upload className="w-12 h-12" />
                  <p>Drag & drop your video here, or click to select</p>
                  <p className="text-xs">MP4, WebM, MOV — Max 2MB</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="name">Title</label>
              <Input
                id="name"
                placeholder='e.g. "My Exclusive Content"'
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description">Description</label>
              <Textarea
                id="description"
                placeholder="e.g. 'A behind-the-scenes look at...'"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            {!account && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Please connect your wallet using the &quot;Connect Wallet&quot; button in the navigation bar.
              </div>
            )}

            <Button onClick={handleMint} disabled={isProcessing || !account} className="w-full">
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Minting...
                </>
              ) : (
                "Mint Video NFT"
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
