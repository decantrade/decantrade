import { sql } from "@/lib/db";

/** Best-effort client IP from Cloudflare / proxy headers. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Fixed-window rate limiter backed by Postgres/Neon.
 * Returns true if the request is ALLOWED, false if the limit is exceeded.
 * Fails open on database errors so legitimate users are never hard-blocked.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const expires = new Date(Date.now() + windowMs).toISOString();
  try {
    const rows = await sql<{ count: number }>`
      INSERT INTO decant_rate_limit (bucket, count, expires_at)
      VALUES (${key}, 1, ${expires})
      ON CONFLICT (bucket) DO UPDATE SET
        count = CASE
          WHEN decant_rate_limit.expires_at < now() THEN 1
          ELSE decant_rate_limit.count + 1
        END,
        expires_at = CASE
          WHEN decant_rate_limit.expires_at < now() THEN ${expires}
          ELSE decant_rate_limit.expires_at
        END
      RETURNING count
    `;
    const count = rows[0]?.count ?? 1;
    return count <= limit;
  } catch {
    return true;
  }
}
