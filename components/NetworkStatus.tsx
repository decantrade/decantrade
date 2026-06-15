"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";

export function NetworkStatus() {
  const [signups, setSignups] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (active && typeof d.signups === "number") setSignups(d.signups);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const cards = [
    {
      label: "Network",
      value: "Base",
      sub: "chain id 8453",
      accent: "text-ink",
    },
    {
      label: "Stage",
      value: "mainnet beta",
      sub: "audit pending · guarded",
      accent: "text-amber",
    },
    {
      label: "Waitlist",
      value: signups === null ? "···" : signups.toLocaleString(),
      sub: "verified signups",
      accent: "text-green",
    },
    {
      label: "Max leverage",
      value: "10×",
      sub: "guarded-beta cap",
      accent: "text-ink",
    },
  ];

  return (
    <section id="network" className="border-b border-line bg-bg-soft">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-amber">
            ── Network status
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Live readout
            </h2>
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">
              [readout] base · mainnet · pre-audit
            </span>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-panel p-6">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                  {c.label}
                </div>
                <div className={`mt-2 text-2xl font-semibold ${c.accent}`}>
                  {c.value}
                </div>
                <div className="mt-1 text-[11px] text-ink-dim">{c.sub}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
