/**
 * Database access for Decant.
 *
 * Two drivers, picked at runtime so the same code runs locally and on the edge:
 *  - Local / Node servers: the `postgres` TCP driver (works with any Postgres,
 *    e.g. local Docker or a Neon connection string over TCP).
 *  - Cloudflare Workers: the Neon serverless driver over HTTP, because Workers
 *    cannot open raw TCP sockets to Postgres. Enabled with DB_DRIVER=neon.
 *
 * The client is created lazily on the first query (not at import time) so the
 * production build never needs a live DATABASE_URL. Both drivers expose a
 * tagged-template returning an array of rows, which is all the API routes use.
 */

type Row = Record<string, unknown>;
type TaggedSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

function resolveConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return connectionString;
}

const globalForSql = globalThis as unknown as {
  __decantSqlClient?: Promise<TaggedSql>;
};

async function createClient(): Promise<TaggedSql> {
  const connectionString = resolveConnectionString();
  const useNeonHttp =
    process.env.DB_DRIVER === "neon" || /neon\.tech/.test(connectionString);

  if (useNeonHttp) {
    const { neon } = await import("@neondatabase/serverless");
    return neon(connectionString) as unknown as TaggedSql;
  }

  const needsSsl =
    /sslmode=require/.test(connectionString) ||
    /neon\.tech/.test(connectionString) ||
    /supabase\.(co|com)/.test(connectionString);

  const { default: postgres } = await import("postgres");
  return postgres(connectionString, {
    ssl: needsSsl ? "require" : false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  }) as unknown as TaggedSql;
}

function getClient(): Promise<TaggedSql> {
  if (!globalForSql.__decantSqlClient) {
    globalForSql.__decantSqlClient = createClient();
  }
  return globalForSql.__decantSqlClient;
}

/** Tagged-template query helper, e.g. `await sql<Row>\`SELECT 1\``. */
export async function sql<T = Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const client = await getClient();
  return client(strings, ...values) as Promise<T[]>;
}

export type WaitlistMethod = "wallet" | "email";
