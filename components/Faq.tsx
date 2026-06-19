import { Reveal } from "./Reveal";

const FAQS = [
  {
    q: "What is Decant?",
    a: "An index-priced perpetual-futures protocol on Solana. Trade SOL-PERP long or short with leverage, USDC-margined and fully on-chain. PnL settles against a Pyth index price.",
  },
  {
    q: "How does index pricing work?",
    a: "There is no vAMM. Your PnL is computed directly from a Pyth index price — size × (exit − entry) / entry. The protocol is the counterparty (house), and payouts are backed by each market's isolated insurance fund.",
  },
  {
    q: "Is it live with real money?",
    a: "No. Decant is currently on Solana devnet using test USDC. Public mainnet trading opens only after an external security audit. The waitlist is how you get early access.",
  },
  {
    q: "Why is the waitlist invite-only?",
    a: "Early access is gated by referral code to keep the first cohort small and high-signal. Bring a code from an existing member, or grab one we drop on @_decantrade.",
  },
  {
    q: "What do I need to join?",
    a: "A valid referral code, plus either a Solana wallet (Phantom, Solflare) or an email. Wallet signups sign a gas-free message to prove ownership — no transaction, no approval.",
  },
  {
    q: "Which wallets are supported?",
    a: "Phantom and Solflare via the Solana wallet adapter. Connect on /trade to deposit USDC and open a position.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-b border-line bg-bg-soft">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <Reveal>
          <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-amber">
            ── FAQ
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            What you&apos;re probably wondering.
          </h2>
        </Reveal>

        <div className="mt-10 divide-y divide-line border-y border-line">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={(i % 4) * 0.04}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-sm font-medium text-ink transition-colors hover:text-amber">
                  {f.q}
                  <span className="text-ink-dim transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pb-5 text-[13px] leading-6 text-ink-soft">
                  {f.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
