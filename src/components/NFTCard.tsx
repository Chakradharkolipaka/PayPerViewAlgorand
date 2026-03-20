"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import Confetti from "react-confetti";
import { Loader2, Play, Lock } from "lucide-react";
import algosdk from "algosdk";
import { useRouter } from "next/navigation";

import { type NftData } from "@/lib/nftService";
import { fromMicroAlgos, getAlgodClient, toMicroAlgos } from "@/lib/algorand";
import { peraWallet, reconnectOnce } from "@/lib/peraWallet";
import { usePeraAccount } from "@/hooks/usePeraAccount";
import { PAY_PER_VIEW_AMOUNT_ALGO } from "@/constants";

interface NFTCardProps {
  nft: NftData;
  onDelete?: (tokenId: number) => void;
  /** Called IMMEDIATELY after tx submission for optimistic UI update */
  onDonation?: (payload: { donor: string; amount: bigint; tokenId: number }) => void;
  /** Called AFTER on-chain confirmation — triggers hard refetch */
  onTotalsChange?: () => void;
}

export default function NFTCard({ nft, onDelete, onDonation, onTotalsChange }: NFTCardProps) {
  const { tokenId, metadata, owner, totalDonations } = nft;
  const [showConfetti, setShowConfetti] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [isPaying, setIsPaying] = useState(false);
  const { account } = usePeraAccount();
  const { toast } = useToast();
  const payClickedRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    void reconnectOnce();
  }, []);

  // Check if the current viewer is the owner (owners watch free)
  const isOwner = !!account && !!owner && account === owner;

  const handlePayToWatch = async () => {
    if (payClickedRef.current) return;
    payClickedRef.current = true;

    if (!owner || typeof owner !== "string") {
      toast({ title: "Error", description: "Video owner address is missing.", variant: "destructive" });
      payClickedRef.current = false;
      return;
    }
    if (!account) {
      toast({ title: "Wallet Not Connected", description: "Please connect Pera Wallet first.", variant: "destructive" });
      payClickedRef.current = false;
      return;
    }

    const amountMicro = toMicroAlgos(PAY_PER_VIEW_AMOUNT_ALGO);

    try {
      setIsPaying(true);

      console.log("[NFTCard] === PAY PER VIEW INITIATED ===");
      console.log("[NFTCard] Asset ID:", tokenId);
      console.log("[NFTCard] Amount (ALGO):", PAY_PER_VIEW_AMOUNT_ALGO);
      console.log("[NFTCard] Sender:", account);
      console.log("[NFTCard] Receiver:", owner);

      toast({ title: "Preparing payment...", description: `${PAY_PER_VIEW_AMOUNT_ALGO} ALGO to watch this video.` });

      const algodClient = getAlgodClient();
      const params = await algodClient.getTransactionParams().do();

      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: account,
        receiver: owner,
        amount: amountMicro,
        note: new Uint8Array(Buffer.from(`PayPerView for ${tokenId}`)),
        suggestedParams: params,
      });

      toast({ title: "Waiting for wallet signature...", description: "Approve the payment in Pera Wallet." });

      const txnGroup = [{ txn, signers: [account] }];
      const signedTxns = await peraWallet.signTransaction([txnGroup]);
      if (!signedTxns?.[0]) throw new Error("Transaction signing was cancelled or failed.");

      const sendRes = await algodClient.sendRawTransaction(signedTxns[0]).do();
      const txId = (sendRes as any).txId ?? (sendRes as any).txid;
      console.log("[NFTCard] TxID:", txId);

      toast({ title: "Payment submitted", description: `TxID: ${txId}. Waiting for confirmation...` });

      if (onDonation) {
        onDonation({ donor: account, amount: amountMicro, tokenId });
      }

      const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
      const confirmedRound = (confirmedTxn as any)?.["confirmed-round"] ?? (confirmedTxn as any)?.confirmedRound;

      console.log("[NFTCard] === PAYMENT CONFIRMED ===");
      console.log("[NFTCard] Confirmed Round:", confirmedRound);

      toast({ title: "Payment Confirmed!", description: `Redirecting to video player...` });

      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);

      setEvents((prev) => [{ donor: account, amount: amountMicro, txId, confirmedRound }, ...prev]);

      // Trigger revenue refetch in background
      if (onTotalsChange) {
        setTimeout(() => onTotalsChange(), 2000);
      }

      // Redirect to fullscreen video player page
  // NOTE: We no longer pass the raw IPFS video URL via query params.
  // The /watch/[tokenId] page uses an x402-style server gate to decide
  // whether the viewer has paid and then returns the playable URL.
  router.push(`/watch/${tokenId}`);

      console.log("[NFTCard] === PAY PER VIEW COMPLETE — REDIRECTING ===");
    } catch (err) {
      console.error("[NFTCard] === PAYMENT FAILED ===", err);
      toast({ title: "Payment Failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setIsPaying(false);
      payClickedRef.current = false;
    }
  };

  // Owner clicks → go straight to player (no payment)
  const handleOwnerWatch = () => {
    router.push(`/watch/${tokenId}`);
  };

  const shortenedAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

  const computedTotalDonations = totalDonations ?? 0n;
  const videoUrl = metadata?.video || metadata?.image || null;

  return (
    <>
      {showConfetti && <Confetti />}
      <Card className="overflow-hidden">
        <CardHeader className="p-0">
          <div className="relative w-full h-64 bg-black">
            {/* Always show video as a muted cover/thumbnail — never playable inline */}
            {videoUrl ? (
              <>
                <video
                  src={videoUrl}
                  muted
                  playsInline
                  loop
                  autoPlay
                  className="w-full h-full object-cover pointer-events-none"
                />
                {/* Dark overlay with lock icon */}
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                  <Lock className="h-10 w-10 text-white/80 mb-2" />
                  <p className="text-white text-sm font-medium">
                    {PAY_PER_VIEW_AMOUNT_ALGO} ALGO to watch
                  </p>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                <Lock className="h-12 w-12 mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-medium">
                  Pay {PAY_PER_VIEW_AMOUNT_ALGO} ALGO to watch
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          <CardTitle>{metadata?.name || `Video #${tokenId}`}</CardTitle>
          <p className="text-sm text-muted-foreground truncate">
            {metadata?.description}
          </p>
          {typeof owner === "string" && (
            <p className="text-xs">Creator: {shortenedAddress(owner)}</p>
          )}
        </CardContent>
        <CardFooter className="flex justify-between items-center p-4 bg-muted/50">
          <div>
            <p className="text-sm font-bold">{`${fromMicroAlgos(computedTotalDonations)} ALGO`}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </div>
          {isOwner ? (
            <Button variant="outline" size="sm" onClick={handleOwnerWatch}>
              <Play className="mr-1.5 h-4 w-4" />
              Watch (Owner)
            </Button>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button disabled={isPaying}>
                  <Play className="mr-1.5 h-4 w-4" />
                  Watch · {PAY_PER_VIEW_AMOUNT_ALGO} ALGO
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    Pay Per View — {metadata?.name || `Video #${tokenId}`}
                  </DialogTitle>
                  <DialogDescription>
                    Pay a fixed {PAY_PER_VIEW_AMOUNT_ALGO} ALGO to the creator to
                    watch this video in full screen. Like a movie theater — each
                    viewing requires a ticket.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4 text-center">
                    <p className="text-2xl font-bold">{PAY_PER_VIEW_AMOUNT_ALGO} ALGO</p>
                    <p className="text-xs text-muted-foreground mt-1">One-time viewing ticket</p>
                  </div>
                  <Button
                    onClick={handlePayToWatch}
                    disabled={isPaying}
                    className="w-full"
                  >
                    {isPaying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...
                      </>
                    ) : (
                      `Pay ${PAY_PER_VIEW_AMOUNT_ALGO} ALGO & Watch`
                    )}
                  </Button>
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Recent Views</h4>
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-2">
                      {events.length > 0 ? (
                        events.map((event, index) => (
                          <div
                            key={index}
                            className="text-xs text-muted-foreground flex justify-between"
                          >
                            <span>{shortenedAddress(event.donor)}</span>
                            <span>
                              {fromMicroAlgos(
                                typeof event.amount === "bigint"
                                  ? event.amount
                                  : BigInt(event.amount ?? 0)
                              )}{" "}
                              ALGO
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No views yet. Be the first!
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardFooter>
      </Card>
    </>
  );
}
