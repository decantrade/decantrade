/**
 * Transactional email for Decant via Resend's REST API.
 *
 * Uses fetch (no SDK) so it runs on Cloudflare Workers. It is a no-op when
 * RESEND_API_KEY is unset and never throws, so the waitlist signup flow never
 * depends on email delivery succeeding.
 *
 * Config:
 *  - RESEND_API_KEY  (secret)  enables sending; absent → disabled.
 *  - RESEND_FROM     (var)     sender, e.g. "Decant <noreply@decantrade.com>".
 *                              The domain must be verified in Resend.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Decant <noreply@decantrade.com>";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

interface ConfirmationParams {
  to: string;
  position: number;
  codes: string[];
}

function buildConfirmation({ position, codes }: ConfirmationParams): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "You're on the Decant waitlist";
  const codeLines = codes.length
    ? codes.join("\n")
    : "(none — you'll get yours soon)";

  const text = [
    "You're in.",
    "",
    `Your waitlist position: #${position}`,
    "",
    "Invite codes to share (each works a few times):",
    codeLines,
    "",
    "Decant — permissionless perpetual futures on Base.",
    "https://decantrade.com",
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  const codeChips = codes
    .map(
      (c) =>
        `<code style="display:inline-block;margin:4px 6px 0 0;padding:6px 10px;border-radius:4px;background:#1a1a1a;color:#f4b740;font-family:monospace;font-size:14px;letter-spacing:1px">${escapeHtml(
          c,
        )}</code>`,
    )
    .join("");

  const html = `<div style="background:#0a0a0a;color:#e8e8e8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:32px">
  <div style="max-width:520px;margin:0 auto">
    <div style="font-size:13px;letter-spacing:3px;color:#f4b740;text-transform:uppercase">Decant</div>
    <h1 style="font-size:22px;margin:16px 0 4px">You're in.</h1>
    <p style="color:#9a9a9a;margin:0 0 24px">Permissionless perpetual futures on Base.</p>
    <p style="margin:0 0 6px">Your waitlist position</p>
    <div style="font-size:32px;font-weight:700;color:#f4b740;margin:0 0 24px">#${position}</div>
    <p style="margin:0 0 8px">Invite codes to share:</p>
    <div style="margin:0 0 24px">${codeChips || '<span style="color:#9a9a9a">You\'ll get yours soon.</span>'}</div>
    <a href="https://decantrade.com" style="display:inline-block;padding:10px 18px;background:#f4b740;color:#0a0a0a;text-decoration:none;border-radius:4px;font-weight:600">decantrade.com</a>
    <p style="color:#6a6a6a;font-size:12px;margin:28px 0 0">If you didn't sign up, you can safely ignore this email.</p>
  </div>
</div>`;

  return { subject, text, html };
}

/**
 * Sends the waitlist confirmation email. Resolves to true when an email was
 * sent, false when skipped (no key) or on failure. Never throws.
 */
export async function sendWaitlistConfirmation(
  params: ConfirmationParams,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false; // email disabled — skip silently

  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const { subject, text, html } = buildConfirmation(params);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [params.to], subject, text, html }),
    });
    if (!res.ok) {
      console.warn(`Resend send failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("Resend send error", e);
    return false;
  }
}
