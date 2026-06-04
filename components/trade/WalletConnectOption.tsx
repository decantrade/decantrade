"use client";

import { useConfig, useConnect } from "wagmi";
import { walletConnect } from "@/lib/wcConnector";
import { WALLETCONNECT_PROJECT_ID } from "@/lib/wagmi";

// Loaded via next/dynamic with `ssr: false` so the heavy WalletConnect SDK is
// excluded from the server worker bundle (which has a hard 3 MiB size limit on
// Cloudflare's free plan) and never runs during SSR (it needs `indexedDB`).
// The connector is registered against the live wagmi config at runtime.
export default function WalletConnectOption({
  onSelect,
  className,
}: {
  onSelect: () => void;
  className: string;
}) {
  const config = useConfig();
  const { connect } = useConnect();
  return (
    <button
      className={className}
      onClick={() => {
        onSelect();
        const existing = config.connectors.find(
          (c) => c.id === "walletConnect",
        );
        const connector =
          existing ??
          (() => {
            const c = config._internal.connectors.setup(
              walletConnect({
                projectId: WALLETCONNECT_PROJECT_ID ?? "",
                showQrModal: true,
                metadata: {
                  name: "Decant",
                  description: "Permissionless perpetual futures on Base",
                  url: "https://decantrade.com",
                  icons: ["https://decantrade.com/icon.svg"],
                },
              }),
            );
            config._internal.connectors.setState((prev) => [...prev, c]);
            return c;
          })();
        connect({ connector });
      }}
    >
      WalletConnect
    </button>
  );
}
