"use client";

import { useSearchParams, useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PAY_PER_VIEW_AMOUNT_ALGO } from "@/constants";

export default function WatchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();

  const videoUrl = searchParams.get("v") || "";
  const videoName = searchParams.get("name") || `Video #${params.tokenId}`;

  const handleExit = () => {
    // Navigate back to home — video is locked again (theater model)
    router.push("/");
  };

  if (!videoUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white">
        <p className="text-lg mb-4">No video URL provided.</p>
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
