import { config } from "@/lib/config";
import { canonicalKey } from "@/lib/util/ids";
import { todayJakarta } from "@/lib/util/time";
import {
  getCache,
  getMode,
  isFresh,
  putCache,
  recordHit,
  type CacheEntry,
} from "@/lib/db/api-hit-store";
import { getDb } from "@/lib/db";
import { upsertFacts } from "@/lib/db/fact-memory";
import { ENDPOINT_BY_ID, buildUrl, defaultArgs, estimateCost, type EndpointDef } from "@/lib/sectors/registry";
import type { Fact } from "@/lib/facts";

export type ResolveOptions = {
  sessionId?: string;
  turnId?: string;
  allowLive?: boolean;
  forceLive?: boolean;
  extraArgs?: Record<string, unknown>;
};

export type ResolveResult = {
  endpoint: string;
  args: Record<string, unknown>;
  payload: unknown;
  status: number;
  source: "cache" | "live" | "replay" | "derived" | "miss";
  chargedKr: number;
  hitId: string;
  facts: Fact[];
  fetchedAt: string;
  staleWarning?: string;
};

export class SectorsError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly endpointId: string,
  ) {
    super(message);
  }
}

function ttlFor(def: EndpointDef, args: Record<string, unknown>): { immutable: boolean; ttlDays: number | null } {
  const end = args.end ? String(args.end) : null;
  const date = args.date ? String(args.date) : null;
  const today = todayJakarta();
  const closedWindow = (end && end < today) || (date && date < today);
  const series = ["daily", "foreign-flow", "index-daily", "idx-total", "broker-summary", "broker-activity", "foreign-flow-universe", "company-universe", "index-universe", "most-traded", "corporate-actions", "corporate-actions-symbol", "suspensions", "filings", "news"];
  if (series.includes(def.id) && closedWindow) return { immutable: true, ttlDays: null };
  if (series.includes(def.id)) return { immutable: false, ttlDays: 0.5 };
  if (def.id === "screener" || def.id === "top-changes" || def.id === "brokers-top" || def.id === "broker-summary-top" || def.id === "broker-activity-top") {
    return { immutable: false, ttlDays: 0.5 };
  }
  if (def.id === "quarterly" || def.id === "report" || def.id === "mining-company-performance" || def.id === "subsector-report") {
    return { immutable: false, ttlDays: 7 };
  }
  if (def.id.startsWith("mining") || def.id === "shareholders" || def.id === "segments" || def.id === "free-float") {
    return { immutable: false, ttlDays: 30 };
  }
  return { immutable: false, ttlDays: 30 };
}

function billedCredits(def: EndpointDef, args: Record<string, unknown>, status: number | null): number {
  if (status === null) return 0;
  if (status >= 200 && status < 300) return estimateCost(def, args);
  if (status === 404) return 1;
  return 0;
}

