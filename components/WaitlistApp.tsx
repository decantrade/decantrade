"use client";

import dynamic from "next/dynamic";
import { SolanaProviders } from "./trade/solana/SolanaProviders";

// Wallet adapter + web3 are client-only; keep them out of the SSR/worker bundle.
const Waitlist = dynamic(
  () => import("./Waitlist").then((m) => m.Waitlist),
  { ssr: false },
);

export function WaitlistApp() {
  return (
    <SolanaProviders>
      <Waitlist />
    </SolanaProviders>
  );
}
