import { Reveal } from "./Reveal";

export function Why() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2">
        <Reveal>
          <div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-amber">
              ── Why Decant
            </p>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Decant the signal <br className="hidden sm:block" />
              from the sediment.
            </h2>
            <p className="mt-6 text-sm leading-7 text-ink-soft">
              To decant is to pour a liquid off its sediment — keeping the clear
              part, leaving the murk behind. That is the thesis: clean,
              on-chain price discovery for Base perps, without the opaque risk
              and discretionary controls that muddy centralized venues.
            </p>
            <p className="mt-4 text-sm leading-7 text-ink-soft">
              Decant is an EVM-native perpetuals engine. Every market is
              isolated, every position is on-chain, and the risk math is open
              for anyone to verify. No admin can freeze your collateral or
              single you out for forced closure.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="flex flex-col gap-px overflow-hidden rounded-sm border border-line bg-line">
            {[
              {
                k: "Isolated markets",
                v: "Bad debt in one market never touches another. Risk does not spread.",
              },
              {
                k: "Open risk engine",
                v: "Margin, funding and liquidation logic are on-chain and auditable.",
              },
              {
                k: "Non-custodial",
                v: "Collateral stays in the contract under your control — no admin can seize or force-close it.",
              },
              {
                k: "Built for Base",
                v: "Low fees and fast blocks make on-chain perps actually usable.",
              },
            ].map((row) => (
              <div
                key={row.k}
                className="flex flex-col gap-1 bg-panel p-5 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <div className="w-40 shrink-0 text-sm font-semibold text-amber">
                  {row.k}
                </div>
                <div className="text-[13px] leading-6 text-ink-soft">
                  {row.v}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
