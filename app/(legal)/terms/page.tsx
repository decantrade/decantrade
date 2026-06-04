import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Decant",
  description: "Terms governing access to the Decant website and waitlist.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: June 2026</p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use
        of the Decant website at decantrade.com and the Decant waitlist
        (together, the &quot;Service&quot;). By accessing the Service you agree
        to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. What Decant is today</h2>
      <p>
        Decant is an early-stage project building a permissionless perpetual
        futures protocol on the Base network. The Service available now is{" "}
        <strong>informational</strong> and provides an invite-gated waitlist.
        Any protocol functionality is pre-launch and, where available, runs on a{" "}
        <strong>test network using tokens that have no monetary value</strong>.
        Nothing on the Service constitutes an offer to trade, a financial
        product, or investment, legal, or tax advice.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old and legally able to enter into these
        Terms. You may not use the Service if you are located in, or are a
        resident or national of, any jurisdiction where use of the Service is
        prohibited, or if you are subject to applicable sanctions. You are
        responsible for complying with the laws that apply to you.
      </p>

      <h2>3. Invite codes</h2>
      <p>
        Access to the waitlist requires a valid referral code. Codes have{" "}
        <strong>no monetary value</strong>, are not transferable for
        consideration, and may be rate-limited, deactivated, or revoked at any
        time. We may change how codes are issued or consumed without notice.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          use bots, scripts, or automated means to create signups or consume
          invite codes;
        </li>
        <li>
          scrape, probe, overload, or attempt to gain unauthorized access to the
          Service or its infrastructure;
        </li>
        <li>
          submit false information or impersonate any person or wallet you do
          not control;
        </li>
        <li>use the Service for any unlawful or abusive purpose.</li>
      </ul>

      <h2>5. No warranties</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;
        without warranties of any kind, whether express or implied, including
        fitness for a particular purpose and non-infringement. We do not warrant
        that the Service will be uninterrupted, secure, or error-free.
      </p>

      <h2>6. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Decant and its contributors will
        not be liable for any indirect, incidental, special, consequential, or
        punitive damages, or any loss of profits, data, or goodwill, arising
        from your use of the Service.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these Terms or the Service at any time. Material changes
        take effect when posted on this page. Your continued use of the Service
        after changes become effective constitutes acceptance.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about these Terms? Reach us on X at{" "}
        <a href="https://x.com/decanttrade" target="_blank" rel="noreferrer">
          @decanttrade
        </a>
        .
      </p>
    </>
  );
}
