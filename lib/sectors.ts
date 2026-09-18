// lib/sectors.ts — Sectors REST v2 client: cache disk + credit-guard + dedupe + cache-404 negatif + circuit breaker.
// Kill test: tanpa SECTORS_API_KEY dan tanpa SEED=1 → error jujur "Sectors data unavailable".
// Tidak ada satu pun fallback data karangan di mode live.
import fs from "node:fs";
import path from "node:path";
import { CreditSession, estimateCost } from "./credit.js";

const BASE = process.env.SECTORS_BASE_URL ?? "https://api.sectors.app/v2";
const CACHE_DIR = () => process.env.ARUS_CACHE ?? path.join(process.cwd(), ".cache");

export function isSeedMode(): boolean {
  return process.env.SEED === "1";
}

function ttlFor(endpoint: string): number {
  if (/\/brokers\/?(\?|$)/.test(endpoint)) return 30 * 24 * 3600e3;
  if (endpoint.includes("/company/report")) return 7 * 24 * 3600e3;
  if (endpoint.includes("corporate-actions")) return 6 * 3600e3;
  if (endpoint.includes("/mining/commodities") && endpoint.includes("/price")) return 7 * 24 * 3600e3;
  if (endpoint.includes("performance") || endpoint.includes("financials")) return 90 * 24 * 3600e3;
  if (endpoint.includes("contracts") || endpoint.includes("licenses") || endpoint.includes("auctions")) return 30 * 24 * 3600e3;
  if (endpoint.includes("universe") && !endpoint.includes("ownership")) return 24 * 3600e3;
  if (endpoint.includes("ownership")) return 7 * 24 * 3600e3;
  if (endpoint.includes("index-daily")) return 24 * 3600e3;
  return 6 * 3600e3;
}

function cachePath(endpoint: string) {
  const safe = endpoint.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 180);
  const dir = CACHE_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, safe + ".json");
}

const inflight = new Map<string, Promise<{ data: unknown; seed: boolean }>>();
const breaker = { fails: 0, openUntil: 0 };

function normalizeEndpoint(endpoint: string): string {
  const qi = endpoint.indexOf("?");
  const p = qi === -1 ? endpoint : endpoint.slice(0, qi);
  const query = qi === -1 ? "" : endpoint.slice(qi);
  return (p.endsWith("/") ? p : p + "/") + query;
}

export async function sectorsGet<T = unknown>(
  endpoint: string,
  session: CreditSession,
  opts: { seed?: unknown } = {}
): Promise<{ data: T; cached: boolean; seed: boolean }> {
  endpoint = normalizeEndpoint(endpoint);
  const live = !isSeedMode();
  const cp = cachePath(endpoint);

  if (fs.existsSync(cp)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cp, "utf8")) as { at: number; data?: unknown; seed?: boolean; negative?: boolean; status?: number };
      const shapeOk = opts.seed === undefined || Array.isArray(opts.seed) === Array.isArray(raw.data);
      if (raw.negative && Date.now() - raw.at < 3600e3) {
        // 404 ter-cache 1 jam: satu 404 jangan membeli kredit dua kali.
        throw new Error(`Sectors 404 (cache negatif 1 jam) untuk ${endpoint}`);
      }
      if (!raw.negative && Date.now() - raw.at < ttlFor(endpoint) && !(live && raw.seed) && shapeOk) {
        session.charge(endpoint, 0, true);
        return { data: raw.data as T, cached: true, seed: !!raw.seed };
      }
    } catch (e) {
      if (String(e).includes("cache negatif")) throw e;
      /* cache rusak → fetch ulang */
    }
  }

  if (inflight.has(endpoint)) {
    const { data, seed } = await inflight.get(endpoint) as { data: T; seed: boolean };
    session.charge(endpoint, 0, true);
    return { data, cached: true, seed };
  }

  const cost = estimateCost(endpoint);
  const job = (async (): Promise<{ data: T; seed: boolean }> => {
    if (isSeedMode()) {
      if (opts.seed !== undefined) {
        fs.writeFileSync(cp, JSON.stringify({ at: Date.now(), data: opts.seed, seed: true }));
        session.charge(endpoint, 0, false);
        return { data: opts.seed as T, seed: true };
      }
      throw new Error(`SEED=1 tapi tidak ada fixture untuk ${endpoint}`);
    }
    const key = process.env.SECTORS_API_KEY;
    if (!key) throw new Error(`Sectors data unavailable (SECTORS_API_KEY kosong) untuk ${endpoint}`);
    if (Date.now() < breaker.openUntil) throw new Error(`Sectors data unavailable (circuit breaker terbuka) untuk ${endpoint}`);
    session.canAfford(cost);
    const res = await fetch(BASE + endpoint, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(20_000),
    }).catch((e) => {
      throw new Error(`Sectors tidak terjangkau (${String((e as Error).message ?? e)}) untuk ${endpoint}`);
    });
    if (res.status === 401 || res.status === 403) {
      breaker.fails++;
      breaker.openUntil = Date.now() + 300_000;
      throw new Error(`Sectors data unavailable (API key ditolak) untuk ${endpoint}`);
    }
    if (res.status === 429 || res.status >= 500) {
      if (++breaker.fails >= 3) breaker.openUntil = Date.now() + 60_000;
      throw new Error(`Sectors data unavailable (rate limit / server error ${res.status}) untuk ${endpoint}`);
    }
    if (res.status === 404) {
      fs.writeFileSync(cp, JSON.stringify({ at: Date.now(), negative: true, status: 404 }));
      throw new Error(`Sectors 404 untuk ${endpoint}`);
    }
    if (!res.ok) throw new Error(`Sectors error ${res.status} untuk ${endpoint}`);
    breaker.fails = 0;
    const data = (await res.json()) as T;
    session.charge(endpoint, cost, false);
    fs.writeFileSync(cp, JSON.stringify({ at: Date.now(), data, seed: false }));
    return { data, seed: false };
  })();
  inflight.set(endpoint, job);
  try {
    const out = await job;
    return { data: out.data, cached: false, seed: out.seed };
  } finally {
    inflight.delete(endpoint);
  }
}

export function cacheDirStatus() {
  const dir = CACHE_DIR();
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;
  return { dir, files };
}