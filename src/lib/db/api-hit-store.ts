import { gzipSync, gunzipSync } from "node:zlib";
import { getDb } from "@/lib/db";
import { shortId } from "@/lib/util/ids";
import { config } from "@/lib/config";
import type { RunMode } from "@/lib/config";

export type HitSource = "live" | "cache" | "replay" | "memory" | "derived" | "miss";

export type HitInput = {
  endpoint: string;
  args: Record<string, unknown>;
  cacheKey: string;
  status: number | null;
  chargedKr: number;
  estimatedKr?: number;
  latencyMs?: number;
  source: HitSource;
  error?: string;
  sessionId?: string;
  turnId?: string;
};

export type CacheEntry = {
  cacheKey: string;
  endpoint: string;
  args: Record<string, unknown>;
  status: number;
  payload: unknown;
  coversFrom: string | null;
  coversTo: string | null;
  fetchedAt: string;
  immutable: boolean;
  ttlDays: number | null;
  hitId: string | null;
};

export function recordHit(hit: HitInput): string {
  const id = shortId("hit");
  getDb()
    .prepare(
      `INSERT INTO api_hits (id, ts, session_id, turn_id, endpoint, args, cache_key, status, charged_kr, estimated_kr, latency_ms, source, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      new Date().toISOString(),
      hit.sessionId ?? null,
      hit.turnId ?? null,
      hit.endpoint,
      JSON.stringify(hit.args),
      hit.cacheKey,
      hit.status,
      hit.chargedKr,
      hit.estimatedKr ?? null,
      hit.latencyMs ?? null,
      hit.source,
      hit.error ?? null,
    );
  return id;
}

export function putCache(entry: CacheEntry): void {
  const blob = gzipSync(Buffer.from(JSON.stringify(entry.payload), "utf8"));
  getDb()
    .prepare(
      `INSERT INTO cache_entries (cache_key, endpoint, args, status, payload, covers_from, covers_to, fetched_at, immutable, ttl_days, hit_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         status=excluded.status, payload=excluded.payload, covers_from=excluded.covers_from,
         covers_to=excluded.covers_to, fetched_at=excluded.fetched_at, immutable=excluded.immutable,
         ttl_days=excluded.ttl_days, hit_id=excluded.hit_id`,
    )
    .run(
      entry.cacheKey,
      entry.endpoint,
      JSON.stringify(entry.args),
      entry.status,
      blob,
      entry.coversFrom,
      entry.coversTo,
      entry.fetchedAt,
      entry.immutable ? 1 : 0,
      entry.ttlDays,
      entry.hitId,
    );
}

export function getCache(cacheKey: string): CacheEntry | null {
  const row = getDb()
    .prepare(`SELECT * FROM cache_entries WHERE cache_key = ?`)
    .get(cacheKey) as
    | {
        cache_key: string;
        endpoint: string;
        args: string;
        status: number;
        payload: Buffer;
        covers_from: string | null;
        covers_to: string | null;
        fetched_at: string;
        immutable: number;
        ttl_days: number | null;
        hit_id: string | null;
      }
    | undefined;
  if (!row) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(gunzipSync(row.payload).toString("utf8"));
  } catch {
    return null;
  }
  return {
    cacheKey: row.cache_key,
    endpoint: row.endpoint,
    args: JSON.parse(row.args) as Record<string, unknown>,
    status: row.status,
    payload,
    coversFrom: row.covers_from,
    coversTo: row.covers_to,
    fetchedAt: row.fetched_at,
    immutable: row.immutable === 1,
    ttlDays: row.ttl_days,
    hitId: row.hit_id,
  };
}

export function isFresh(entry: CacheEntry, now = Date.now()): boolean {
  if (entry.immutable) return true;
  if (entry.ttlDays == null) return false;
  const ageMs = now - Date.parse(entry.fetchedAt);
  return ageMs <= entry.ttlDays * 86_400_000;
}

export function spentToday(): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(charged_kr), 0) AS total FROM api_hits WHERE substr(ts, 1, 10) = ?`)
    .get(new Date().toISOString().slice(0, 10)) as { total: number };
  return row.total;
}

export function spentInSession(sessionId: string): number {
  const row = getDb()
    .prepare(`SELECT COALESCE(SUM(charged_kr), 0) AS total FROM api_hits WHERE session_id = ?`)
    .get(sessionId) as { total: number };
  return row.total;
}

export function recentHits(sessionId: string, limit = 50): Array<Record<string, unknown>> {
  return getDb()
    .prepare(
      `SELECT id, ts, endpoint, args, status, charged_kr, latency_ms, source, error
       FROM api_hits WHERE session_id = ? ORDER BY ts DESC LIMIT ?`,
    )
    .all(sessionId, limit) as Array<Record<string, unknown>>;
}

export function getMode(): RunMode {
  const row = getDb().prepare(`SELECT v FROM kv WHERE k = 'run_mode'`).get() as { v: string } | undefined;
  return (row?.v as RunMode | undefined) ?? config.run.mode;
}

export function setMode(mode: RunMode): void {
  getDb()
    .prepare(`INSERT INTO kv (k, v) VALUES ('run_mode', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`)
    .run(mode);
}