// Satu-satunya jembatan ke dunia luar: Sectors Financial API v2.
// Kill test §6 PRD: hapus file ini → produk mati. Tidak ada sumber data lain.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TOOL_SPECS, type ToolName, type ToolSpec } from "./tools.ts";

const BASE = "https://api.sectors.app/v2";
const CACHE_DIR = process.env.ARUS_CACHE || ".cache/sectors";
const SEED_DIRS = (process.env.ARUS_SEED_DIRS || "eval/fixtures").split(":");

export class SectorsUnavailable extends Error {}

// Kelas TTL per endpoint — sesuai anggaran credit §5: cache-first, percakapan dibaca dari cache.
const TTL: Record<string, number> = {
  universe: 24 * 3600e3,   // full-universe 1×/hari
  holders: 7 * 24 * 3600e3,// shareholders/ownership 1×/minggu/ticker
  daily: 24 * 3600e3,      // broker summary 1×/hari/ticker
  news: 6 * 3600e3,
  helper: 30 * 24 * 3600e3,
};

// key yang BISA DIBACA manusia — cache & fixtures SEED harus bisa di-audit juri tanpa hash-cracking
function keyOf(tool: string, params: Record<string, string | number>): string {
  const q = Object.entries(params).map(([k, v]) => `${k}-${String(v)}`).sort().join("_");
  return (tool + (q ? `__${q}` : "")).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 120);
}
function fileIn(dir: string, key: string) { return path.join(dir, `${key}.json`) }

/** fixture seed: coba nama persis, lalu cocokkan pada tool+param non-tanggal (tanggal berotasi tiap hari) */
function unwrap(rec: unknown): unknown {
  return rec && typeof rec === "object" && "body" in (rec as object) && "tool" in (rec as object) ? (rec as { body: unknown }).body : rec;
}
function seedLookup(tool: string, params: Record<string, string | number>, key: string): unknown {
  const exact = SEED_DIRS.map((d) => fileIn(d, key)).find((f) => existsSync(f));
  if (exact) return unwrap(JSON.parse(readFileSync(exact, "utf8")));
  const segs = Object.entries(params).filter(([k]) => !/^(start|end|date)$/.test(k)).map(([k, v]) => `${k}-${String(v)}`).sort();
  if (!segs.length) return null;
  for (const dir of SEED_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const stem = f.replace(/\.json$/, "");
      if (!stem.startsWith(tool)) continue;
      const ps = (stem.split("__")[1] ?? "").split("_");
      if (segs.every((s) => ps.includes(s))) {
        const rec = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
        return rec && typeof rec === "object" && "body" in rec && "tool" in rec ? (rec as { body: unknown }).body : rec;
      }
    }
  }
  return null;
}

const inflight = new Map<string, Promise<unknown>>();
let breaker = { fails: 0, openUntil: 0 };
let creditsUsed = 0; // 1 kredit per respons 2xx (approx; multi-kredit dihitung di specs)
export const credits = { get used() { return creditsUsed } };

async function fetchLive(url: string, timeoutMs = 15000): Promise<unknown> {
  const key = process.env.SECTORS_API_KEY;
  if (!key) throw new SectorsUnavailable("SECTORS_API_KEY belum diisi — ARUS hanya hidup di atas data Sectors.");
  if (Date.now() < breaker.openUntil) throw new SectorsUnavailable("Sectors data unavailable (circuit breaker terbuka — rate limit).");
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 401 || res.status === 403) {
    breaker.fails++;
    throw new SectorsUnavailable("Sectors data unavailable (API key ditolak).");
  }
  if (res.status === 429 || res.status >= 500) {
    if (++breaker.fails >= 3) breaker.openUntil = Date.now() + 60000;
    throw new SectorsUnavailable("Sectors data unavailable (rate limit / server error).");
  }
  if (!res.ok) throw new SectorsUnavailable(`Sectors error ${res.status} ${url}`);
  breaker.fails = 0;
  return res.json(); // kredit dihitung per-panggilan di sectorsGet (satu sumber kebenaran)
}

/** GET ter-cache. options.live=true memaksa ulang; halaman paginated digabung via options.paginate. */
export async function sectorsGet<T = unknown>(
  tool: ToolName,
  params: Record<string, string | number> = {},
  opts: { live?: boolean; paginate?: boolean } = {},
): Promise<T> {
  const spec: ToolSpec = TOOL_SPECS[tool];
  if (!spec) throw new Error(`tool tak dikenal: ${tool}`);
  let url = BASE + spec.path;
  for (const [k, v] of Object.entries(params)) url = url.replace(`{${k}}`, encodeURIComponent(String(v)));
  const qs = Object.entries(params)
    .filter(([k]) => !spec.path.includes(`{${k}}`))
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  const paged = opts.paginate || spec.paginated;
  if (opts.paginate && !qs.some((q) => q.startsWith("limit="))) qs.push("limit=100");
  if (qs.length) url += (url.includes("?") ? "&" : "?") + qs.join("&");

  const key = keyOf(tool, params);
  const cf = fileIn(CACHE_DIR, key);
  if (!opts.live && existsSync(cf)) {
    const rec = JSON.parse(readFileSync(cf, "utf8"));
    if (Date.now() - rec.at < TTL[spec.cache]) return rec.body as T;
  }
  const pend = inflight.get(key);
  if (pend && !opts.live) return pend as Promise<T>;

  const job = (async (): Promise<T> => {
    const ttlFile = TTL[spec.cache];
    let body: T;
    try {
      if (paged) body = (await fetchAllPages(url, opts.live)) as T;
      else body = (await fetchLive(url, spec.timeout)) as T;
      creditsUsed += spec.credits;
    } catch (e) {
      // fallback jujur: seed cache hanya bila dinyatakan (ARUS_SEED / fixtures), bukan sumber lain.
      const seed = seedLookup(tool, params, key);
      if (seed && process.env.ARUS_SEED === "1") return seed as T;
      throw e;
    }
    if (body !== null) {
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(cf, JSON.stringify({ at: Date.now(), ttl: ttlFile, tool, params, body }));
    }
    return body;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

// Gabung halaman: {results:[], pagination:{next_offset,has_next}} (close, news, filings, suspensions, free-float)
async function fetchAllPages(url0: string, live?: boolean): Promise<unknown> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (let page = 0; page < 40; page++) {
    const url = url0 + (url0.includes("?") ? "&" : "?") + `offset=${offset}`;
    const j = (await fetchLive(url)) as { results?: Record<string, unknown>[]; pagination?: { next_offset?: number; has_next?: boolean; limit?: number } };
    const chunk = j.results ?? (Array.isArray(j) ? (j as Record<string, unknown>[]) : []);
    if (!Array.isArray(j) && !j.results) return j; // bukan envelope → kembalikan apa adanya
    rows.push(...chunk);
    const pg = j.pagination;
    if (!pg?.has_next) break;
    offset = pg.next_offset ?? offset + (pg.limit ?? chunk.length);
    if (!chunk.length) break;
  }
  return { results: rows, pagination: { total_count: rows.length, has_next: false } };
}

/** tanggal trading terakhir — data EOD, jadi sebelum ~16:30 WIB hari ini belum lengkap (ponytail: libur nasional tak dipantau; endpoint memaklumi tanggal kosong, fallback mundur 1 hari). */
export function lastTradingDay(now = new Date()): string {
  const x = new Date(now);
  if (x.getHours() < 16) x.setDate(x.getDate() - 1); // sebelum tutup pasar: pakai kemarin
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1);
  return x.toISOString().slice(0, 10);
}
export function isoDaysAgo(n: number): string {
  const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10);
}
