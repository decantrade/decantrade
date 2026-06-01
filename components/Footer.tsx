import { Logo } from "./Logo";

const SOCIALS = [
  { label: "X", href: "https://x.com/decanttrade" },
  { label: "GitHub", href: "#" },
  { label: "Discord", href: "#" },
  { label: "Docs", href: "#" },
];

export function Footer() {
  return (
    <footer className="bg-bg">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <Logo className="h-5 w-5 text-amber" />
            <div>
              <div className="text-sm font-semibold tracking-[0.18em]">
                DECANT
              </div>
              <div className="text-[11px] text-ink-dim">
                perpetual futures on Base
              </div>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-6">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target={s.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-amber"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-[11px] text-ink-dim sm:flex-row sm:items-center sm:justify-between">
          <span className="uppercase tracking-[0.15em]">
            testnet · pre-audit · not real money
          </span>
          <span>© {new Date().getFullYear()} Decant. Not financial advice.</span>
        </div>
      </div>
    </footer>
  );
}
