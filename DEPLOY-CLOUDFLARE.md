# Deploying Decant to Cloudflare Workers

The app runs on Cloudflare Workers via the [OpenNext](https://opennext.js.org/cloudflare)
adapter. On Workers there are no raw TCP sockets, so the database uses the
**Neon serverless (HTTP) driver**; locally it uses the regular `postgres` TCP
driver. `lib/db.ts` picks the driver at runtime (`DB_DRIVER=neon` → Neon HTTP).

## Scripts

| Command           | What it does                                         |
| ----------------- | ---------------------------------------------------- |
| `pnpm cf:build`   | Build the Worker bundle into `.open-next/`           |
| `pnpm cf:preview` | Build + run the Worker locally on workerd (port 8787)|
| `pnpm cf:deploy`  | Build + deploy to Cloudflare                         |
| `pnpm cf:typegen` | Generate `cloudflare-env.d.ts` binding types         |

For a local preview, secrets come from `.dev.vars` (gitignored):

```
DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
```

## One-time deploy steps

1. **Create a Neon Postgres database** at https://neon.tech → copy the
   pooled connection string (`postgresql://...neon.tech/...?sslmode=require`).
2. **Seed the schema + invite codes** (run locally against Neon over TCP):
   ```bash
   DATABASE_URL='postgres://...neon.tech/...?sslmode=require' pnpm db:init
   ```
3. **Authenticate wrangler**: `pnpm exec wrangler login` (or set
   `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).
4. **Set the production secret**:
   ```bash
   pnpm exec wrangler secret put DATABASE_URL
   ```
   (`DB_DRIVER=neon` is already set as a plain var in `wrangler.jsonc`.)
5. **Deploy**: `pnpm cf:deploy`.

A custom domain (decant.trade) can be attached in the Cloudflare dashboard
under the Worker → Settings → Domains & Routes.
