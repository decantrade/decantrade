import Link from "next/link";
import { Logo } from "./Logo";
import { TokenBadge } from "./TokenBadge";

const SOCIALS = [
  { label: "X", href: "https://x.com/_decantrade" },
  { label: "GitHub", href: "https://github.com/decantrade/decantrade" },
];

const LEGAL = [
  { label: "Docs", href: "/docs" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Risk", href: "/risk" },
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
                perpetual futures on Solana
              </div>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-amber"
              >
                {s.label}
              </a>
            ))}
            {LEGAL.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-xs uppercase tracking-[0.15em] text-ink-soft transition-colors hover:text-amber"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[11px] uppercase tracking-[0.15em] text-ink-dim">
            $DECANT token
          </span>
          <TokenBadge />
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-6 text-[11px] text-ink-dim sm:flex-row sm:items-center sm:justify-between">
          <span className="uppercase tracking-[0.15em]">
            testnet · pre-audit · not real money
          </span>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span>
              Built by{" "}
              <a
                href="https://x.com/avantisfi"
                target="_blank"
                rel="noreferrer"
                className="text-ink-soft transition-colors hover:text-amber"
              >
                @avantisfi
              </a>
            </span>
            <span>
              © {new Date().getFullYear()} Decant. Not financial advice.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
