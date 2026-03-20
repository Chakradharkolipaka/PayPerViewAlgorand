"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PAY_PER_VIEW_AMOUNT_ALGO } from "@/constants";
import { useToast } from "@/components/ui/use-toast";
import { usePeraAccount } from "@/hooks/usePeraAccount";
import { connectPera, peraWallet, reconnectOnce } from "@/lib/peraWallet";
import algosdk from "algosdk";
import { getAlgodClient } from "@/lib/algorand";

type WatchAllowedPayload = {
  tokenId: number;
  owner: string;
  metadata: any;
  videoUrl: string;
};

type WatchRequiredPaymentPayload = {
  tokenId: number;
  requiredPayment: {
    receiver: string;
    amountMicro: string;
    amountAlgo: number;
    note: string;
  };
};

export default function WatchPage() {
  const router = useRouter();
  const params = useParams();

  const tokenId = useMemo(() => Number(params.tokenId), [params.tokenId]);
  const { toast } = useToast();
  const { account } = usePeraAccount();
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [allowed, setAllowed] = useState<WatchAllowedPayload | null>(null);
  const [requiredPayment, setRequiredPayment] = useState<WatchRequiredPaymentPayload["requiredPayment"] | null>(null);
  const loadAttemptRef = useRef(0);

  const handleExit = () => {
    // Navigate back to home — video is locked again (theater model)
    router.push("/");
  };

  const loadGate = useCallback(
    async (viewer: string) => {
      const thisAttempt = ++loadAttemptRef.current;
      setIsLoading(true);

      try {
        const res = await fetch(`/api/watch/${tokenId}?viewer=${encodeURIComponent(viewer)}` as const, {
          cache: "no-store",
        });

        if (thisAttempt !== loadAttemptRef.current) return;

        if (res.status === 402) {
          const data = (await res.json()) as WatchRequiredPaymentPayload;
          setAllowed(null);
          setRequiredPayment(data.requiredPayment);
          return;
        }

        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(`Gate request failed (${res.status}). ${msg}`.trim());
        }

        const data = (await res.json()) as WatchAllowedPayload;
        setRequiredPayment(null);
        setAllowed(data);
      } finally {
        if (thisAttempt === loadAttemptRef.current) setIsLoading(false);
      }
    },
    [tokenId]
  );

  useEffect(() => {
    void reconnectOnce();
  }, []);

  useEffect(() => {
    if (!Number.isFinite(tokenId) || tokenId <= 0) {
      setIsLoading(false);
      toast({
        title: "Invalid video",
        description: "The video id in the URL is invalid.",
        variant: "destructive",
      });
      return;
    }

    if (!account) {
      setIsLoading(false);
      setAllowed(null);
      setRequiredPayment(null);
      return;
    }

    void loadGate(account);
  }, [account, tokenId, loadGate, toast]);

  const handleConnectWallet = async () => {
    try {
      await connectPera();
    } catch (e) {
      toast({
        title: "Wallet connection failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handlePayAndUnlock = async () => {
    if (!account) {
      toast({
        title: "Wallet not connected",
        description: "Please connect Pera Wallet to watch.",
        variant: "destructive",
      });
      return;
    }
    if (!requiredPayment) {
      toast({
        title: "Nothing to pay",
        description: "This video is not requesting payment right now.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsPaying(true);
      const algod = getAlgodClient();
      const sp = await algod.getTransactionParams().do();

      const amountMicro = BigInt(requiredPayment.amountMicro);
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: account,
        receiver: requiredPayment.receiver,
        amount: amountMicro,
        note: new Uint8Array(Buffer.from(requiredPayment.note)),
        suggestedParams: sp,
      });

      toast({
        title: "Approve payment",
        description: `Pay ${requiredPayment.amountAlgo} ALGO in Pera Wallet to unlock.`,
      });

      const txnGroup = [{ txn, signers: [account] }];
      const signed = await peraWallet.signTransaction([txnGroup]);
      if (!signed?.[0]) throw new Error("Transaction signing was cancelled or failed.");

      const sendRes = await algod.sendRawTransaction(signed[0]).do();
      const txId = (sendRes as any).txId ?? (sendRes as any).txid;
      await algosdk.waitForConfirmation(algod, txId, 4);

      toast({ title: "Unlocked", description: "Payment confirmed. Loading video..." });
      await loadGate(account);
    } catch (e) {
      toast({
        title: "Payment failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setIsPaying(false);
    }
  };

  // In x402 mode we always derive name/video from the server response.
  const videoName =
    allowed?.metadata?.name || (Number.isFinite(tokenId) ? `Video #${tokenId}` : "Video");
  const videoUrl = allowed?.videoUrl || "";

  if (!account) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white gap-4 px-6">
        <p className="text-lg font-semibold">Connect your wallet to watch</p>
        <p className="text-sm text-white/70 text-center max-w-md">
          This app uses an x402-style pay-per-view gate. Your wallet address is required so the server can verify on-chain payment.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExit}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
          <Button onClick={handleConnectWallet}>Connect Pera</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white gap-3">
        <p className="text-lg font-semibold">Loading…</p>
        <p className="text-sm text-white/60">Checking pay-per-view status on-chain.</p>
      </div>
    );
  }

  if (requiredPayment) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white gap-4 px-6">
        <p className="text-xl font-semibold">Ticket required</p>
        <p className="text-sm text-white/70 text-center max-w-md">
          Pay a fixed {PAY_PER_VIEW_AMOUNT_ALGO} ALGO to unlock this video.
        </p>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 w-full max-w-md">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/70">Receiver</span>
            <span className="font-mono text-xs">{requiredPayment.receiver}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-white/70">Amount</span>
            <span className="font-semibold">{requiredPayment.amountAlgo} ALGO</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExit}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Exit
          </Button>
          <Button onClick={handlePayAndUnlock} disabled={isPaying}>
            {isPaying ? "Processing…" : `Pay ${requiredPayment.amountAlgo} ALGO & Watch`}
          </Button>
        </div>
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white gap-4 px-6">
        <p className="text-lg font-semibold">Unable to load video</p>
        <p className="text-sm text-white/70 text-center max-w-md">
          The watch gate didn't return a playable URL.
        </p>
        <Button variant="outline" onClick={handleExit}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur border-b border-white/10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExit}
          className="text-white hover:text-white hover:bg-white/10"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Exit
        </Button>
        <h1 className="text-white text-sm font-semibold truncate max-w-[60%]">
          {videoName}
        </h1>
        <span className="text-xs text-emerald-400 font-medium">
          {PAY_PER_VIEW_AMOUNT_ALGO} ALGO paid
        </span>
      </div>

      {/* Full viewport video player */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <video
          src={videoUrl}
          controls
          autoPlay
          controlsList="nodownload"
          playsInline
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
