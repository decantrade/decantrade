import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { TradeApp } from "@/components/trade/TradeApp";

export const metadata: Metadata = {
  title: "Trade · Decant testnet",
  description:
    "Trade perpetual futures on the Decant testnet app — ETH/USD and BTC/USD vAMM markets on Base Sepolia.",
  robots: { index: false, follow: false },
};

export default function TradePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight">Decant</span>
          </Link>
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.18em] text-ink-dim hover:text-ink"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <TradeApp />
      </main>
      <Footer />
    </div>
  );
}
