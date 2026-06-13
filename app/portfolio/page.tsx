import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { MobileNav, type MobileNavLink } from "@/components/MobileNav";
import { Portfolio } from "@/components/trade/Portfolio";

const MOBILE_LINKS: MobileNavLink[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Trade", href: "/trade", icon: "reserve", primary: true },
  { label: "Docs", href: "/docs", icon: "docs" },
  { label: "FAQ", href: "/#faq", icon: "faq" },
];

const MOBILE_SOCIALS: MobileNavLink[] = [
  { label: "GitHub", href: "https://github.com/decantrade/decantrade", external: true, icon: "github" },
  { label: "X / Twitter", href: "https://x.com/_decantrade", external: true, icon: "x" },
];

export const metadata: Metadata = {
  title: "Portfolio · Decant testnet",
  description:
    "Your Decant testnet portfolio: account equity, free collateral, open positions across markets, and realized PnL.",
  robots: { index: false, follow: true },
};

export default function PortfolioPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold tracking-tight">Decant</span>
          </Link>
          <Link
            href="/trade"
            className="hidden text-xs uppercase tracking-[0.18em] text-ink-dim hover:text-ink md:block"
          >
            ← Trade
          </Link>
          <MobileNav links={MOBILE_LINKS} socials={MOBILE_SOCIALS} />
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.22em] text-amber">── Testnet app</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Portfolio</h1>
          </div>
          <Portfolio />
          <p className="mt-8 text-center text-xs text-ink-dim">
            Testnet only · Base Sepolia · tokens have no value · not audited
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
