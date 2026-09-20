import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "@/lib/config";

export type Db = Database.Database;

declare global {
  var __investigraphDb: Db | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS api_hits (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  session_id TEXT,
  turn_id TEXT,
  endpoint TEXT NOT NULL,
  args TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  status INTEGER,
  charged_kr REAL NOT NULL DEFAULT 0,
  estimated_kr REAL,
  latency_ms INTEGER,
  source TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_hits_key ON api_hits(cache_key);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON api_hits(ts);
CREATE INDEX IF NOT EXISTS idx_hits_endpoint ON api_hits(endpoint);
CREATE INDEX IF NOT EXISTS idx_hits_session ON api_hits(session_id);

CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  args TEXT NOT NULL,
  status INTEGER NOT NULL,
  payload BLOB,
  covers_from TEXT,
  covers_to TEXT,
  fetched_at TEXT NOT NULL,
  immutable INTEGER NOT NULL DEFAULT 0,
  ttl_days REAL,
  hit_id TEXT,
  payload_sha TEXT,
  blob_path TEXT,
  bytes_raw INTEGER,
  bytes_stored INTEGER,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cache_endpoint ON cache_entries(endpoint);

CREATE TABLE IF NOT EXISTS fact_memory (
  fact_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  value_num REAL,
  value_text TEXT,
  unit TEXT,
  as_of TEXT,
  endpoint TEXT NOT NULL,
  args TEXT NOT NULL,
  hit_id TEXT,
  meta TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_endpoint ON fact_memory(endpoint);

CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  lang_mode TEXT NOT NULL DEFAULT 'menengah',
  budget_cap_kr REAL,
  level_max INTEGER,
  credits_used_kr REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  level INTEGER,
  answedoc TEXT,
  fact_refs TEXT,
  jev_json TEXT,
  meta TEXT,
  credits_kr REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, seq);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  entity TEXT,
  key TEXT,
  value_json TEXT NOT NULL,
  provenance TEXT NOT NULL,
  confidence REAL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_items(session_id, kind);
CREATE INDEX IF NOT EXISTS idx_memory_kind ON memory_items(kind, entity);

CREATE VIEW IF NOT EXISTS credit_ledger AS
SELECT
  substr(ts, 1, 10) AS day,
  session_id,
  SUM(charged_kr) AS credits_kr,
  COUNT(*) AS calls,
  SUM(CASE WHEN status IS NULL OR status >= 400 THEN 1 ELSE 0 END) AS failures
FROM api_hits
GROUP BY day, session_id;
`;

function migrate(db: Db): void {
  const cols = db.prepare(`PRAGMA table_info(cache_entries)`).all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));
  const add: Array<[string, string]> = [
    ["payload_sha", "TEXT"],
    ["blob_path", "TEXT"],
    ["bytes_raw", "INTEGER"],
    ["bytes_stored", "INTEGER"],
    ["hit_count", "INTEGER NOT NULL DEFAULT 0"],
    ["last_used_at", "TEXT"],
  ];
  for (const [name, type] of add) {
    if (!have.has(name)) db.exec(`ALTER TABLE cache_entries ADD COLUMN ${name} ${type}`);
  }

  // Older databases created cache_entries with `payload BLOB NOT NULL`, which breaks
  // blob-spill (large payloads stored out-of-line leave the inline column NULL).
  // Rebuild the table to make payload nullable, preserving every cached row.
  const payloadCol = (db.prepare(`PRAGMA table_info(cache_entries)`).all() as Array<{ name: string; notnull: number }>).find((c) => c.name === "payload");
  if (payloadCol && payloadCol.notnull === 1) {
    const colList = (db.prepare(`PRAGMA table_info(cache_entries)`).all() as Array<{ name: string }>).map((c) => c.name).join(", ");
    db.exec(`PRAGMA foreign_keys=off`);
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE cache_entries_new (
          cache_key TEXT PRIMARY KEY,
          endpoint TEXT NOT NULL,
          args TEXT NOT NULL,
          status INTEGER NOT NULL,
          payload BLOB,
          covers_from TEXT,
          covers_to TEXT,
          fetched_at TEXT NOT NULL,
          immutable INTEGER NOT NULL DEFAULT 0,
          ttl_days REAL,
          hit_id TEXT,
          payload_sha TEXT,
          blob_path TEXT,
          bytes_raw INTEGER,
          bytes_stored INTEGER,
          hit_count INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT
        );
      `);
      db.exec(`INSERT INTO cache_entries_new (${colList}) SELECT ${colList} FROM cache_entries;`);
      db.exec(`DROP TABLE cache_entries;`);
      db.exec(`ALTER TABLE cache_entries_new RENAME TO cache_entries;`);
    });
    rebuild();
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cache_endpoint ON cache_entries(endpoint);`);
    db.exec(`PRAGMA foreign_keys=on`);
  }
}

function open(): Db {
  fs.mkdirSync(config.paths.dataDir, { recursive: true });
  fs.mkdirSync(config.paths.blobsDir, { recursive: true });
  const db = new Database(config.paths.dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function getDb(): Db {
  if (!globalThis.__investigraphDb) {
    globalThis.__investigraphDb = open();
  }
  return globalThis.__investigraphDb;
}