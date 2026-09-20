import { getDb } from "@/lib/db";
import { shortId } from "@/lib/util/ids";
import { todayJakarta } from "@/lib/util/time";
import type { LangMode } from "@/lib/util/format";

export type Session = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  langMode: LangMode;
  levelMax: number | null;
  creditsUsedKr: number;
  status: string;
};

export type Turn = {
  id: string;
  sessionId: string;
  seq: number;
  role: "user" | "assistant";
  content: string | null;
  level: number | null;
  answedoc: unknown | null;
  factRefs: string[];
  jev: unknown | null;
  meta: unknown | null;
  creditsKr: number;
  createdAt: string;
};

type SessionRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  lang_mode: string;
  level_max: number | null;
  credits_used_kr: number;
  status: string;
};

type TurnRow = {
  id: string;
  session_id: string;
  seq: number;
  role: string;
  content: string | null;
  level: number | null;
  answedoc: string | null;
  fact_refs: string | null;
  jev_json: string | null;
  meta: string | null;
  credits_kr: number;
  created_at: string;
};

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    langMode: (row.lang_mode as LangMode) ?? "menengah",
    levelMax: row.level_max,
    creditsUsedKr: row.credits_used_kr,
    status: row.status,
  };
}

function toTurn(row: TurnRow): Turn {
  return {
    id: row.id,
    sessionId: row.session_id,
    seq: row.seq,
    role: row.role as "user" | "assistant",
    content: row.content,
    level: row.level,
    answedoc: row.answedoc ? JSON.parse(row.answedoc) : null,
    factRefs: row.fact_refs ? (JSON.parse(row.fact_refs) as string[]) : [],
    jev: row.jev_json ? JSON.parse(row.jev_json) : null,
    meta: row.meta ? JSON.parse(row.meta) : null,
    creditsKr: row.credits_kr,
    createdAt: row.created_at,
  };
}

export function createSession(title: string, langMode: LangMode = "menengah"): Session {
  const now = new Date().toISOString();
  const id = shortId("ses");
  getDb()
    .prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at, lang_mode, status) VALUES (?, ?, ?, ?, ?, 'active')`,
    )
    .run(id, title, now, now, langMode);
  return { id, title, createdAt: now, updatedAt: now, langMode, levelMax: null, creditsUsedKr: 0, status: "active" };
}

export function getSession(id: string): Session | null {
  const row = getDb().prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function listSessions(limit = 50): Session[] {
  const rows = getDb()
    .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as SessionRow[];
  return rows.map(toSession);
}

export function setSessionLangMode(id: string, mode: LangMode): void {
  getDb()
    .prepare(`UPDATE sessions SET lang_mode = ?, updated_at = ? WHERE id = ?`)
    .run(mode, new Date().toISOString(), id);
}

export function setSessionTitle(id: string, title: string): void {
  getDb().prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`).run(title, new Date().toISOString(), id);
}

export function listTurns(sessionId: string): Turn[] {
  const rows = getDb()
    .prepare(`SELECT * FROM turns WHERE session_id = ? ORDER BY seq ASC`)
    .all(sessionId) as TurnRow[];
  return rows.map(toTurn);
}

export function latestAnswedoc(sessionId: string): unknown | null {
  const row = getDb()
    .prepare(`SELECT answedoc FROM turns WHERE session_id = ? AND role = 'assistant' ORDER BY seq DESC LIMIT 1`)
    .get(sessionId) as { answedoc: string | null } | undefined;
  return row?.answedoc ? JSON.parse(row.answedoc) : null;
}

