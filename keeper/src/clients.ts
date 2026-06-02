import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

export const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });

export const account = config.keeperPrivateKey ? privateKeyToAccount(config.keeperPrivateKey) : null;

export const wallet = account
  ? createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) })
  : null;

// Concrete client types (the chain's formatters make these incompatible with the
// generic viem PublicClient/WalletClient, so derive them from the instances).
export type DecantPublicClient = typeof publicClient;
export type DecantWalletClient = NonNullable<typeof wallet>;
export type DecantAccount = NonNullable<typeof account>;
