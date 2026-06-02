import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

// Decant runs on Base. The marketing site targets Base mainnet; the live testnet
// trading app (/trade) targets Base Sepolia. We ship gas-free connectors and skip
// WalletConnect (which needs a projectId) for now — it can be added later.
export function getConfig() {
  return createConfig({
    chains: [base, baseSepolia],
    connectors: [
      injected(),
      coinbaseWallet({ appName: "Decant", preference: "all" }),
    ],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
