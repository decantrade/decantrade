import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { base } from "viem/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

// Decant runs on Base. Waitlist only needs read + message signing (no gas),
// so we ship gas-free connectors and skip WalletConnect (which needs a
// projectId) for now — it can be added later.
export function getConfig() {
  return createConfig({
    chains: [base],
    connectors: [
      injected(),
      coinbaseWallet({ appName: "Decant", preference: "all" }),
    ],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
      [base.id]: http(),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
