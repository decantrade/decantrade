/**
 * Cloudflare Turnstile verification.
 *
 * Disabled (no-op, always passes) when TURNSTILE_SECRET is unset, so the
 * waitlist works without captcha configured. When the secret IS set, a missing
 * or invalid token is rejected, and network errors fail closed.
 *
 * The public site key is served to the client via /api/config so the widget is
 * only rendered when captcha is configured.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success?: boolean;
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // captcha disabled — skip
  if (!token) return false;

  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as SiteverifyResponse;
    return data.success === true;
  } catch {
    return false; // fail closed when captcha is enabled
  }
}
