"use client";

import Link from "next/link";
import { Home, PlusSquare } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function BottomNav() {
  const pathname = usePathname();

  const navLinks = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/mint", icon: PlusSquare, label: "Mint" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-50">
      <div className="flex justify-around items-center h-16">
        {navLinks.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className={cn("flex flex-col items-center justify-center w-full h-full text-sm font-medium transition-colors", pathname === href ? "text-primary" : "text-muted-foreground hover:text-primary")}>
            <Icon className="w-6 h-6 mb-1" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
