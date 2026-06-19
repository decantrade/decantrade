import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Roadmap · Decant",
  description:
    "Where Decant is today and where it's going: a live devnet on Solana, product polish, pre-mainnet hardening and audit, and the path to Solana mainnet.",
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
            Decant · perpetual futures on Solana
          </p>
          <p className="mt-5 text-ink-soft">
            Index-priced perpetual futures on Solana — trade SOL-PERP long or
            short, USDC-margined and fully on-chain. Decant is{" "}
            <strong>live on devnet</strong> today; the path below leads to a
            hardened, audited mainnet.
          </p>

          <Phase
            status="done"
            title="Phase 0 — Live on devnet"
            blurb="The full product works end-to-end on Solana devnet."
            items={[
              {
                head: "Landing + waitlist",
                body: "Invite gating, Turnstile captcha, Neon Postgres, admin dashboard with CSV export.",
              },
              {
                head: "/trade terminal",
                body: "SOL-PERP market, deposit & withdraw USDC collateral, open/close long & short, up to 20× leverage.",
              },
              {
                head: "Anchor program (Solana devnet)",
                body: "Index-priced perp engine — deposit, open/close, liquidate, withdraw — with isolated margin and a per-market insurance fund.",
              },
              {
                head: "Pyth oracle + keeper",
                body: "A keeper pushes the latest Pyth SOL/USD price on-chain and liquidates under-margin positions.",
              },
              {
                head: "Wallets",
                body: "Phantom and Solflare via the Solana wallet adapter.",
              },
            ]}
          />

          <Phase
            status="next"
            title="Phase 1 — Polish & traction"
            blurb="Make the devnet feel like a real product and bring in early traders. Low-risk, no mainnet funds at stake."
            items={[
              {
                head: "Trading UX",
                body: "Liquidation price on each position, live index updates, position history, clearer tx notifications.",
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
                body: "Anchor unit + invariant tests across margin, liquidation, the solvency invariant and the insurance fund.",
              },
              {
                head: "Economic simulation",
                body: "Stress-test bad-debt scenarios and oracle / keeper failure modes; tune leverage and risk-cap parameters.",
              },
              {
                head: "Bug bounty + audit",
                body: "Public bug bounty followed by a reputable security audit — mandatory before mainnet.",
              },
            ]}
          />

          <Phase
            status="later"
            title="Phase 3 — Solana mainnet"
            blurb="Ship to production, gradually and safely."
            items={[
              {
                head: "Staged launch",
                body: "Start with small deposit / open-interest caps and raise them over time.",
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
              <strong>Oracle / keeper risk</strong> — the index is pushed
              on-chain by a keeper; mitigated by leverage caps, deposit / OI
              caps and moving toward reading Pyth on-chain.
            </li>
            <li>
              <strong>Bad debt</strong> on price gaps — absorbed by the
              per-market insurance fund, with payouts capped by available
              capital.
            </li>
            <li>
              <strong>Regulation</strong> — devnet-only with disclaimers for
              now; legal review before mainnet.
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
