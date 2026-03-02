"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useContext, useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import Confetti from 'react-confetti';
import { Loader2 } from "lucide-react";
import algosdk from "algosdk";

import { type NftData } from "../app/page";
import { WalletContext } from "@/app/providers";
import { fromMicroAlgos, getAlgodClient, toMicroAlgos } from "@/lib/algorand";

interface NFTCardProps {
  nft: NftData;
  onDelete?: (tokenId: number) => void;
  onDonation?: (payload: { donor: string; amount: bigint; tokenId: number }) => void;
  onTotalsChange?: () => void;
}

interface NftMetadata {
    name: string;
    description: string;
    image: string;
}

export default function NFTCard({ nft, onDelete, onDonation, onTotalsChange }: NFTCardProps) {
  const { tokenId, metadata, owner, totalDonations } = nft;
  const [donationAmount, setDonationAmount] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [isDonating, setIsDonating] = useState(false);
  const { toast } = useToast();

  const wallet = useContext(WalletContext);

  const handleDonate = async () => {
    if (!donationAmount || Number(donationAmount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid fan donation amount.",
        variant: "destructive",
      });
      return;
    }
    if (!owner || typeof owner !== "string") {
      toast({
        title: "Error",
        description: "Donation receiver address is missing.",
        variant: "destructive",
      });
      return;
    }
    if (!wallet?.address) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsDonating(true);
      toast({
        title: "Preparing donation...",
        description: "Building your ALGO payment transaction.",
      });

      const sender = wallet.address;
      const receiver = owner;
      const amount = toMicroAlgos(Number(donationAmount));

  const algodClient = getAlgodClient();
  const params = await algodClient.getTransactionParams().do();
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender,
        receiver,
        amount,
        note: new Uint8Array(Buffer.from(`FanFunding donation for ${tokenId}`)),
        suggestedParams: params,
      });

  toast({
    title: "Waiting for wallet signature...",
    description: "Approve the donation in Kibisis/Pera to continue.",
  });

  const signed = await wallet.signTxn(txn);
  if (!signed) throw new Error("Transaction signing was cancelled or failed.");
  const sendRes = await algodClient.sendRawTransaction(signed).do();
  const txId = (sendRes as any).txId ?? (sendRes as any).txid;

  toast({
    title: "Donation submitted",
    description: `TxID: ${txId}. Waiting for confirmation...`,
  });

  await algosdk.waitForConfirmation(algodClient, txId, 4);

      toast({
        title: "Fan Donation Successful!",
        description: "Thank you for your support!",
      });
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      setDonationAmount("");

  const newEvent = { donor: sender, amount, txId };
      setEvents((prev) => [newEvent, ...prev]);

  if (onDonation) onDonation({ donor: sender, amount, tokenId });
  if (onTotalsChange) onTotalsChange();
    } catch (err) {
      toast({
        title: "Donation Failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsDonating(false);
    }
  };

  const shortenedAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  const isProcessing = isDonating;

  const computedTotalDonations = totalDonations ?? 0n;

  return (
    <>
      {showConfetti && <Confetti />}
      <Card className="overflow-hidden">
        <CardHeader className="p-0">
          <div className="relative w-full h-64">
            {metadata?.image ? (
              <Image
                src={metadata.image}
                alt={metadata.name || ''}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-secondary rounded-t-lg animate-pulse"></div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          <CardTitle>{metadata?.name || `NFT #${tokenId}`}</CardTitle>
          <p className="text-sm text-muted-foreground truncate">{metadata?.description}</p>
          {typeof owner === 'string' && <p className="text-xs">Owned by: {shortenedAddress(owner)}</p>}
        </CardContent>
        <CardFooter className="flex justify-between items-center p-4 bg-muted/50">
          <div>
              <p className="text-sm font-bold">{`${fromMicroAlgos(computedTotalDonations)} ALGO`}</p>
              <p className="text-xs text-muted-foreground">Total Fan Donations</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button disabled={isProcessing}>Fan Donate</Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>Fan Donate to {metadata?.name || `NFT #${tokenId}`}</DialogTitle>
              <DialogDescription>Your support helps the creator. Enter the amount of ALGO you'd like to donate.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                <div>
                  <Input 
                    type="number" 
                    placeholder="1 ALGO" 
                    value={donationAmount} 
                    onChange={(e) => setDonationAmount(e.target.value)} 
                    disabled={isProcessing}
                  />
                </div>
                <Button onClick={handleDonate} disabled={isProcessing} className="w-full">
                  {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : "Confirm Fan Donation"}
                </Button>
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Recent Fan Donations</h4>
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                        {events.length > 0 ? (
                            events.map((event, index) => (
                                <div key={index} className="text-xs text-muted-foreground flex justify-between">
                                    <span>{shortenedAddress((event as any).donor ?? (event as any).args?.donor)}</span>
                                    <span>
                                      {fromMicroAlgos(
                                        BigInt((event as any).amount ?? (event as any).args?.amount ?? 0)
                                      )}{" "}
                                      ALGO
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground">No fan donations yet.</p>
                        )}
                    </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </>
  );
}
