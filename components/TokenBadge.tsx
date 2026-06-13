"use client";

import { useState } from "react";

export const DECANT_TOKEN = {
  ticker: "$DECANT",
  address: "0x10feE05Ef916625FD86b2fED432e325bE897BBa3",
  explorer:
    "https://basescan.org/token/0x10feE05Ef916625FD86b2fED432e325bE897BBa3",
};

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function TokenBadge({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(DECANT_TOKEN.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel px-3 py-2 ${className}`}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">
        {DECANT_TOKEN.ticker}
      </span>
      <span className="text-line">·</span>
      <a
        href={DECANT_TOKEN.explorer}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-ink-soft transition-colors hover:text-amber sm:hidden"
        title={DECANT_TOKEN.address}
      >
        {short(DECANT_TOKEN.address)}
      </a>
      <a
        href={DECANT_TOKEN.explorer}
        target="_blank"
        rel="noreferrer"
        className="hidden font-mono text-xs text-ink-soft transition-colors hover:text-amber sm:inline"
        title={DECANT_TOKEN.address}
      >
        {DECANT_TOKEN.address}
      </a>
      <button
        type="button"
        onClick={copy}
        className="rounded-sm border border-line px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-ink-dim transition-colors hover:border-amber hover:text-amber"
        aria-label="Copy contract address"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

export function TokenBanner() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(DECANT_TOKEN.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="border-y border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tracking-tight text-amber">
              {DECANT_TOKEN.ticker}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              Token · Base
            </span>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-dim sm:hidden">
              Contract address
            </div>
            <code className="block w-full select-all break-all rounded-sm border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink sm:text-base">
              {DECANT_TOKEN.address}
            </code>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-sm bg-amber px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-black transition-opacity hover:opacity-90"
              >
                {copied ? "Copied" : "Copy CA"}
              </button>
              <a
                href={DECANT_TOKEN.explorer}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-sm border border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft transition-colors hover:border-amber hover:text-amber"
              >
                BaseScan ↗
              </a>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink-dim">
          Official $DECANT contract — only trust this address shown on decantrade.com. Beware of impersonators.
        </p>
      </div>
    </section>
  );
}
