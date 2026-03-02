"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { Home, PlusCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useContext, useEffect, useRef } from "react";
import { WalletContext } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function Navbar() {
  const pathname = usePathname();
  const wallet = useContext(WalletContext);
  const { toast } = useToast();
  const lastAddr = useRef<string | null>(null);

  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  useEffect(() => {
    if (!wallet) return;
    if (wallet.address && wallet.address !== lastAddr.current) {
      toast({
        title: "Wallet connected",
        description: `Connected: ${short(wallet.address)} ${wallet.provider === "kibisis" ? "(Kibisis)" : "(Pera)"}`,
      });
    }
    lastAddr.current = wallet.address;
  }, [toast, wallet]);

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
              <span className="text-xs text-muted-foreground leading-tight">
                Support creators on-chain
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${
                pathname === "/" ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </Link>
            <Link
              href="/mint"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${
                pathname === "/mint" ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <PlusCircle className="h-4 w-4" />
              <span>Mint NFT</span>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {wallet?.address ? (
            <Button variant="outline" onClick={wallet.disconnect}>
              {short(wallet.address)} {wallet.provider === "kibisis" ? "(Kibisis)" : "(Pera)"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    toast({
                      title: "Connecting Kibisis...",
                      description: "Approve the connection in the Kibisis extension.",
                    });
                    await wallet?.connect?.("kibisis");
                  } catch (e) {
                    toast({
                      title: "Kibisis connection failed",
                      description: e instanceof Error ? e.message : String(e),
                      variant: "destructive",
                    });
                  }
                }}
                disabled={wallet?.isConnecting}
              >
                Kibisis
              </Button>
              <Button
                onClick={async () => {
                  try {
                    toast({
                      title: "Connecting Pera...",
                      description: "Approve the connection in Pera Wallet.",
                    });
                    await wallet?.connect?.("pera");
                  } catch (e) {
                    toast({
                      title: "Pera connection failed",
                      description: e instanceof Error ? e.message : String(e),
                      variant: "destructive",
                    });
                  }
                }}
                disabled={wallet?.isConnecting}
              >
                Pera
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
