import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Docs · Decant",
  description:
    "How Decant works: index pricing, the Pyth oracle, leverage & margin, liquidation, the insurance fund, and the Solana program addresses.",
  alternates: { canonical: "/docs" },
};

const SCAN = "https://explorer.solana.com/address";
const CLUSTER = "?cluster=devnet";

const ADDRESSES = {
  program: "EAYBRfX1Q5ExvAVwGrM4k4eGnTPTvXhJnVFLaaTFsi5t",
  market: "3qN4ppMd4tEjPfRhkE9ChivL3e5Em8mNsNGYNPY1aV5G",
  usdc: "3HqzE8KthdmpwrGqVkqdgoNJEQuiECVLEFxsY1mkPkwA",
};

function Addr({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-ink-soft">{label}</span>
      <a href={`${SCAN}/${address}${CLUSTER}`} target="_blank" rel="noreferrer">
        <code>{address}</code>
      </a>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <Header />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-16 prose-legal">
          <h1>Documentation</h1>
          <p className="updated">Decant · perpetual futures on Solana</p>

          <p>
            Decant is an index-priced perpetual-futures protocol on Solana.
            Trade <strong>SOL-PERP</strong> long or short with leverage —
            USDC-margined and fully on-chain. This page explains how the
            protocol works and how to use the app at{" "}
            <Link href="/trade">/trade</Link>.
          </p>
          <p>
            <strong>Status:</strong> live on <strong>Solana devnet</strong>.
            Collateral is test USDC with no monetary value and the program is{" "}
            <strong>not audited</strong>. See the{" "}
            <Link href="/risk">risk disclaimer</Link>.
          </p>

          <h2>1. Index pricing (no vAMM)</h2>
          <p>
            Decant does not run a virtual AMM or an order book. Your PnL is
            computed directly against an <strong>index price</strong>:
          </p>
          <p>
            <code>pnl = size × (exit − entry) / entry</code>
          </p>
          <p>
            The protocol is the counterparty — the <strong>house</strong>.
            Winning positions are paid from the market&apos;s insurance fund and
            collateral; the payout a market can cover is bounded by the capital
            it actually holds, which keeps the protocol solvent at all times.
          </p>

          <h2>2. Oracle</h2>
          <p>
            The index price comes from <strong>Pyth</strong>. A keeper reads the
            latest SOL/USD price from Pyth off-chain and pushes it on-chain so
            marks track the real market. All amounts are denominated in USDC
            (6-decimal fixed point).
          </p>

          <h2>3. Leverage &amp; margin</h2>
          <p>
            Collateral is deposited per market and positions use{" "}
            <strong>isolated margin</strong> — risk in one market never touches
            another. Notional exposure is <code>margin × leverage</code>. The
            SOL-PERP market allows up to <strong>20×</strong> leverage.
          </p>
          <p>
            Opening a position charges a trading fee on the notional. The
            guarded launch also caps deposit per wallet and total open interest
            per market to bound risk while the program is unaudited.
          </p>

          <h2>4. Liquidation &amp; insurance fund</h2>
          <p>
            Every position must keep its equity above the{" "}
            <strong>maintenance</strong> threshold. If it falls below, anyone
            (typically a keeper bot) can call <code>liquidate</code> to
            force-close it. Each market has its own isolated{" "}
            <strong>insurance fund</strong> that backs trader payouts and
            absorbs bad debt. Risk is isolated per market.
          </p>
          <p>
            The protocol maintains a solvency invariant at all times:{" "}
            <code>
              vault == free collateral + insurance + locked position margin
            </code>
            .
          </p>

          <h2>5. Using the app</h2>
          <ol>
            <li>
              Open <Link href="/trade">/trade</Link> and connect{" "}
              <strong>Phantom</strong> or <strong>Solflare</strong> on{" "}
              <strong>Solana devnet</strong>.
            </li>
            <li>
              <strong>Deposit</strong> USDC as collateral into the SOL-PERP
              market.
            </li>
            <li>
              Pick <strong>Long</strong> or <strong>Short</strong>, set your
              margin and leverage, and open the position.
            </li>
            <li>
              Close the position any time, then <strong>Withdraw</strong> free
              collateral back to your wallet.
            </li>
          </ol>
          <p>
            Need devnet SOL for gas? Use a faucet such as{" "}
            <a
              href="https://faucet.solana.com"
              target="_blank"
              rel="noreferrer"
            >
              faucet.solana.com
            </a>
            .
          </p>

          <h2>6. Program (Solana devnet)</h2>
          <p>All state is on-chain and verifiable on Solana Explorer:</p>
          <div className="my-3 rounded-xl border border-line bg-panel p-4 text-[13px]">
            <Addr label="Program" address={ADDRESSES.program} />
            <Addr label="SOL-PERP market" address={ADDRESSES.market} />
            <Addr label="Test USDC (devnet)" address={ADDRESSES.usdc} />
          </div>

          <h2>7. FAQ</h2>
          <h3>Is this real money?</h3>
          <p>
            No. Decant currently runs on Solana devnet. The test USDC and all
            positions have no monetary value.
          </p>
          <h3>How is the price kept honest?</h3>
          <p>
            The index price is sourced from Pyth and pushed on-chain by a
            keeper. PnL settles directly against that index — there is no vAMM
            mark to manipulate.
          </p>
          <h3>Who is my counterparty?</h3>
          <p>
            The protocol itself (the house). Winning trades are paid from the
            market&apos;s insurance fund and collateral, capped by the capital
            the market holds so the protocol always stays solvent.
          </p>

          <div className="mt-16 flex flex-wrap gap-4 border-t border-line pt-6 text-[11px] uppercase tracking-[0.15em] text-ink-dim">
            <Link href="/trade" className="hover:text-amber">
              Open the app
            </Link>
            <Link href="/risk" className="hover:text-amber">
              Risk
            </Link>
            <Link href="/" className="hover:text-amber">
              ← Back home
            </Link>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
