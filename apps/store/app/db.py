"""SQLite cache store — skema STORE.md §8 + ledger kredit untuk stats."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS sectors_calls (
  cache_key     TEXT PRIMARY KEY,
  method        TEXT NOT NULL,
  endpoint      TEXT NOT NULL,
  params        JSON NOT NULL,
  response      JSON NOT NULL,
  http_status   INT  NOT NULL,
  credits_spent INT  NOT NULL DEFAULT 0,
  hit_count     INT  NOT NULL DEFAULT 0,
  fetched_at    REAL NOT NULL,
  expires_at    REAL NOT NULL,
  origin        TEXT
);
CREATE TABLE IF NOT EXISTS credit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key   TEXT NOT NULL,
  credits     INT  NOT NULL,
  source      TEXT NOT NULL,
  at          REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calls_endpoint ON sectors_calls(endpoint);
CREATE INDEX IF NOT EXISTS idx_credit_at ON credit_events(at);
"""


class StoreDB:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.execute("PRAGMA journal_mode=WAL")
            try:
                self._conn.execute("ALTER TABLE sectors_calls ADD COLUMN origin TEXT")
            except sqlite3.OperationalError:
                pass  # kolom sudah ada
            self._conn.commit()

    def get(self, cache_key: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM sectors_calls WHERE cache_key=?", (cache_key,)).fetchone()
        if row is None:
            return None
        return dict(row)

    def is_fresh(self, row: dict[str, Any], now: float | None = None) -> bool:
        return (row.get("expires_at") or 0) > (now or time.time())

    def touch(self, cache_key: str) -> None:
        with self._lock:
            self._conn.execute("UPDATE sectors_calls SET hit_count = hit_count + 1 WHERE cache_key=?", (cache_key,))
            self._conn.commit()

    def put(
        self,
        cache_key: str,
        method: str,
        endpoint: str,
        params: dict[str, Any],
        response: Any,
        http_status: int,
        credits_spent: int,
        ttl_s: int,
        now: float | None = None,
        origin: str | None = None,
    ) -> None:
        now = now or time.time()
        with self._lock:
            self._conn.execute(
                """INSERT INTO sectors_calls
                   (cache_key, method, endpoint, params, response, http_status, credits_spent, hit_count, fetched_at, expires_at, origin)
                   VALUES (?,?,?,?,?,?,?,0,?,?,?)
                   ON CONFLICT(cache_key) DO UPDATE SET
                     response=excluded.response, http_status=excluded.http_status,
                     credits_spent=excluded.credits_spent, fetched_at=excluded.fetched_at,
                     expires_at=excluded.expires_at, origin=excluded.origin""",
                (
                    cache_key, method.upper(), endpoint, json.dumps(params), json.dumps(response, default=str),
                    http_status, credits_spent, now, now + ttl_s, origin,
                ),
            )
            self._conn.execute(
                "INSERT INTO credit_events (cache_key, credits, source, at) VALUES (?,?,?,?)",
                (cache_key, -credits_spent if credits_spent else 0, "spend", now),
            )
            self._conn.commit()

    def record_saving(self, cache_key: str, credits: int) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO credit_events (cache_key, credits, source, at) VALUES (?,?,?,?)",
                (cache_key, credits, "saved", time.time()),
            )
            self._conn.commit()

    def delete(self, cache_key: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM sectors_calls WHERE cache_key=?", (cache_key,))
            self._conn.commit()
        return cur.rowcount > 0

    def delete_older_than(self, seconds: float) -> int:
        cutoff = time.time() - seconds
        with self._lock:
            cur = self._conn.execute("DELETE FROM sectors_calls WHERE fetched_at < ?", (cutoff,))
            self._conn.commit()
        return cur.rowcount

    def stats(self) -> dict[str, Any]:
        with self._lock:
            total = self._conn.execute("SELECT COUNT(*) c FROM sectors_calls").fetchone()["c"]
            fresh = self._conn.execute("SELECT COUNT(*) c FROM sectors_calls WHERE expires_at > ?", (time.time(),)).fetchone()["c"]
            hits = self._conn.execute("SELECT COALESCE(SUM(hit_count),0) c FROM sectors_calls").fetchone()["c"]
            spent = self._conn.execute("SELECT COALESCE(SUM(-credits),0) c FROM credit_events WHERE credits < 0").fetchone()["c"]
            saved = self._conn.execute(
                "SELECT COALESCE(SUM(ce.credits),0) c FROM credit_events ce"
                " WHERE ce.credits > 0 AND ce.cache_key IN"
                " (SELECT cache_key FROM sectors_calls WHERE credits_spent > 0)"
            ).fetchone()["c"]
            top_miss = self._conn.execute(
                "SELECT endpoint, params, expires_at, hit_count FROM sectors_calls ORDER BY hit_count DESC LIMIT 10"
            ).fetchall()
        denominator = hits + total
        return {
            "cached_keys": total,
            "fresh_keys": fresh,
            "store_hits": hits,
            "store_misses": total,
            "hit_rate": round(hits / denominator, 4) if denominator else 0.0,
            "credits_spent": spent,
            "credits_saved": saved,
            "top_keys": [dict(r) for r in top_miss],
        }

    def all_keys(self, limit: int = 500) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT cache_key, method, endpoint, params, http_status, credits_spent, hit_count, fetched_at, expires_at"
                " FROM sectors_calls ORDER BY fetched_at DESC LIMIT ?", (limit,),
            ).fetchall()
        return [dict(r) for r in rows]