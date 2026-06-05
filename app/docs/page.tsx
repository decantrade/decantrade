import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ADDRESSES, MARKETS } from "@/lib/decant";

export const metadata: Metadata = {
  title: "Docs · Decant",
  description:
    "How Decant works: vAMM pricing, oracles, leverage & margin, funding, liquidation, the insurance fund, the permissionless market factory, and the Base Sepolia contract addresses.",
  alternates: { canonical: "/docs" },
};

const SCAN = "https://sepolia.basescan.org/address";

function Addr({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line-soft py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-ink-soft">{label}</span>
      <a href={`${SCAN}/${address}`} target="_blank" rel="noreferrer">
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
          <p className="updated">Decant · perpetual futures on Base</p>

          <p>
            Decant is a permissionless perpetual-futures protocol on Base.
            Anyone can launch a leveraged market for any token, and anyone can
            trade it — fully on-chain, with no order book and no listing
            gatekeeper. This page explains how the protocol works and how to use
            the testnet app at <Link href="/trade">/trade</Link>.
          </p>
          <p>
            <strong>Status:</strong> live on <strong>Base Sepolia</strong>{" "}
            (testnet). Tokens have no monetary value and the contracts are{" "}
            <strong>not audited</strong>. See the{" "}
            <Link href="/risk">risk disclaimer</Link>.
          </p>

          <h2>1. The vAMM</h2>
          <p>
            Each market prices trades against a <strong>virtual AMM</strong>{" "}
            (vAMM) using a constant-product curve <code>x · y = k</code>. The
            reserves are virtual — no liquidity providers are required — so a
            market has instant liquidity from the moment it is created. Buying
            (long) pushes the mark price up along the curve; selling (short)
            pushes it down. The size of the move depends on trade size relative
            to the virtual reserves (price impact).
          </p>
          <ul>
            <li>
              <strong>Mark price</strong> — the vAMM&apos;s internal price, used
              for PnL and liquidation.
            </li>
            <li>
              <strong>Index price</strong> — the external oracle price of the
              underlying asset (see below).
            </li>
          </ul>

          <h2>2. Oracles</h2>
          <p>
            Markets are anchored to an external price via one of two oracle
            kinds:
          </p>
          <ul>
            <li>
              <strong>Pyth</strong> — used for curated assets that have a Pyth
              feed (ETH, BTC, SOL, …). Low-latency, widely used price feeds.
            </li>
            <li>
              <strong>Uniswap V3 TWAP</strong> — a time-weighted average price
              from a DEX pool, used as a fallback for long-tail tokens that
              have no Pyth feed. This is what makes &quot;any token&quot;
              markets possible.
            </li>
          </ul>

          <h2>3. Leverage &amp; margin</h2>
          <p>
            Collateral is deposited per market and positions use{" "}
            <strong>isolated margin</strong> — risk in one market never touches
            another. Notional exposure is{" "}
            <code>margin × leverage</code>. The current testnet markets allow up
            to <strong>50×</strong> leverage (configurable per market).
          </p>
          <p>
            Opening a position charges a trading fee on the notional. Because
            the vAMM has finite virtual liquidity, large positions at high
            leverage incur meaningful price impact — size sensibly.
          </p>

          <h2>4. Funding</h2>
          <p>
            A periodic <strong>funding</strong> payment ties the mark price to
            the index. When mark trades above index, longs pay shorts; when it
            trades below, shorts pay longs. This incentivises arbitrage that
            pulls the mark back toward the oracle price over time.
          </p>

          <h2>5. Liquidation &amp; insurance fund</h2>
          <p>
            Every position must keep its margin ratio above the{" "}
            <strong>maintenance</strong> threshold. If it falls below, anyone
            (typically a keeper bot) can call <code>liquidate()</code> and earn
            a liquidation fee. Each market has its own{" "}
            <strong>insurance fund</strong>, funded by trading fees, which
            absorbs bad debt when an underwater position cannot fully cover its
            losses. Risk is isolated per market.
          </p>

          <h2>6. Permissionless market factory</h2>
          <p>
            The <code>MarketFactory</code> lets anyone deploy a new market:
          </p>
          <ul>
            <li>
              <code>createPythMarket(priceId, baseReserve, quoteReserve)</code>{" "}
              — for an asset with a Pyth feed.
            </li>
            <li>
              <code>
                createTwapMarket(pool, baseToken, twapWindow, baseReserve,
                quoteReserve)
              </code>{" "}
              — for any token with a Uniswap V3 pool.
            </li>
          </ul>
          <p>
            The creator chooses the oracle and initial reserves, but the factory
            locks collateral, risk parameters and ownership to the protocol
            governor — so a market creator cannot rug traders by changing the
            rules after launch.
          </p>

          <h2>7. Using the testnet app</h2>
          <ol>
            <li>
              Open <Link href="/trade">/trade</Link> and connect a wallet on{" "}
              <strong>Base Sepolia</strong> (the app prompts you to switch
              networks if needed).
            </li>
            <li>
              Click <strong>Faucet</strong> to mint test USDC (tUSDC), then{" "}
              <strong>Approve</strong> and <strong>Deposit</strong> collateral
              into a market.
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
            Need testnet ETH for gas? Use a Base Sepolia faucet such as the{" "}
            <a
              href="https://portal.cdp.coinbase.com/products/faucet"
              target="_blank"
              rel="noreferrer"
            >
              Coinbase faucet
            </a>
            .
          </p>

          <h2>8. Contracts (Base Sepolia)</h2>
          <p>All state is on-chain and verifiable on BaseScan:</p>
          <div className="my-3 rounded-xl border border-line bg-panel p-4 text-[13px]">
            <Addr label="Market factory" address={ADDRESSES.factory} />
            <Addr label="Test USDC (tUSDC)" address={ADDRESSES.usdc} />
            {Object.values(MARKETS).map((m) => (
              <Addr key={m.address} label={`${m.label} market`} address={m.address} />
            ))}
          </div>

          <h2>9. FAQ</h2>
          <h3>Is this real money?</h3>
          <p>
            No. Decant currently runs on Base Sepolia testnet. tUSDC and all
            positions have no monetary value.
          </p>
          <h3>Do I need anyone&apos;s permission to launch a market?</h3>
          <p>
            No — that is the point. Any token with a Pyth feed or a Uniswap V3
            pool can have a market deployed via the factory.
          </p>
          <h3>How is the price kept honest?</h3>
          <p>
            Marks are derived on-chain from the vAMM, anchored to an oracle
            (Pyth or a Uniswap V3 TWAP), with funding payments pulling the mark
            toward the index over time.
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
