"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "@/lib/network";

type Health = {
  ok?: boolean;
  cursor?: string;
  head?: string;
  open?: Record<string, number>;
  balanceEth?: string;
};

// Block lag (head - cursor) above which the keeper is considered to be falling
// behind. The keeper polls every block on Base (~2s), so a healthy keeper sits
// within a handful of blocks of the head.
const LAG_WARN = 60;
// Below this much ETH the keeper risks running out of gas for liquidations.
const GAS_WARN_ETH = 0.002;

type State = "online" | "lagging" | "low-gas" | "offline" | "loading";

const STYLES: Record<State, { dot: string; text: string; label: string }> = {
  online: { dot: "bg-green", text: "text-green", label: "Keeper online" },
  lagging: { dot: "bg-amber", text: "text-amber", label: "Keeper catching up" },
  "low-gas": { dot: "bg-amber", text: "text-amber", label: "Keeper low on gas" },
  offline: { dot: "bg-wine", text: "text-wine", label: "Keeper offline" },
  loading: { dot: "bg-ink-dim", text: "text-ink-dim", label: "Checking keeper…" },
};

export function KeeperStatus() {
  const { network } = useNetwork();
  const [state, setState] = useState<State>("loading");
  const [lag, setLag] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await fetch(`${network.keeperApi}/health`, { cache: "no-store" });
        if (!r.ok) throw new Error("bad status");
        const h = (await r.json()) as Health;
        if (!alive) return;
        const head = Number(h.head ?? 0);
        const cursor = Number(h.cursor ?? 0);
        const blockLag = head > 0 && cursor > 0 ? head - cursor : null;
        setLag(blockLag);
        const gas = Number(h.balanceEth ?? 0);
        if (!h.ok) setState("offline");
        else if (blockLag !== null && blockLag > LAG_WARN) setState("lagging");
        else if (gas > 0 && gas < GAS_WARN_ETH) setState("low-gas");
        else setState("online");
      } catch {
        if (alive) {
          setState("offline");
          setLag(null);
        }
      }
    }
    poll();
    const t = setInterval(poll, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [network.keeperApi]);

  const s = STYLES[state];
  const title =
    state === "lagging" && lag !== null
      ? `Keeper is ${lag} blocks behind the chain head`
      : state === "online"
        ? "Liquidations & funding are running on-chain"
        : s.label;

  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className={s.text}>{s.label}</span>
    </span>
  );
}
