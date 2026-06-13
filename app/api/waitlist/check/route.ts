import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isValidEvmAddress } from "@/lib/referral";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Waitlist membership check used to gate testnet trading.
 *
 * GET /api/waitlist/check?address=0x...
 *   -> { ok: true, member: boolean }
 *
 * "member" is true when the address signed up to the waitlist via wallet
 * (decant_waitlist.wallet_address). Email-only signups have no wallet on
 * record and therefore read as non-members here.
 */
export async function GET(request: Request) {
  if (!(await rateLimit(`wlcheck:${clientIp(request)}`, 60, 60_000))) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  if (!address || !isValidEvmAddress(address)) {
    return NextResponse.json({ ok: false, reason: "invalid_address" }, { status: 400 });
  }

  try {
    const rows = await sql`
      SELECT 1 FROM decant_waitlist
      WHERE lower(wallet_address) = ${address.toLowerCase()}
      LIMIT 1
    `;
    return NextResponse.json({ ok: true, member: rows.length > 0 });
  } catch {
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }
}
