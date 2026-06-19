import { Reveal } from "./Reveal";

const FEATURES = [
  {
    tag: "01",
    title: "Deposit USDC",
    body: "Connect Phantom or Solflare and deposit USDC as collateral. Your free collateral lives in the market vault and can be withdrawn any time.",
  },
  {
    tag: "02",
    title: "USDC-margined",
    body: "Margin and PnL are denominated in USDC. Open a SOL-PERP long or short, pick your leverage, and the position is fully collateralized on-chain.",
  },
  {
    tag: "03",
    title: "Index-priced",
    body: "No vAMM. PnL is computed straight off the index — size × (exit − entry) / entry. The protocol is the house and pays winners from the insurance fund.",
  },
  {
    tag: "04",
    title: "Pyth oracle",
    body: "The index price comes from Pyth. A keeper pushes the latest price on-chain so marks track the real market, not a centralized server.",
  },
  {
    tag: "05",
    title: "Insurance fund",
    body: "Every market carries its own isolated insurance fund that backs trader payouts and absorbs bad debt from liquidations. Risk never spreads across markets.",
  },
  {
    tag: "06",
    title: "Fully on-chain",
    body: "Positions, margin and liquidations all settle on Solana. Anyone can read the program state and verify every number on Solana Explorer.",
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
            Positions settle against a Pyth index price, not a vAMM or an order
            book. The protocol is the counterparty, with an isolated insurance
            fund backing every market.
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
