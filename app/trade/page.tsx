import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { MobileNav, type MobileNavLink } from "@/components/MobileNav";
import { TradeApp } from "@/components/trade/TradeApp";

const MOBILE_LINKS: MobileNavLink[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "How it works", href: "/#how", icon: "how" },
  { label: "Docs", href: "/docs", icon: "docs" },
  { label: "FAQ", href: "/#faq", icon: "faq" },
  { label: "Reserve spot", href: "/#waitlist", icon: "reserve", primary: true },
];

const MOBILE_SOCIALS: MobileNavLink[] = [
  { label: "GitHub", href: "https://github.com/decantrade/decantrade", external: true, icon: "github" },
  { label: "X / Twitter", href: "https://x.com/_decantrade", external: true, icon: "x" },
];

export const metadata: Metadata = {
  title: "Trade · Decant testnet",
  description:
    "Trade perpetual futures on the Decant testnet app — ETH/USD and BTC/USD vAMM markets on Base Sepolia.",
  robots: { index: true, follow: true },
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
            className="hidden text-xs uppercase tracking-[0.18em] text-ink-dim hover:text-ink md:block"
          >
            ← Home
          </Link>
          <MobileNav links={MOBILE_LINKS} socials={MOBILE_SOCIALS} />
        </div>
      </header>
      <main className="flex-1">
        <TradeApp />
      </main>
      <Footer />
    </div>
  );
}
