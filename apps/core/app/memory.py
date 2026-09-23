"""Memori sesi (docs/ARCHITECTURE.md §14) + penyimpanan run + akuntansi LLM."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .config import SETTINGS

SCHEMA = """
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  entity_state JSON NOT NULL DEFAULT '{}',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  intent_ids JSON NOT NULL DEFAULT '[]',
  evidence_ids JSON NOT NULL DEFAULT '[]',
  run_id TEXT,
  model TEXT,
  effort TEXT,
  cost REAL,
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  query TEXT NOT NULL,
  plan JSON NOT NULL,
  result JSON,
  status TEXT NOT NULL,
  error TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS memo_snapshots (
  ticker TEXT NOT NULL,
  period TEXT NOT NULL,
  summary_json JSON NOT NULL,
  model TEXT,
  created_at REAL NOT NULL,
  PRIMARY KEY (ticker, period)
);
CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  role TEXT NOT NULL,
  model TEXT NOT NULL,
  effort TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost REAL,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON chat_turns(session_id, seq);
"""


class Memory:
    def __init__(self, path: str = SETTINGS.db_path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    # ------------------------------------------------------------- sessions
    def create_session(self, title: str = "Sesi baru") -> str:
        sid = uuid.uuid4().hex[:12]
        now = time.time()
        with self._lock:
            self._conn.execute("INSERT INTO chat_sessions (id, title, summary, entity_state, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                               (sid, title[:120], None, "{}", now, now))
            self._conn.commit()
        return sid

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM chat_sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            return None
        data = dict(row)
        data["entity_state"] = json.loads(data.get("entity_state") or "{}")
        return data

    def list_sessions(self, limit: int = 30) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute("SELECT id, title, updated_at FROM chat_sessions ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
            out = []
            for row in rows:
                count = self._conn.execute("SELECT COUNT(*) c FROM chat_turns WHERE session_id=?", (row["id"],)).fetchone()["c"]
                out.append({**dict(row), "turns": count})
            return out

    def update_entity_state(self, session_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        session = self.get_session(session_id)
        state = (session or {}).get("entity_state") or {}
        for key in ("symbols", "regional", "groups", "language", "playbooks", "flags", "open_questions"):
            if key in patch and patch[key]:
                if key in ("symbols", "regional", "groups", "flags", "open_questions"):
                    merged = list(dict.fromkeys([*(state.get(key) or []), *patch[key]]))
                    state[key] = merged[:60]
                else:
                    state[key] = patch[key]
        now = time.time()
        with self._lock:
            self._conn.execute("UPDATE chat_sessions SET entity_state=?, updated_at=? WHERE id=?",
                               (json.dumps(state, default=str), now, session_id))
            self._conn.commit()
        return state

    def set_title(self, session_id: str, title: str) -> None:
        with self._lock:
            self._conn.execute("UPDATE chat_sessions SET title=?, updated_at=? WHERE id=?",
                               (title[:120], time.time(), session_id))
            self._conn.commit()

    # ------------------------------------------------------------- turns
    def append_turn(self, session_id: str, role: str, text: str, *, intent_ids: list[str] | None = None,
                    evidence_ids: list[str] | None = None, run_id: str | None = None,
                    model: str | None = None, effort: str | None = None, cost: float | None = None) -> int:
        with self._lock:
            seq = self._conn.execute("SELECT COALESCE(MAX(seq),0)+1 s FROM chat_turns WHERE session_id=?", (session_id,)).fetchone()["s"]
            cur = self._conn.execute(
                "INSERT INTO chat_turns (session_id, seq, role, text, intent_ids, evidence_ids, run_id, model, effort, cost, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (session_id, seq, role, text, json.dumps(intent_ids or []), json.dumps(evidence_ids or []),
                 run_id, model, effort, cost, time.time()))
            self._conn.execute("UPDATE chat_sessions SET updated_at=? WHERE id=?", (time.time(), session_id))
            self._conn.commit()
        return cur.lastrowid or 0

    def get_turns(self, session_id: str, limit: int | None = None) -> list[dict[str, Any]]:
        sql = "SELECT * FROM chat_turns WHERE session_id=? ORDER BY seq"
        params: tuple = (session_id,)
        if limit:
            sql = "SELECT * FROM (SELECT * FROM chat_turns WHERE session_id=? ORDER BY seq DESC LIMIT ?) ORDER BY seq"
            params = (session_id, limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        out = []
        for row in rows:
            item = dict(row)
            item["intent_ids"] = json.loads(item.get("intent_ids") or "[]")
            item["evidence_ids"] = json.loads(item.get("evidence_ids") or "[]")
            out.append(item)
        return out

    def build_context_messages(self, session_id: str, new_message: str) -> list[dict[str, Any]]:
        """Rakitan konteks §14.2: summary + N turn verbatim + state entitas + pesan baru."""
        session = self.get_session(session_id) or {}
        state = session.get("entity_state") or {}
        messages: list[dict[str, Any]] = []
        summary = session.get("summary")
        if summary:
            messages.append({"role": "system", "content": f"Ringkasan sesi sebelumnya: {summary}"})
        if state:
            messages.append({"role": "system", "content": f"State entitas sesi: {json.dumps(state, ensure_ascii=False)}"})
        for turn in self.get_turns(session_id, limit=SETTINGS.history_turns_verbatim * 2):
            messages.append({"role": "user" if turn["role"] == "user" else "assistant", "content": turn["text"][:4000]})
        messages.append({"role": "user", "content": new_message})
        return messages

    def compact(self, session_id: str, summary: str) -> None:
        with self._lock:
            self._conn.execute("UPDATE chat_sessions SET summary=?, updated_at=? WHERE id=?",
                               (summary[:4000], time.time(), session_id))
            self._conn.commit()

    # ------------------------------------------------------------- runs
    def save_run(self, run_id: str, session_id: str, query: str, plan: dict[str, Any], status: str = "planned") -> None:
        now = time.time()
        with self._lock:
            self._conn.execute("INSERT OR REPLACE INTO runs (run_id, session_id, query, plan, result, status, created_at, updated_at)"
                               " VALUES (?,?,?,?,COALESCE((SELECT result FROM runs WHERE run_id=?),NULL),?,?,?)",
                               (run_id, session_id, query, json.dumps(plan, default=str), run_id, status, now, now))
            self._conn.commit()

    def set_run_status(self, run_id: str, status: str, result: dict[str, Any] | None = None, error: str | None = None) -> None:
        with self._lock:
            if result is not None:
                self._conn.execute("UPDATE runs SET status=?, result=?, error=?, updated_at=? WHERE run_id=?",
                                   (status, json.dumps(result, default=str), error, time.time(), run_id))
            else:
                self._conn.execute("UPDATE runs SET status=?, error=?, updated_at=? WHERE run_id=?",
                                   (status, error, time.time(), run_id))
            self._conn.commit()

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
        if not row:
            return None
        data = dict(row)
        data["plan"] = json.loads(data["plan"])
        data["result"] = json.loads(data["result"]) if data.get("result") else None
        return data

    # ------------------------------------------------------------- llm accounting & snapshots
    def log_llm_call(self, *, run_id: str | None, role: str, model: str, effort: str | None,
                     prompt_tokens: int | None, completion_tokens: int | None, cost: float | None) -> None:
        with self._lock:
            self._conn.execute("INSERT INTO llm_calls (run_id, role, model, effort, prompt_tokens, completion_tokens, cost, created_at)"
                               " VALUES (?,?,?,?,?,?,?,?)",
                               (run_id, role, model, effort, prompt_tokens, completion_tokens, cost, time.time()))
            self._conn.commit()

    def llm_usage(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            rows = self._conn.execute("SELECT role, COUNT(*) calls, COALESCE(SUM(cost),0) cost,"
                                      " COALESCE(SUM(prompt_tokens),0)+COALESCE(SUM(completion_tokens),0) tokens"
                                      " FROM llm_calls WHERE run_id=? GROUP BY role", (run_id,)).fetchall()
        return {"by_role": [dict(r) for r in rows], "cost_usd": round(sum(r["cost"] for r in rows), 4),
                "calls": sum(r["calls"] for r in rows)}

    def upsert_snapshot(self, ticker: str, period: str, summary: dict[str, Any], model: str | None = None) -> None:
        with self._lock:
            self._conn.execute("INSERT OR REPLACE INTO memo_snapshots (ticker, period, summary_json, model, created_at)"
                               " VALUES (?,?,?,?,?)",
                               (ticker.upper(), period, json.dumps(summary, default=str), model, time.time()))
            self._conn.commit()

    def get_snapshot(self, ticker: str, period: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM memo_snapshots WHERE ticker=? AND period=?", (ticker.upper(), period)).fetchone()
        if not row:
            return None
        return {**dict(row), "summary_json": json.loads(row["summary_json"])}


MEMORY = Memory()


def log_llm_call(**kwargs) -> None:
    MEMORY.log_llm_call(**kwargs)