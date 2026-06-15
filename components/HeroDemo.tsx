// Hero proof clip: a real /trade screen recording showing index-based PnL —
// the oracle price moves, the vAMM mark stays flat, and unrealized PnL still
// tracks the oracle. Framed like a browser window to match the brand chrome.
// Autoplays muted + looped; a poster keeps the frame filled before playback.

export function HeroDemo() {
  return (
    <div className="relative">
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
            live demo
          </span>
        </div>

        <video
          className="block w-full"
          src="/demo-index-pnl.mp4"
          poster="/demo-index-pnl.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Decant /trade demo: ETH oracle price rises, vAMM mark stays flat, and unrealized PnL tracks the oracle"
        />

        {/* caption */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-ink-dim">
          <span className="text-ink-soft">Index-based PnL</span>
          <span className="text-line">/</span>
          <span>ETH oracle +5%, zero trades on the book</span>
          <span className="text-line">/</span>
          <span className="text-green">PnL $0 → +$25, mark flat</span>
        </div>
      </div>
    </div>
  );
}
