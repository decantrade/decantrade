import Database from "better-sqlite3";
import { config } from "./config.js";

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    market      TEXT NOT NULL,
    market_addr TEXT NOT NULL,
    kind        TEXT NOT NULL,         -- Deposited | Withdrawn | PositionOpened | PositionClosed | Liquidated | FundingSettled
    trader      TEXT,
    block       INTEGER NOT NULL,
    tx_hash     TEXT NOT NULL,
    log_index   INTEGER NOT NULL,
    ts          INTEGER,               -- block timestamp (seconds)
    data        TEXT NOT NULL,         -- JSON payload of decoded args (bigints as strings)
    UNIQUE(tx_hash, log_index)
  );

  CREATE INDEX IF NOT EXISTS idx_events_market ON events(market);
  CREATE INDEX IF NOT EXISTS idx_events_trader ON events(trader);
  CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);

  -- Set of traders with a currently-open position per market (keeper watch list).
  CREATE TABLE IF NOT EXISTS open_positions (
    market  TEXT NOT NULL,
    trader  TEXT NOT NULL,
    is_long INTEGER NOT NULL,
    size    TEXT NOT NULL,
    notional TEXT NOT NULL,
    block   INTEGER NOT NULL,
    PRIMARY KEY (market, trader)
  );
`);

const _insertEvent = db.prepare(`
  INSERT OR IGNORE INTO events (market, market_addr, kind, trader, block, tx_hash, log_index, ts, data)
  VALUES (@market, @market_addr, @kind, @trader, @block, @tx_hash, @log_index, @ts, @data)
`);

export type EventRow = {
  market: string;
  market_addr: string;
  kind: string;
  trader: string | null;
  block: number;
  tx_hash: string;
  log_index: number;
  ts: number | null;
  data: string;
};

export function insertEvent(row: EventRow): boolean {
  const info = _insertEvent.run(row);
  return info.changes > 0;
}

const _openPos = db.prepare(`
  INSERT OR REPLACE INTO open_positions (market, trader, is_long, size, notional, block)
  VALUES (@market, @trader, @is_long, @size, @notional, @block)
`);
const _closePos = db.prepare(`DELETE FROM open_positions WHERE market = ? AND trader = ?`);

export function markOpen(row: {
  market: string;
  trader: string;
  is_long: number;
  size: string;
  notional: string;
  block: number;
}) {
  _openPos.run(row);
}

export function markClosed(market: string, trader: string) {
  _closePos.run(market, trader);
}

export function getOpenTraders(market: string): string[] {
  const rows = db.prepare(`SELECT trader FROM open_positions WHERE market = ?`).all(market) as {
    trader: string;
  }[];
  return rows.map((r) => r.trader);
}

export function getCursor(market: string): bigint | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(`cursor:${market}`) as
    | { value: string }
    | undefined;
  return row ? BigInt(row.value) : null;
}

export function setCursor(market: string, block: bigint) {
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(
    `cursor:${market}`,
    block.toString(),
  );
}
