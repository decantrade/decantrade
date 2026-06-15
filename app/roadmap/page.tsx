import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Roadmap · Decant",
  description:
    "Where Decant is today and where it's going: a guarded beta on Base mainnet, product polish, hardening and audit, and the path to a full public launch.",
  alternates: { canonical: "/roadmap" },
};

type Status = "done" | "now" | "next" | "later";

const BADGE: Record<Status, { label: string; cls: string }> = {
  done: { label: "Shipped", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  now: { label: "In progress", cls: "border-amber/40 bg-amber/10 text-amber" },
  next: { label: "Next", cls: "border-sky-500/40 bg-sky-500/10 text-sky-400" },
  later: { label: "Later", cls: "border-line bg-panel text-ink-dim" },
};

function Phase({
  status,
  title,
  blurb,
  items,
}: {
  status: Status;
  title: string;
  blurb: string;
  items: { head: string; body: string }[];
}) {
  const b = BADGE[status];
  return (
    <section className="my-8 rounded-2xl border border-line bg-panel/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${b.cls}`}
        >
          {b.label}
        </span>
        <h2 className="!my-0 text-lg font-semibold">{title}</h2>
      </div>
      <p className="mt-3 text-sm text-ink-soft">{blurb}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((it) => (
          <li key={it.head} className="flex flex-col gap-0.5 border-l-2 border-line pl-3">
            <span className="text-sm font-medium text-ink">{it.head}</span>
            <span className="text-[13px] leading-relaxed text-ink-soft">{it.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RoadmapPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <Header />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">Roadmap</h1>
          <p className="mt-2 text-sm uppercase tracking-[0.15em] text-ink-dim">
            Decant · perpetual futures on Base
          </p>
          <p className="mt-5 text-ink-soft">
            On-chain perpetual futures on Base. Decant is{" "}
            <strong>live on Base mainnet</strong> (guarded beta) today — ETH,
            BTC and SOL markets, gated and capped while the path below leads to
            a hardened, audited public launch with permissionless market
            launches.
          </p>

          <Phase
            status="done"
            title="Phase 0 — Live (guarded beta)"
            blurb="The full product works end-to-end on Base mainnet."
            items={[
              {
                head: "Landing + waitlist",
                body: "Invite gating, Turnstile captcha, Neon Postgres, admin dashboard with CSV export.",
              },
              {
                head: "/trade terminal",
                body: "ETH / BTC / SOL markets, candlestick charts, deposit & withdraw collateral, open/close long & short, up to 10× leverage.",
              },
              {
                head: "Market factory",
                body: "MarketFactory deployed on-chain; new markets are launched by the team during the guarded beta. Self-serve permissionless launches open after audit.",
              },
              {
                head: "Smart contracts (Base)",
                body: "vAMM PerpMarket + MarketFactory, Pyth oracle with Uniswap V3 TWAP fallback, isolated margin & per-market insurance fund.",
              },
              {
                head: "Keeper bot",
                body: "Cloudflare Cron Worker auto-settles funding and liquidates under-margin positions every minute.",
              },
              {
                head: "Indexer + history",
                body: "On-chain activity, cross-market positions and a global leaderboard.",
              },
              {
                head: "Wallets",
                body: "WalletConnect with mobile QR / deep-link support.",
              },
            ]}
          />

          <Phase
            status="now"
            title="Token — $DECANT"
            blurb="The community token for Decant, live on Base."
            items={[
              {
                head: "$DECANT live on Bankr",
                body: "The $DECANT token is live and tradable on Bankr. Contract: 0x10feE05Ef916625FD86b2fED432e325bE897BBa3 (Base) — only trust the address shown on decantrade.com.",
              },
            ]}
          />

          <Phase
            status="next"
            title="Phase 1 — Polish & traction"
            blurb="Make the beta feel like a real product and bring in early traders. Caps stay small while the protocol hardens."
            items={[
              {
                head: "Trading UX",
                body: "Liquidation price & funding rate on each position, pre-trade slippage / price-impact preview, full cross-market history, clearer tx notifications.",
              },
              {
                head: "Growth & trust",
                body: "Waitlist confirmation email, analytics + error monitoring, sitemap in Search Console, community channels and an early-tester program.",
              },
              {
                head: "Reliability",
                body: "Alerts for low keeper gas / failed cron, and a public uptime view for the keeper and indexer.",
              },
            ]}
          />

          <Phase
            status="later"
            title="Phase 2 — Hardening (pre-mainnet)"
            blurb="Make the system safe to hold real money. The heaviest, longest phase."
            items={[
              {
                head: "Exhaustive testing",
                body: "Foundry unit + invariant / fuzz tests across margin, funding, liquidation, ADL and the insurance fund.",
              },
              {
                head: "Economic simulation",
                body: "Stress-test funding, bad-debt scenarios and oracle manipulation on thin long-tail markets; tune risk parameters.",
              },
              {
                head: "Bug bounty + audit",
                body: "Public bug bounty followed by a reputable security audit — mandatory before mainnet.",
              },
            ]}
          />

          <Phase
            status="later"
            title="Phase 3 — Base mainnet"
            blurb="Ship to production, gradually and safely."
            items={[
              {
                head: "Staged launch",
                body: "Start with small position / TVL caps and raise them over time.",
              },
              {
                head: "Real economics",
                body: "Native USDC collateral, protocol treasury & fees, seeded insurance fund.",
              },
              {
                head: "Ops & compliance",
                body: "Full on-chain + off-chain monitoring, geofencing & disclaimers, lightweight governance over risk parameters.",
              },
            ]}
          />

          <h2 className="mt-12 text-lg font-semibold">Key risks</h2>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[13px] text-ink-soft">
            <li>
              <strong>Contract security</strong> — bugs mean lost funds. Audit
              and invariant testing are non-negotiable before mainnet.
            </li>
            <li>
              <strong>Oracle manipulation</strong> on thin long-tail markets —
              mitigated by minimum liquidity, long TWAP windows and leverage caps
              on new markets.
            </li>
            <li>
              <strong>Bad debt</strong> on price gaps — absorbed by the
              per-market insurance fund and auto-deleveraging.
            </li>
            <li>
              <strong>Regulation</strong> — guarded beta with disclaimers and
              caps for now; legal review before a wider launch.
            </li>
          </ul>

          <div className="mt-16 flex flex-wrap gap-4 border-t border-line pt-6 text-[11px] uppercase tracking-[0.15em] text-ink-dim">
            <Link href="/trade" className="hover:text-amber">
              Open the app
            </Link>
            <Link href="/docs" className="hover:text-amber">
              Docs
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
