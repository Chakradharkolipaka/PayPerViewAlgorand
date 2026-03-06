import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import PageTransitionWrapper from "@/components/PageTransitionWrapper";
import { ThemeProvider } from "@/app/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import BottomNav from "@/components/BottomNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pay Per View — Algorand",
  description: "Upload videos, earn ALGO per view. Pay-Per-View on Algorand.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="min-h-screen bg-background dark:bg-gradient-to-b dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
            <Navbar />
            <PageTransitionWrapper>{children}</PageTransitionWrapper>
            <Toaster />
            <BottomNav />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
