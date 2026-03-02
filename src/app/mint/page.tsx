"use client";

import React, { useCallback, useContext, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload } from "lucide-react";
import Image from "next/image";
import algosdk from "algosdk";

import { getAlgodClient } from "@/lib/algorand";
import { APP_TAG } from "@/constants";
import { WalletContext } from "@/app/providers";

export default function MintPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isMinting, setIsMinting] = useState(false);

  const { toast } = useToast();
  const wallet = useContext(WalletContext);

  const handleFileChange = (files: FileList | null) => {
    if (files && files[0]) {
      const selectedFile = files[0];
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
        description: "Please fill in all fields and select an image.",
        variant: "destructive",
      });
      return;
    }

    const walletAddress = wallet?.address;
    if (!walletAddress) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first using the Connect Wallet button.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsMinting(true);

      toast({
        title: "Uploading to IPFS...",
        description: "Please wait while we upload your NFT to IPFS.",
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
        title: "Minting NFT...",
        description: "Please confirm the ASA creation transaction in your wallet.",
      });

      const algodClient = getAlgodClient();
      const params = await algodClient.getTransactionParams().do();
      const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        sender: walletAddress,
        total: 1,
        decimals: 0,
        assetName: "DonationNFT",
        unitName: "DNFT",
        assetURL: tokenURI,
        defaultFrozen: false,
        suggestedParams: params,
      });

      toast({
        title: "Waiting for wallet signature...",
        description: "Approve the transaction in Kibisis/Pera to continue.",
      });

      const signed = await wallet!.signTxn(txn);
      if (!signed) throw new Error("Transaction signing was cancelled or failed.");
      const sendRes = await algodClient.sendRawTransaction(signed).do();
      const txId = (sendRes as any).txId ?? (sendRes as any).txid;

      toast({
        title: "Transaction submitted",
        description: `TxID: ${txId}. Waiting for confirmation...`,
      });

      await algosdk.waitForConfirmation(algodClient, txId, 4);

      const pending = await algodClient.pendingTransactionInformation(txId).do();
      const assetId = (pending as any).assetIndex ?? (pending as any)["asset-index"];

      // Platform tag for Indexer discovery (0 ALGO self-payment with JSON note)
      if (assetId) {
        toast({
          title: "Registering on-chain...",
          description: "Adding a discovery tag transaction so it appears on the homepage.",
        });

        const notePayload = new TextEncoder().encode(
          JSON.stringify({
            app: APP_TAG,
            assetId,
          })
        );

        const tagTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: walletAddress,
          receiver: walletAddress,
          amount: 0,
          note: notePayload,
          suggestedParams: params,
        });

        const signedTag = await wallet!.signTxn(tagTxn);
        if (!signedTag) throw new Error("Tag transaction signing was cancelled or failed.");
        await algodClient.sendRawTransaction(signedTag).do();
      }

      toast({
        title: "Success!",
        description: assetId ? `NFT ASA created. Asset ID: ${assetId}` : `Mint submitted. TxID: ${txId}`,
      });

      setFile(null);
      setPreviewUrl(null);
      setName("");
      setDescription("");
    } catch (error) {
      toast({
        title: "Minting Failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
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
            <CardTitle className="text-3xl font-bold text-center">Create Your NFT</CardTitle>
            <CardDescription className="text-center">
              Upload your artwork and provide the details below to mint it as a unique NFT.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                accept="image/*"
                onChange={(e) => handleFileChange(e.target.files)}
              />
              {previewUrl ? (
                <div className="relative w-full h-64">
                  <Image src={previewUrl} alt="Preview" fill className="rounded-md object-contain" unoptimized />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                  <Upload className="w-12 h-12" />
                  <p>Drag & drop your image here, or click to select a file</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="name">Name</label>
              <Input
                id="name"
                placeholder='e.g. "Sunset Over the Mountains"'
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description">Description</label>
              <Textarea
                id="description"
                placeholder="e.g. 'A beautiful painting capturing the serene sunset...'"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            {!wallet?.address && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Please connect your wallet using the "Connect Wallet" button in the navigation bar.
              </div>
            )}

            <Button onClick={handleMint} disabled={isProcessing || !wallet?.address} className="w-full">
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Minting...
                </>
              ) : (
                "Mint NFT"
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
