import { Logo } from "./Logo";

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Network", href: "#network" },
  { label: "FAQ", href: "#faq" },
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

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-amber/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-amber sm:inline-block">
            Base · Testnet
          </span>
          <a
            href="/trade"
            className="hidden text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-amber sm:inline-block"
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
      </div>
    </header>
  );
}
