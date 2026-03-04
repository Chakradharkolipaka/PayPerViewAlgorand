"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { Home, PlusCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { connectPera, disconnectPera } from "@/lib/peraWallet";
import { usePeraAccount } from "@/hooks/usePeraAccount";

export default function Navbar() {
  const pathname = usePathname();
  const { toast } = useToast();
  const lastAddr = useRef<string | null>(null);
  const { account: address } = usePeraAccount();

  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  useEffect(() => {
    const addr = address;
    if (addr && addr !== lastAddr.current) {
      toast({
        title: "Wallet connected",
        description: `Connected: ${short(addr)} (pera)`,
      });
    }
    lastAddr.current = addr ?? null;
  }, [toast, address]);

  return (
    <nav className="hidden md:flex sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-background text-sm font-bold">
              FD
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">Fan Donation</span>
              <span className="text-xs text-muted-foreground leading-tight">Support creators on-chain</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${pathname === "/" ? "bg-accent text-accent-foreground" : ""}`}
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </Link>
            <Link
              href="/mint"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${pathname === "/mint" ? "bg-accent text-accent-foreground" : ""}`}
            >
              <PlusCircle className="h-4 w-4" />
              <span>Mint NFT</span>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          {address ? (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await disconnectPera();
                } catch {
                  // ignore
                }
              }}
            >
              {short(address)} (Pera)
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  toast({
                    title: "Connecting Pera...",
                    description: "Approve the connection in Pera Wallet.",
                  });
                  await connectPera();
                } catch (e) {
                  toast({
                    title: "Pera connection failed",
                    description: e instanceof Error ? e.message : String(e),
                    variant: "destructive",
                  });
                }
              }}
            >
              Connect Pera
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
}
