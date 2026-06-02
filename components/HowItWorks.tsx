import { Reveal } from "./Reveal";

const FEATURES = [
  {
    tag: "01",
    title: "Permissionless launcher",
    body: "Pick any Base token with a DEX pool, set leverage and trading fee, click deploy. The market goes live on-chain in about 60 seconds — no approval queue, no auction.",
  },
  {
    tag: "02",
    title: "Coin-margined",
    body: "Traders deposit the same token they trade. Open a $DEGEN perp and your margin and PnL are denominated in $DEGEN — no USDC dependency required.",
  },
  {
    tag: "03",
    title: "vAMM liquidity",
    body: "A virtual AMM seeds instant liquidity at launch with a constant-impact curve. No need to bootstrap an order book before the first trade.",
  },
  {
    tag: "04",
    title: "Oracle pricing",
    body: "Pyth feeds where they exist; a Uniswap V3 TWAP fallback for long-tail tokens. Marks are derived on-chain, not from a centralized server.",
  },
  {
    tag: "05",
    title: "Insurance fund",
    body: "Every market carries its own insurance fund, funded by trading fees, that absorbs bad debt from underwater liquidations. Risk is isolated per market.",
  },
  {
    tag: "06",
    title: "Fully on-chain",
    body: "Positions, margin, funding and liquidations all settle on Base. Anyone can read the contract state and verify every number on BaseScan.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-amber">
            ── How it works
          </p>
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Not an order book. <br className="hidden sm:block" />
            Not a fragile AMM.
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-ink-soft">
            Trades execute against an on-chain vAMM using oracle-derived
            pricing. The same engine runs every market — only the pricing knob
            changes per token.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.tag} delay={(i % 3) * 0.06}>
              <div className="group h-full bg-panel p-6 transition-colors hover:bg-bg-soft">
                <div className="mb-4 font-mono text-xs text-amber/70">
                  {f.tag}
                </div>
                <h3 className="text-base font-semibold text-ink">{f.title}</h3>
                <p className="mt-3 text-[13px] leading-6 text-ink-soft">
                  {f.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
