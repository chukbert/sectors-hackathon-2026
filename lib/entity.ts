// lib/entity.ts — entity resolver v7 ("saham Indomaret apa?").
// Alur: kandidat dari LLM → verifikasi company/report §overview (1kr/kandidat, maks 2/pertanyaan) → identitas + alternatif.
// Aturan keras: kandidat yang tidak mengembalikan data Sectors TIDAK PERNAH diklaim — jujur "tidak ditemukan".
// Arah balik: ticker → §ownership untuk "ini anak usaha siapa?" (induk/afiliasi, label kemungkinan relasi).
import { fetchReport, type Getter } from "./evidence.js";

export interface EntityCandidate { name: string; candidates: string[]; relation?: string }

export const MAX_VERIFY = 2;

export interface EntityHit {
  symbol: string;
  companyName: string;
  sector?: string;
  subSector?: string;
  marketCap?: number | null;
  listingDate?: string;
  cited: string;
}
export interface EntityResolution {
  name: string;
  relation?: string;
  hits: EntityHit[];
  misses: { symbol: string; reason: string }[];
  ok: boolean;
  seed: boolean;
}
export interface OwnershipView {
  symbol: string;
  group?: string;
  holders: { name: string; pct: number }[];
  seed: boolean;
  cited: string;
}

interface OverviewShape { sector?: string; sub_sector?: string; market_cap?: number | null; listing_date?: string }

/** Verifikasi kandidat LLM ke Sectors. Gagal ambil data = miss (tidak diklaim), bukan tebakan. */
export async function resolveEntity(get: Getter, ent: EntityCandidate, budget = MAX_VERIFY): Promise<EntityResolution> {
  const hits: EntityHit[] = [];
  const misses: EntityResolution["misses"] = [];
  let seed = false;
  for (const symbol of ent.candidates.slice(0, Math.max(0, budget))) {
    const e = await fetchReport(get, symbol, ["overview"]);
    seed = seed || e.seed;
    const ov = (e.ok && e.data ? (e.data.overview as OverviewShape | null | undefined) : null) ?? null;
    const companyName = e.data && typeof e.data.company_name === "string" ? e.data.company_name : "";
    if (!ov || !companyName) {
      misses.push({ symbol, reason: e.ok ? "report §overview kosong" : "data tidak tersedia / kandidat tidak ada" });
      continue;
    }
    hits.push({
      symbol, companyName,
      sector: ov.sector, subSector: ov.sub_sector,
      marketCap: ov.market_cap ?? null, listingDate: ov.listing_date,
      cited: `company/report/${symbol}?sections=overview`,
    });
  }
  return { name: ent.name, relation: ent.relation, hits, misses, ok: hits.length > 0, seed };
}

/** Arah balik: ticker → pemegang saham utama & label grup (kemungkinan relasi). */
export async function resolveOwners(get: Getter, symbol: string): Promise<OwnershipView | null> {
  const e = await fetchReport(get, symbol, ["ownership"]);
  if (!e.ok || !e.data) return null;
  const own = e.data.ownership as { conglomerates_group?: string; major_shareholders?: { name?: unknown; share_percentage?: unknown }[] } | null | undefined;
  if (!own) return null;
  const holders = (own.major_shareholders ?? [])
    .filter((h) => h && typeof h.name === "string")
    .map((h) => ({ name: String(h.name), pct: Math.round((Number(h.share_percentage) || 0) * 100) / 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);
  return { symbol, group: own.conglomerates_group || undefined, holders, seed: e.seed, cited: `company/report/${symbol}?sections=ownership` };
}