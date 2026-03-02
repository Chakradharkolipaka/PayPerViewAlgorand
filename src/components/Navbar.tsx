"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { Home, PlusCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { useContext } from "react";
import { WalletContext } from "@/app/providers";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const pathname = usePathname();
  const wallet = useContext(WalletContext);

  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

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
              {short(wallet.address)}
            </Button>
          ) : (
            <Button onClick={wallet?.connect}>Connect Wallet</Button>
          )}
        </div>
      </div>
    </nav>
  );
}
