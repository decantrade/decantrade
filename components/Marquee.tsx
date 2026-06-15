const ITEMS = [
  "eth · btc · sol perps",
  "on-chain perps",
  "built on base",
  "non-custodial · no governance",
  "insurance fund on every market",
  "usdc-margined",
  "don't trust, verify",
  "guarded beta — real funds, trade small",
];

export function Marquee() {
  const line = [...ITEMS, ...ITEMS];
  return (
    <div className="relative w-full overflow-hidden border-b border-line bg-bg-soft py-2">
      <div className="flex w-max animate-marquee whitespace-nowrap">
        {line.map((item, i) => (
          <span
            key={i}
            className="mx-0 flex items-center text-[11px] uppercase tracking-[0.2em] text-ink-dim"
          >
            <span className="px-6">{item}</span>
            <span className="text-amber/50">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
