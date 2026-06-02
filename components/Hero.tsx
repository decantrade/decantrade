import { Reveal } from "./Reveal";

const STATS = [
  { label: "Status", value: "testnet" },
  { label: "Leverage", value: "up to 50×" },
  { label: "Oracle", value: "Pyth + TWAP" },
  { label: "Chain", value: "Base · 8453" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="grid-bg grid-bg-fade absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-20 sm:pt-28">
        <Reveal>
          <div className="mb-7 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink-dim">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
            <span className="text-green">live on testnet</span>
            <span className="text-line">/</span>
            <span>audit before mainnet</span>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Perp futures for{" "}
            <span className="text-amber">every Base</span> token.
          </h1>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-7 max-w-xl text-sm leading-7 text-ink-soft sm:text-base">
            Anyone launches a leveraged market on any Base token in 60
            seconds — no listing fee, no governance vote, no gatekeeper.
            Coin-margined, fully on-chain, with an insurance fund and a vAMM on
            every market.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-10 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-panel px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                  {s.label}
                </div>
                <div className="mt-1 text-sm text-ink">{s.value}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="#waitlist"
              className="group inline-flex items-center gap-2 rounded-sm bg-amber px-5 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-black transition-opacity hover:opacity-90"
            >
              Reserve your spot
              <span className="transition-transform group-hover:translate-y-0.5">
                ↓
              </span>
            </a>
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">
              invite-only · referral code required
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