export function nextSeq(sessionId: string): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM turns WHERE session_id = ?`)
    .get(sessionId) as { n: number };
  return row.n;
}

export function appendTurn(turn: Omit<Turn, "createdAt">): Turn {
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO turns (id, session_id, seq, role, content, level, answedoc, fact_refs, jev_json, meta, credits_kr, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      turn.id,
      turn.sessionId,
      turn.seq,
      turn.role,
      turn.content,
      turn.level,
      turn.answedoc ? JSON.stringify(turn.answedoc) : null,
      turn.factRefs.length ? JSON.stringify(turn.factRefs) : null,
      turn.jev ? JSON.stringify(turn.jev) : null,
      turn.meta ? JSON.stringify(turn.meta) : null,
      turn.creditsKr,
      createdAt,
    );
  getDb()
    .prepare(`UPDATE sessions SET updated_at = ?, credits_used_kr = credits_used_kr + ? WHERE id = ?`)
    .run(createdAt, turn.creditsKr, turn.sessionId);
  return { ...turn, createdAt };
}

export function updateSessionLevelMax(sessionId: string, level: number): void {
  getDb()
    .prepare(
      `UPDATE sessions SET level_max = MAX(COALESCE(level_max, 0), ?), updated_at = ? WHERE id = ?`,
    )
    .run(level, new Date().toISOString(), sessionId);
}

export type MemoryItem = {
  id: string;
  scope: "session" | "global";
  kind: "fact" | "thesis" | "profile" | "preference" | "alert" | "conclusion";
  entity: string | null;
  key: string | null;
  value: unknown;
  provenance: string;
  confidence: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MemoryRow = {
  id: string;
  scope: string;
  kind: string;
  entity: string | null;
  key: string | null;
  value_json: string;
  provenance: string;
  confidence: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export function putMemory(item: Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & { id?: string }): MemoryItem {
  const now = new Date().toISOString();
  const id = item.id ?? shortId("mem");
  const existing = getDb()
    .prepare(`SELECT id FROM memory_items WHERE kind = ? AND entity IS ? AND key IS ?`)
    .get(item.kind, item.entity, item.key) as { id: string } | undefined;
  const finalId = existing?.id ?? id;
  getDb()
    .prepare(
      `INSERT INTO memory_items (id, session_id, scope, kind, entity, key, value_json, provenance, confidence, expires_at, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json, provenance=excluded.provenance,
         confidence=excluded.confidence, expires_at=excluded.expires_at, updated_at=excluded.updated_at`,
    )
    .run(
      finalId,
      item.scope,
      item.kind,
      item.entity,
      item.key,
      JSON.stringify(item.value),
      item.provenance,
      item.confidence,
      item.expiresAt,
      now,
      now,
    );
  return { ...item, id: finalId, createdAt: now, updatedAt: now };
}

export function listMemory(scope?: "session" | "global"): MemoryItem[] {
  const rows = (
    scope
      ? getDb().prepare(`SELECT * FROM memory_items WHERE scope = ? ORDER BY updated_at DESC LIMIT 200`).all(scope)
      : getDb().prepare(`SELECT * FROM memory_items ORDER BY updated_at DESC LIMIT 200`).all()
  ) as MemoryRow[];
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope as "session" | "global",
    kind: r.kind as MemoryItem["kind"],
    entity: r.entity,
    key: r.key,
    value: JSON.parse(r.value_json),
    provenance: r.provenance,
    confidence: r.confidence,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function deleteMemory(id: string): void {
  getDb().prepare(`DELETE FROM memory_items WHERE id = ?`).run(id);
}

export type LedgerLine = {
  seq: number;
  question: string;
  level: number | null;
  facts: string[];
  conclusion: string;
  corrections: string;
};

export function ledgerLines(sessionId: string, beforeSeq: number): LedgerLine[] {
  const rows = getDb()
    .prepare(
      `SELECT t.seq, t.role, t.content, t.level, t.fact_refs, t.answedoc, t.meta
       FROM turns t WHERE t.session_id = ? AND t.seq < ? ORDER BY t.seq ASC`,
    )
    .all(sessionId, beforeSeq) as Array<{
    seq: number;
    role: string;
    content: string | null;
    level: number | null;
    fact_refs: string | null;
    answedoc: string | null;
    meta: string | null;
  }>;
  const lines: LedgerLine[] = [];
  let pendingQuestion = "";
  let pendingLevel: number | null = null;
  for (const row of rows) {
    if (row.role === "user") {
      pendingQuestion = row.content ?? "";
      pendingLevel = row.level;
      continue;
    }
    const meta = row.meta ? (JSON.parse(row.meta) as { conclusion?: string; corrections?: string }) : null;
    lines.push({
      seq: row.seq,
      question: pendingQuestion,
      level: pendingLevel,
      facts: row.fact_refs ? (JSON.parse(row.fact_refs) as string[]) : [],
      conclusion: meta?.conclusion ?? (row.content ?? "").slice(0, 240),
      corrections: meta?.corrections ?? "",
    });
  }
  return lines;
}

export function memoryDigest(): string {
  const items = listMemory();
  if (items.length === 0) return "";
  return items
    .slice(0, 40)
    .map((m) => `- [${m.kind}] ${m.entity ?? ""}${m.key ? ` ${m.key}` : ""}: ${JSON.stringify(m.value).slice(0, 200)} (${m.provenance})`)
    .join("\n");
}

export function expiresDefault(days: number): string {
  const d = new Date(`${todayJakarta()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}