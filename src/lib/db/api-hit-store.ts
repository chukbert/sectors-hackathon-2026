import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
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

const INLINE_LIMIT = 32 * 1024;

export function putCache(entry: CacheEntry): void {
  const raw = Buffer.from(JSON.stringify(entry.payload), "utf8");
  const blob = gzipSync(raw);
  const payloadSha = createHash("sha256").update(raw).digest("hex");
  let inline: Buffer | null = blob;
  let blobPath: string | null = null;
  if (blob.byteLength > INLINE_LIMIT) {
    const dir = path.join(config.paths.blobsDir, payloadSha.slice(0, 2));
    fs.mkdirSync(dir, { recursive: true });
    blobPath = path.join(dir, `${payloadSha}.json.gz`);
    if (!fs.existsSync(blobPath)) fs.writeFileSync(blobPath, blob);
    inline = null;
  }
  getDb()
    .prepare(
      `INSERT INTO cache_entries (cache_key, endpoint, args, status, payload, covers_from, covers_to, fetched_at, immutable, ttl_days, hit_id, payload_sha, blob_path, bytes_raw, bytes_stored)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         status=excluded.status, payload=excluded.payload, covers_from=excluded.covers_from,
         covers_to=excluded.covers_to, fetched_at=excluded.fetched_at, immutable=excluded.immutable,
         ttl_days=excluded.ttl_days, hit_id=excluded.hit_id, payload_sha=excluded.payload_sha,
         blob_path=excluded.blob_path, bytes_raw=excluded.bytes_raw, bytes_stored=excluded.bytes_stored`,
    )
    .run(
      entry.cacheKey,
      entry.endpoint,
      JSON.stringify(entry.args),
      entry.status,
      inline,
      entry.coversFrom,
      entry.coversTo,
      entry.fetchedAt,
      entry.immutable ? 1 : 0,
      entry.ttlDays,
      entry.hitId,
      payloadSha,
      blobPath,
      raw.byteLength,
      blob.byteLength,
    );
}

export function touchCache(cacheKey: string): void {
  getDb()
    .prepare(`UPDATE cache_entries SET hit_count = hit_count + 1, last_used_at = ? WHERE cache_key = ?`)
    .run(new Date().toISOString(), cacheKey);
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
        payload: Buffer | null;
        blob_path: string | null;
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
    const buffer = row.payload ?? (row.blob_path ? fs.readFileSync(row.blob_path) : null);
    if (!buffer) return null;
    payload = JSON.parse(gunzipSync(buffer).toString("utf8"));
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