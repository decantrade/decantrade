import { Logo } from "./Logo";
import { MobileNav, type MobileNavLink } from "./MobileNav";

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Network", href: "#network" },
  { label: "Docs", href: "/docs" },
  { label: "FAQ", href: "#faq" },
];

const MOBILE_LINKS: MobileNavLink[] = [
  { label: "How it works", href: "#how", icon: "how" },
  { label: "Network", href: "#network", icon: "network" },
  { label: "FAQ", href: "#faq", icon: "faq" },
  { label: "Docs", href: "/docs", icon: "docs" },
  { label: "Trade", href: "/trade", icon: "trade" },
  { label: "Reserve spot", href: "#waitlist", icon: "reserve", primary: true },
];

const MOBILE_SOCIALS: MobileNavLink[] = [
  { label: "GitHub", href: "https://github.com/decent-trade/decantrade", external: true, icon: "github" },
  { label: "X / Twitter", href: "https://x.com/_decantrade", external: true, icon: "x" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2.5 text-ink">
          <Logo className="h-5 w-5 text-amber" />
          <span className="text-sm font-semibold tracking-[0.18em]">
            DECANT
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-amber"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <span className="rounded-full border border-amber/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-amber">
            Base · Testnet
          </span>
          <a
            href="/trade"
            className="text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-amber"
          >
            Trade ↗
          </a>
          <a
            href="#waitlist"
            className="rounded-sm border border-amber bg-amber px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-opacity hover:opacity-90"
          >
            Reserve spot
          </a>
        </div>

        <MobileNav links={MOBILE_LINKS} socials={MOBILE_SOCIALS} />
      </div>
    </header>
  );
}
