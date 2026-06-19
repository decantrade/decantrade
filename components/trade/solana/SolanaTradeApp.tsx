"use client";

import dynamic from "next/dynamic";
import { SolanaProviders } from "./SolanaProviders";

// Wallet adapter + web3 are client-only; keep them out of the SSR/worker bundle.
const SolanaTrade = dynamic(() => import("./SolanaTrade"), { ssr: false });

export function SolanaTradeApp() {
  return (
    <SolanaProviders>
      <SolanaTrade />
    </SolanaProviders>
  );
}
