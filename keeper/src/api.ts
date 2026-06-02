import http from "node:http";
import { db } from "./db.js";
import { config } from "./config.js";

function rows(sql: string, params: unknown[] = []) {
  return db.prepare(sql).all(...params);
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(json);
}

/** Tiny read-only HTTP API over the indexed data. */
export function startApi() {
  const server = http.createServer((req, res) => {
    if (!req.url) return send(res, 400, { error: "no url" });
    const url = new URL(req.url, `http://localhost:${config.apiPort}`);
    const path = url.pathname;
    const market = url.searchParams.get("market");
    const trader = url.searchParams.get("trader");
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 1000);

    try {
      if (path === "/health") {
        const counts = rows(`SELECT kind, COUNT(*) n FROM events GROUP BY kind`);
        const cursors = rows(`SELECT key, value FROM meta WHERE key LIKE 'cursor:%'`);
        return send(res, 200, { ok: true, counts, cursors });
      }
      if (path === "/markets") {
        return send(res, 200, { markets: config.markets });
      }
      if (path === "/events") {
        const where: string[] = [];
        const params: unknown[] = [];
        if (market) (where.push("market = ?"), params.push(market));
        if (trader) (where.push("trader = ?"), params.push(trader.toLowerCase()));
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        params.push(limit);
        return send(
          res,
          200,
          rows(`SELECT * FROM events ${clause} ORDER BY block DESC, log_index DESC LIMIT ?`, params),
        );
      }
      if (path === "/trades") {
        return send(
          res,
          200,
          rows(
            `SELECT * FROM events WHERE kind IN ('PositionOpened','PositionClosed','Liquidated')
             ${market ? "AND market = ?" : ""} ORDER BY block DESC, log_index DESC LIMIT ?`,
            market ? [market, limit] : [limit],
          ),
        );
      }
      if (path === "/liquidations") {
        return send(
          res,
          200,
          rows(`SELECT * FROM events WHERE kind = 'Liquidated' ORDER BY block DESC LIMIT ?`, [limit]),
        );
      }
      if (path === "/funding") {
        return send(
          res,
          200,
          rows(
            `SELECT * FROM events WHERE kind = 'FundingSettled' ${market ? "AND market = ?" : ""}
             ORDER BY block DESC LIMIT ?`,
            market ? [market, limit] : [limit],
          ),
        );
      }
      if (path === "/positions") {
        return send(
          res,
          200,
          rows(
            `SELECT * FROM open_positions ${market ? "WHERE market = ?" : ""} ORDER BY block DESC`,
            market ? [market] : [],
          ),
        );
      }
      return send(res, 404, { error: "not found", routes: ["/health", "/markets", "/events", "/trades", "/liquidations", "/funding", "/positions"] });
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  server.listen(config.apiPort, () => {
    console.log(`[api] listening on http://localhost:${config.apiPort}`);
  });
  return server;
}
