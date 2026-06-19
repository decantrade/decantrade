import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import type { DecantSolana } from "./idlType";

export const USDC = 1_000_000; // 1e6 fixed point (matches USDC 6 decimals)
export const PROGRAM_ID = new PublicKey(idl.address);

// Devnet config. Filled in after `anchor deploy` + market init.
// Overridable via NEXT_PUBLIC_* env vars so the same build works for any market.
export const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as
  | "devnet"
  | "mainnet";
export const IS_MAINNET = NETWORK === "mainnet";

export const CLUSTER_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (IS_MAINNET
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");
export const MARKET_ID = new BN(process.env.NEXT_PUBLIC_MARKET_ID ?? "1");
export const COLLATERAL_MINT = process.env.NEXT_PUBLIC_COLLATERAL_MINT
  ? new PublicKey(process.env.NEXT_PUBLIC_COLLATERAL_MINT)
  : null;

export function marketPda(marketId: BN = MARKET_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];
}
export function vaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID
  )[0];
}
export function userBalancePda(market: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bal"), market.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}
export function positionPda(market: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pos"), market.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function getProgram(provider: AnchorProvider): Program<DecantSolana> {
  return new Program(idl as DecantSolana, provider);
}

export function getReadonlyProvider(): AnchorProvider {
  const conn = new Connection(CLUSTER_URL, "confirmed");
  // dummy wallet for read-only account fetches
  const wallet = {
    publicKey: PublicKey.default,
    signTransaction: async (t: any) => t,
    signAllTransactions: async (t: any) => t,
  };
  return new AnchorProvider(conn, wallet as any, { commitment: "confirmed" });
}

export const fmtUsd = (raw: number | BN | undefined): string => {
  if (raw === undefined) return "—";
  const n = typeof raw === "number" ? raw : raw.toNumber();
  return `$${(n / USDC).toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
};
