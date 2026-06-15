import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NETWORKS } from "@/lib/decant";

export const metadata: Metadata = {
  title: "Docs · Decant",
  description:
    "How Decant works: vAMM pricing, oracles, index-based PnL, leverage & margin, fees, funding, liquidation, the insurance fund, the market factory, and the Base mainnet contract addresses.",
  alternates: { canonical: "/docs" },
};

const SCAN = "https://basescan.org/address";
const MAINNET = NETWORKS.mainnet;
const MARKETS = MAINNET.markets;
const USDC = MAINNET.addresses.usdc;

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
            Decant is an on-chain perpetual-futures protocol on Base. Trade
            ETH, BTC and SOL perps long or short — fully on-chain, with no
            order book and USDC collateral. The market factory is permissionless
            by design; self-serve launches open after audit. This page explains
            how the protocol works and how to use the app at{" "}
            <Link href="/trade">/trade</Link>.
          </p>
          <p>
            <strong>Status:</strong> live on <strong>Base mainnet</strong>{" "}
            as a guarded beta — real USDC, gated to $DECANT holders / allowlist,
            with deposit and leverage caps. The contracts are{" "}
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
              <strong>Mark price</strong> — the vAMM&apos;s internal price. It
              moves only when someone trades, and it drives <em>funding</em>{" "}
              (see below).
            </li>
            <li>
              <strong>Index price</strong> — the external oracle price of the
              underlying asset. This is what your <em>PnL and liquidation</em>{" "}
              are measured against (see &ldquo;PnL&rdquo; below).
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

          <h2>3. PnL — tracks the oracle, not the mark</h2>
          <p>
            Your profit and loss is measured against the{" "}
            <strong>oracle (index) price</strong>, not the vAMM mark:
          </p>
          <p>
            <code>
              PnL = size × (oraclePrice<sub>now</sub> −
              oraclePrice<sub>entry</sub>)
            </code>
          </p>
          <p>
            So if the real price of ETH/BTC/SOL moves in your favour, your PnL
            moves with it — even if nobody else is trading that market and the
            mark price hasn&apos;t budged. (In an earlier design PnL came from
            the mark, which only moves on trades, so a position could be &ldquo;up&rdquo;
            on paper yet show $0; that is fixed.) Because the protocol pays
            winners from the collateral of losers plus the insurance fund, it
            effectively acts as the counterparty — which is why access and caps
            are kept tight during the beta.
          </p>

          <h2>4. Leverage, margin &amp; caps</h2>
          <p>
            Collateral is deposited per market and positions use{" "}
            <strong>isolated margin</strong> — risk in one market never touches
            another. Notional exposure is <code>margin × leverage</code>.
          </p>
          <ul>
            <li>
              <strong>Max leverage:</strong> 10× (guarded beta; configurable
              per market).
            </li>
            <li>
              <strong>Maintenance margin:</strong> 1% of notional — fall below
              this and you can be liquidated.
            </li>
            <li>
              <strong>Deposit cap:</strong> $200 USDC per wallet, per market.
            </li>
            <li>
              <strong>Open-interest cap:</strong> $2,000 notional per market.
            </li>
          </ul>

          <h2>5. Fees</h2>
          <ul>
            <li>
              <strong>Trading fee:</strong> 0.10% of notional, charged on both
              open and close. Fees accrue to the market&apos;s insurance fund.
            </li>
            <li>
              <strong>Liquidation fee:</strong> 0.5% of notional, paid to
              whoever liquidates the position.
            </li>
            <li>
              <strong>Price impact:</strong> not a fee, but the vAMM has finite
              virtual liquidity, so large orders move the mark against you. Size
              sensibly.
            </li>
          </ul>
          <p>
            Example: a $40 notional position pays{" "}
            <code>$40 × 0.10% = $0.04</code> to open and the same to close.
          </p>

          <h2>6. Funding</h2>
          <p>
            Every <strong>1 hour</strong> a <strong>funding</strong> payment
            ties the mark price back to the index. When the mark trades above
            index, longs pay shorts; when it trades below, shorts pay longs.
            This incentivises arbitrage that pulls the mark toward the oracle
            over time. Funding is settled on-chain whenever a position is opened,
            closed, or liquidated (and can be poked by the keeper).
          </p>

          <h2>7. Liquidation &amp; insurance fund</h2>
          <p>
            Every position must keep its margin ratio above the{" "}
            <strong>1% maintenance</strong> threshold. If it falls below, anyone
            (typically the keeper bot) can call <code>liquidate()</code> and earn
            the 0.5% liquidation fee. Liquidation uses the{" "}
            <strong>oracle price</strong>, consistent with how PnL is measured.
          </p>
          <p>
            Each market has its own <strong>insurance fund</strong>, seeded and
            topped up by trading fees, which absorbs bad debt when an underwater
            position cannot fully cover its losses. It is{" "}
            <strong>one-way</strong> by design — there is no function to withdraw
            it — so it cannot be drained by the operator. Risk is isolated per
            market. New markets can start with a thin fund; the deposit and
            open-interest caps above keep worst-case bad debt small.
          </p>

          <h2>8. Market factory</h2>
          <p>
            The <code>MarketFactory</code> is designed to let anyone deploy a
            new market. During the guarded beta, market creation is operator-
            gated and self-serve permissionless launches open after audit. The
            factory exposes:
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
            rules after launch. ETH, BTC and SOL are live today.
          </p>

          <h2>9. Using the app</h2>
          <ol>
            <li>
              Open <Link href="/trade">/trade</Link> and connect a wallet on{" "}
              <strong>Base mainnet</strong> (the app prompts you to switch
              networks if needed).
            </li>
            <li>
              <strong>Approve</strong> and <strong>Deposit</strong> USDC
              collateral into a market (real USDC; deposits are capped per
              wallet during the beta).
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
            You&apos;ll need a little ETH on Base for gas and real USDC on Base
            for collateral.
          </p>

          <h2>10. Contracts (Base mainnet)</h2>
          <p>All state is on-chain and verifiable on BaseScan:</p>
          <div className="my-3 rounded-xl border border-line bg-panel p-4 text-[13px]">
            <Addr label="USDC" address={USDC} />
            {Object.values(MARKETS).map((m) => (
              <Addr key={m!.address} label={`${m!.label} market`} address={m!.address} />
            ))}
          </div>

          <h2>11. FAQ</h2>
          <h3>Is this real money?</h3>
          <p>
            Yes. Decant runs on Base mainnet with real USDC. It is a guarded
            beta — gated, capped and unaudited — so only trade what you can
            afford to lose.
          </p>
          <h3>Can I launch my own market?</h3>
          <p>
            Not yet. ETH, BTC and SOL are live now; during the guarded beta the
            factory is operator-gated. Any token with a Pyth feed or a Uniswap
            V3 pool can have a market deployed, and self-serve permissionless
            launches open after audit.
          </p>
          <h3>How is the price kept honest?</h3>
          <p>
            Marks are derived on-chain from the vAMM, anchored to an oracle
            (Pyth or a Uniswap V3 TWAP), with funding payments pulling the mark
            toward the index over time. Your PnL and liquidation are measured
            against the oracle, so they follow the real asset price.
          </p>
          <h3>My position is profitable but PnL looks flat — why?</h3>
          <p>
            It shouldn&apos;t any more. PnL now tracks the oracle price, so when
            ETH/BTC/SOL moves your unrealized PnL moves with it even if no one
            else trades that market. If you still see a stale number, refresh —
            values poll on a short interval.
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
