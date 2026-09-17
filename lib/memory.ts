// Cermin Perilaku (F6) — SQLite per user via node:sqlite (bawaan Node 22, nol dependency).
// ARUS tidak mencatat order; yang disimpan hanya keputusan + konteks yang USER tulis sendiri.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// buka LAZY: import saat `next build` spawn beberapa worker → "database is locked" kalau eager
let _db: DatabaseSync | null = null;
function db(): DatabaseSync {
  if (_db) return _db;
  mkdirSync(process.env.ARUS_CACHE || ".cache", { recursive: true });
  _db = new DatabaseSync(path.join(process.env.ARUS_CACHE || ".cache", "arus.db"));
  _db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS decisions(
    ts INTEGER NOT NULL, usr TEXT NOT NULL, ticker TEXT NOT NULL,
    action TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', price REAL NOT NULL DEFAULT 0, chg_pct REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS watchlist(usr TEXT NOT NULL, ticker TEXT NOT NULL, PRIMARY KEY(usr,ticker));
  CREATE TABLE IF NOT EXISTS kv(usr TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY(usr,k));`);
  return _db;
}

export interface Decision { ts: number; ticker: string; action: string; note: string; price: number; chg_pct: number }

export function logDecision(usr: string, d: Omit<Decision, "ts">) {
  db().prepare(`INSERT INTO decisions(ts,usr,ticker,action,note,price,chg_pct) VALUES(?,?,?,?,?,?,?)`)
    .run(Date.now(), usr, d.ticker.toUpperCase(), d.action, d.note, d.price, d.chg_pct);
}
export function decisions(usr: string, ticker?: string, limit = 20): Decision[] {
  const rows = ticker
    ? db().prepare(`SELECT * FROM decisions WHERE usr=? AND ticker=? ORDER BY ts DESC LIMIT ?`).all(usr, ticker.toUpperCase(), limit)
    : db().prepare(`SELECT * FROM decisions WHERE usr=? ORDER BY ts DESC LIMIT ?`).all(usr, limit);
  return rows as unknown as Decision[];
}
export function setPortfolio(usr: string, p: { ticker: string; pct: number }[]) {
  db().prepare(`INSERT INTO kv(usr,k,v) VALUES(?, 'portfolio', ?) ON CONFLICT(usr,k) DO UPDATE SET v=excluded.v`)
    .run(usr, JSON.stringify(p.map((x) => ({ ticker: x.ticker.toUpperCase(), pct: x.pct }))));
}
export function getPortfolio(usr: string): { ticker: string; pct: number }[] {
  const r = db().prepare(`SELECT v FROM kv WHERE usr=? AND k='portfolio'`).get(usr) as { v: string } | undefined;
  return r ? JSON.parse(r.v) : [];
}

/** pola lama user pada ticker yang sama: keputusan "nambah/beli" saat harga sedang naik → chase */
export function chasePattern(usr: string, ticker: string, curChangePct: number): (Decision & { ago_days: number }) | null {
  if (curChangePct < 10) return null;
  for (const d of decisions(usr, ticker, 10)) {
    if (/(beli|nambah|masuk|average|avg|dca)/i.test(d.action + " " + d.note) && d.chg_pct > 10)
      return { ...d, ago_days: Math.round((Date.now() - d.ts) / 864e5) };
  }
  return null;
}
