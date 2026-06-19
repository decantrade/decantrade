// Decorative app mockup shown in the hero — a stylized rendering of the /trade
// terminal. Built with SVG + divs (not a bitmap) so it stays crisp at any size,
// themes with the brand tokens, and ships almost no bytes. Purely presentational.

const CANDLES = (() => {
  // Deterministic pseudo-random walk so the chart looks organic but never
  // shifts between builds.
  let seed = 9;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out: { o: number; c: number; h: number; l: number }[] = [];
  let price = 96;
  for (let i = 0; i < 26; i++) {
    const o = price;
    const drift = (rnd() - 0.46) * 14;
    const c = Math.max(20, Math.min(128, o + drift));
    const h = Math.max(o, c) + rnd() * 7;
    const l = Math.min(o, c) - rnd() * 7;
    out.push({ o, c, h, l });
    price = c;
  }
  return out;
})();

const CHART_W = 360;
const CHART_H = 150;
const STEP = CHART_W / CANDLES.length;

// Normalize the walk into the chart box with padding so it always fills the
// vertical space nicely regardless of where the random walk drifts.
const PAD = 16;
const LO = Math.min(...CANDLES.map((c) => c.l));
const HI = Math.max(...CANDLES.map((c) => c.h));
const scaleY = (v: number) =>
  CHART_H - PAD - ((v - LO) / (HI - LO)) * (CHART_H - 2 * PAD);
const LAST_Y = scaleY(CANDLES[CANDLES.length - 1].c);

export function HeroMockup() {
  return (
    <div className="relative" aria-hidden="true">
      {/* glow */}
      <div className="absolute -inset-6 rounded-3xl bg-amber/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60 ring-1 ring-white/5">
        {/* window bar */}
        <div className="flex items-center justify-between border-b border-line bg-bg-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">
              decantrade.com/trade
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-green">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
            live
          </span>
        </div>

        {/* market tabs */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[11px]">
          <span className="rounded-sm border border-amber/60 bg-amber/10 px-2.5 py-1 font-semibold text-amber">
            SOL-PERP
          </span>
          <span className="px-2 py-1 text-ink-dim">index-priced</span>
          <span className="ml-auto rounded-sm border border-line px-2 py-1 text-ink-soft">
            20×
          </span>
        </div>

        {/* chart */}
        <div className="relative px-4 pb-3 pt-4">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
              SOL-PERP · index
            </span>
            <span className="text-lg font-semibold text-ink">$71.00</span>
            <span className="text-[11px] text-green">+1.74%</span>
          </div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="h-[150px] w-full"
            preserveAspectRatio="none"
          >
            {[30, 70, 110].map((y) => (
              <line
                key={y}
                x1="0"
                x2={CHART_W}
                y1={y}
                y2={y}
                stroke="#2a241f"
                strokeWidth="1"
              />
            ))}
            {CANDLES.map((cd, i) => {
              const x = i * STEP + STEP / 2;
              const up = cd.c >= cd.o;
              const color = up ? "#6fcf97" : "#c2566a";
              const yo = scaleY(cd.o);
              const yc = scaleY(cd.c);
              const bodyTop = Math.min(yo, yc);
              const bodyH = Math.max(2, Math.abs(yc - yo));
              return (
                <g key={i}>
                  <line
                    x1={x}
                    x2={x}
                    y1={scaleY(cd.h)}
                    y2={scaleY(cd.l)}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  <rect
                    x={x - STEP * 0.3}
                    y={bodyTop}
                    width={STEP * 0.6}
                    height={bodyH}
                    fill={color}
                  />
                </g>
              );
            })}
            <line
              x1="0"
              x2={CHART_W}
              y1={LAST_Y}
              y2={LAST_Y}
              stroke="#e8b84b"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
            />
          </svg>
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
          {[
            { label: "Index", value: "$71.00" },
            { label: "Insurance", value: "$5,000" },
            { label: "Fee", value: "0.10%" },
          ].map((s) => (
            <div key={s.label} className="bg-panel px-4 py-3">
              <div className="text-[9px] uppercase tracking-[0.16em] text-ink-dim">
                {s.label}
              </div>
              <div className="mt-1 text-[13px] text-ink">{s.value}</div>
            </div>
          ))}
        </div>

        {/* order ticket */}
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <span className="flex-1 rounded-sm bg-green/15 px-3 py-2 text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-green">
            Long
          </span>
          <span className="flex-1 rounded-sm border border-line px-3 py-2 text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-wine">
            Short
          </span>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-line bg-bg-soft px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            <span className="text-amber">◎</span> USDC-margined
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            isolated margin
          </span>
        </div>
      </div>
    </div>
  );
}
