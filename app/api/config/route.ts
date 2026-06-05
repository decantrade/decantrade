import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public, client-safe runtime config (no secrets). */
export async function GET() {
  return NextResponse.json({
    turnstileSitekey: process.env.TURNSTILE_SITEKEY ?? null,
  });
}