async function fetchLive(def: EndpointDef, args: Record<string, unknown>): Promise<{ status: number | null; payload: unknown; error?: string; latencyMs: number }> {
  const url = `${config.sectors.baseUrl}${buildUrl(def, args)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sectors.timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: config.sectors.apiKey, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text.slice(0, 4000) };
    }
    return { status: res.status, payload, error: res.ok ? undefined : text.slice(0, 300), latencyMs };
  } catch (err) {
    return { status: null, payload: null, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export function cacheKeyFor(def: EndpointDef, args: Record<string, unknown>): string {
  return canonicalKey({ endpoint: def.id, args, version: 1 });
}

const SLICEABLE = new Set(["daily", "foreign-flow", "index-daily", "idx-total", "broker-summary", "broker-activity", "most-traded"]);

function sliceWindow(payload: unknown, def: EndpointDef, start: string, end: string): unknown | null {
  const inRange = (row: unknown): boolean => {
    const date = String((row as Record<string, unknown>)?.date ?? "");
    return date >= start && date <= end;
  };
  if (def.id === "daily" || def.id === "index-daily" || def.id === "idx-total") {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as Record<string, unknown>)?.data)
        ? ((payload as Record<string, unknown>).data as unknown[])
        : null;
    if (!rows) return null;
    const filtered = rows.filter(inRange);
    return filtered.length ? filtered : null;
  }
  if (def.id === "most-traded") {
    const keyed = payload as Record<string, unknown>;
    if (!keyed || typeof keyed !== "object" || Array.isArray(keyed)) return null;
    const out: Record<string, unknown> = {};
    for (const [date, rows] of Object.entries(keyed)) {
      if (date >= start && date <= end) out[date] = rows;
    }
    return Object.keys(out).length ? out : null;
  }
  const data = (payload as Record<string, unknown>)?.data;
  if (!Array.isArray(data)) return null;
  const filtered = data.filter(inRange);
  return filtered.length ? { ...(payload as Record<string, unknown>), data: filtered } : null;
}

function findSliceCandidate(def: EndpointDef, args: Record<string, unknown>): { entry: CacheEntry; nearMiss: boolean } | null {
  if (!SLICEABLE.has(def.id)) return null;
  const start = args.start ? String(args.start) : null;
  const end = args.end ? String(args.end) : null;
  if (!start || !end) return null;
  const rows = getDb()
    .prepare(`SELECT cache_key FROM cache_entries WHERE endpoint = ? AND status >= 200 AND status < 300`)
    .all(def.id) as Array<{ cache_key: string }>;
  let loose: { entry: CacheEntry; nearMiss: boolean } | null = null;
  for (const row of rows) {
    const entry = getCache(row.cache_key);
    if (!entry) continue;
    if (def.path.includes("{symbol}") && entry.args.symbol !== args.symbol) continue;
    if (def.path.includes("{index_code}") && entry.args.index_code !== args.index_code) continue;
    if (entry.coversFrom && entry.coversTo && entry.coversFrom <= start && entry.coversTo >= end) {
      const payload = sliceWindow(entry.payload, def, start, end);
      if (payload !== null) return { entry: { ...entry, payload }, nearMiss: false };
    }
    if (!loose && entry.coversFrom && entry.coversTo) {
      const lo = entry.coversFrom > start ? entry.coversFrom : start;
      const hi = entry.coversTo < end ? entry.coversTo : end;
      if (lo <= hi) {
        const payload = sliceWindow(entry.payload, def, lo, hi);
        if (payload !== null) loose = { entry: { ...entry, payload, coversFrom: lo, coversTo: hi }, nearMiss: true };
      }
    }
  }
  return loose;
}

function resolveFromSlice(def: EndpointDef, args: Record<string, unknown>, key: string, candidate: { entry: CacheEntry; nearMiss: boolean }, opts: ResolveOptions): ResolveResult {
  const sliced = candidate.entry;
  const hitId = recordHit({
    endpoint: def.id,
    args,
    cacheKey: key,
    status: 200,
    chargedKr: 0,
    source: "derived",
    sessionId: opts.sessionId,
    turnId: opts.turnId,
  });
  const facts = def.extract(sliced.payload, { args, hitId, asOf: todayJakarta() });
  upsertFacts(facts);
  return {
    endpoint: def.id,
    args,
    payload: sliced.payload,
    status: 200,
    source: "derived",
    chargedKr: 0,
    hitId,
    facts,
    fetchedAt: sliced.fetchedAt,
    staleWarning: `${candidate.nearMiss ? "near-miss: " : "irisan dari "}cache ${sliced.coversFrom}–${sliced.coversTo}`,
  };
}

function findDerivedCandidate(def: EndpointDef, args: Record<string, unknown>): { payload: unknown; warning: string; fetchedAt: string } | null {
  const rows = getDb()
    .prepare(`SELECT cache_key FROM cache_entries WHERE endpoint = ? AND status >= 200 AND status < 300`)
    .all(def.id) as Array<{ cache_key: string }>;
  const entries = rows.map((r) => getCache(r.cache_key)).filter((e): e is CacheEntry => e !== null);

  if (def.id === "report") {
    const symbol = String(args.symbol ?? "");
    const requested = Array.isArray(args.sections) ? (args.sections as string[]) : [];
    if (!symbol || requested.length === 0) return null;
    const sameSymbol = entries.filter((e) => String(e.args.symbol) === symbol);
    if (!sameSymbol.length) return null;
    const merged: Record<string, unknown> = { symbol };
    const available: string[] = [];
    let fetchedAt = sameSymbol[0].fetchedAt;
    for (const section of requested) {
      const hit = sameSymbol.find((e) => {
        const secs = Array.isArray(e.args.sections) ? (e.args.sections as string[]) : [];
        return secs.includes(section);
      });
      if (!hit) continue;
      const body = (hit.payload && typeof hit.payload === "object" ? hit.payload : {}) as Record<string, unknown>;
      if (body[section] !== undefined) {
        merged[section] = body[section];
        available.push(section);
        if (hit.fetchedAt < fetchedAt) fetchedAt = hit.fetchedAt;
      }
      if (body.company_name && !merged.company_name) merged.company_name = body.company_name;
    }
    if (!available.length) return null;
    const missing = requested.filter((s) => !available.includes(s));
    return {
      payload: merged,
      warning: missing.length ? `cache section: ${available.join(", ")}; belum ada: ${missing.join(", ")}` : `gabungan cache section: ${available.join(", ")}`,
      fetchedAt,
    };
  }

  if (def.id === "quarterly") {
    const symbol = String(args.symbol ?? "");
    const want = Number(args.n_quarters ?? 1) || 1;
    const sameSymbol = entries.filter((e) => String(e.args.symbol) === symbol && Array.isArray(e.payload));
    const best = sameSymbol.sort((a, b) => ((b.payload as unknown[]).length ?? 0) - ((a.payload as unknown[]).length ?? 0))[0];
    if (!best) return null;
    const all = best.payload as unknown[];
    const take = all.slice(Math.max(0, all.length - want));
    if (!take.length) return null;
    return {
      payload: take,
      warning: `irisan ${take.length} kuartal dari cache (diminta ${want})`,
      fetchedAt: best.fetchedAt,
    };
  }
  return null;
}

function resolveFromDerived(def: EndpointDef, args: Record<string, unknown>, key: string, derived: { payload: unknown; warning: string; fetchedAt: string }, opts: ResolveOptions): ResolveResult {
  const hitId = recordHit({
    endpoint: def.id,
    args,
    cacheKey: key,
    status: 200,
    chargedKr: 0,
    source: "derived",
    sessionId: opts.sessionId,
    turnId: opts.turnId,
  });
  const facts = def.extract(derived.payload, { args, hitId, asOf: todayJakarta() });
  upsertFacts(facts);
  return {
    endpoint: def.id,
    args,
    payload: derived.payload,
    status: 200,
    source: "derived",
    chargedKr: 0,
    hitId,
    facts,
    fetchedAt: derived.fetchedAt,
    staleWarning: derived.warning,
  };
}

export async function resolveEndpoint(endpointId: string, overrides: ResolveOptions["extraArgs"] = {}, opts: ResolveOptions = {}): Promise<ResolveResult> {
  const def = ENDPOINT_BY_ID.get(endpointId);
  if (!def) throw new SectorsError(`unknown endpoint ${endpointId}`, null, endpointId);
  const args = defaultArgs(def, overrides);
  for (const [name, spec] of Object.entries(def.params)) {
    if (spec.required && (args[name] === undefined || args[name] === null || args[name] === "")) {
      throw new SectorsError(`missing required param ${name} for ${endpointId}`, null, endpointId);
    }
  }
  const mode = getMode();
  const key = cacheKeyFor(def, args);
  const cached = getCache(key);
  const { immutable, ttlDays } = ttlFor(def, args);

  const useCache =
    cached !== null &&
    cached.status >= 200 &&
    cached.status < 300 &&
    (mode === "replay" || isFresh(cached)) &&
    !opts.forceLive;

  if (useCache) {
    const hitId = recordHit({
      endpoint: def.id,
      args,
      cacheKey: key,
      status: cached.status,
      chargedKr: 0,
      source: mode === "replay" ? "replay" : "cache",
      sessionId: opts.sessionId,
      turnId: opts.turnId,
    });
    const facts = def.extract(cached.payload, { args, hitId, asOf: todayJakarta() });
    upsertFacts(facts);
    const stale = !cached.immutable && !isFresh(cached);
    return {
      endpoint: def.id,
      args,
      payload: cached.payload,
      status: cached.status,
      source: mode === "replay" ? "replay" : "cache",
      chargedKr: 0,
      hitId,
      facts,
      fetchedAt: cached.fetchedAt,
      staleWarning: stale ? `cache dari ${cached.fetchedAt.slice(0, 10)}` : undefined,
    };
  }

  if (mode === "replay" || opts.allowLive === false) {
    const derived = findDerivedCandidate(def, args);
    if (derived) return resolveFromDerived(def, args, key, derived, opts);
    const sliced = findSliceCandidate(def, args);
    if (sliced) return resolveFromSlice(def, args, key, sliced, opts);
    const hitId = recordHit({
      endpoint: def.id,
      args,
      cacheKey: key,
      status: null,
      chargedKr: 0,
      source: "miss",
      error: mode === "replay" ? "cache miss (mode replay)" : "live tidak diizinkan governor",
      sessionId: opts.sessionId,
      turnId: opts.turnId,
    });
    throw Object.assign(new SectorsError(`data tidak tersedia (${mode === "replay" ? "cache miss" : "live diblokir"})`, null, def.id), { hitId });
  }

  const derivedCandidate = mode === "hybrid" ? findDerivedCandidate(def, args) : null;
  if (derivedCandidate) return resolveFromDerived(def, args, key, derivedCandidate, opts);
  const slicedCandidate = mode === "hybrid" ? findSliceCandidate(def, args) : null;
  if (slicedCandidate) return resolveFromSlice(def, args, key, slicedCandidate, opts);

  const { status, payload, error, latencyMs } = await fetchLive(def, args);
  const chargedKr = billedCredits(def, args, status);
  const hitId = recordHit({
    endpoint: def.id,
    args,
    cacheKey: key,
    status,
    chargedKr,
    estimatedKr: estimateCost(def, args),
    latencyMs,
    source: "live",
    error,
    sessionId: opts.sessionId,
    turnId: opts.turnId,
  });

  if (status !== null && status >= 200 && status < 300) {
    const entry: CacheEntry = {
      cacheKey: key,
      endpoint: def.id,
      args,
      status,
      payload,
      coversFrom: args.start ? String(args.start) : null,
      coversTo: args.end ? String(args.end) : args.date ? String(args.date) : null,
      fetchedAt: new Date().toISOString(),
      immutable,
      ttlDays,
      hitId,
    };
    putCache(entry);
    const facts = def.extract(payload, { args, hitId, asOf: todayJakarta() });
    upsertFacts(facts);
    return { endpoint: def.id, args, payload, status, source: "live", chargedKr, hitId, facts, fetchedAt: entry.fetchedAt };
  }

  if (status === 404) {
    putCache({
      cacheKey: key,
      endpoint: def.id,
      args,
      status,
      payload,
      coversFrom: null,
      coversTo: null,
      fetchedAt: new Date().toISOString(),
      immutable: false,
      ttlDays: 7,
      hitId,
    });
  }

  const friendly =
    status === 401 || status === 403
      ? "autentikasi Sectors gagal — periksa SECTORS_API_KEY di .env (401/403 tidak memakai kredit)"
      : status === 429
        ? "rate limit Sectors (429, tanpa kredit) — coba lagi sebentar"
        : error ?? `Sectors HTTP ${status}`;
  throw new SectorsError(friendly, status, def.id);
}