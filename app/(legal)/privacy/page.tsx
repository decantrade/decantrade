import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Decant",
  description: "How Decant handles the data you provide to the waitlist.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: June 2026</p>

      <p>
        This Privacy Policy explains what information Decant collects through
        decantrade.com and the Decant waitlist, how we use it, and the choices
        you have. We aim to collect as little as possible.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Waitlist details you submit:</strong> either an email address
          or a wallet address, plus an optional X (Twitter) handle, and the
          referral code you used.
        </li>
        <li>
          <strong>Wallet signature:</strong> if you join with a wallet, we
          verify a message signature to confirm you control the address. We do
          not request custody of funds and the signature never authorizes a
          transaction.
        </li>
        <li>
          <strong>Technical data:</strong> limited request metadata such as IP
          address and timestamps, used for security and abuse prevention (for
          example, rate limiting).
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>to operate the waitlist and your position in it;</li>
        <li>to contact you about access, launch, and product updates;</li>
        <li>to prevent fraud, spam, and abuse of invite codes;</li>
        <li>to comply with applicable law.</li>
      </ul>

      <h2>3. Service providers</h2>
      <p>
        We use third-party infrastructure to run the Service, including{" "}
        <strong>Cloudflare</strong> (hosting and network security) and{" "}
        <strong>Neon</strong> (managed PostgreSQL database). These providers
        process data on our behalf under their own security and privacy terms.
      </p>

      <h2>4. What we do not do</h2>
      <p>
        We do not sell your personal information, and we do not share it with
        third parties for their own marketing.
      </p>

      <h2>5. Retention</h2>
      <p>
        We retain waitlist data for as long as needed to run the waitlist and
        launch the product. You may ask us to delete your entry at any time (see
        Contact).
      </p>

      <h2>6. Your choices</h2>
      <p>
        You can request access to, correction of, or deletion of the
        information associated with your signup by contacting us. Wallet
        addresses recorded on public blockchains are outside our control and are
        not deleted by such a request.
      </p>

      <h2>7. Cookies</h2>
      <p>
        We use only the minimal storage needed to keep a wallet connection
        working during your session. We do not use advertising cookies.
      </p>

      <h2>8. Contact</h2>
      <p>
        For privacy requests, reach us on X at{" "}
        <a href="https://x.com/decanttrade" target="_blank" rel="noreferrer">
          @decanttrade
        </a>
        .
      </p>
    </>
  );
}
