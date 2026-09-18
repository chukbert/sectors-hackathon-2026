// lib/screener.ts — peta pertanyaan "saham apa yang …" → query screener Sectors (deterministik, tanpa LLM).
// Angka tetap milik Sectors (include_query_values); ARUS tidak menghitung ulang.
export interface Screen { where: string; orderBy: string; metric: string; label: string }

export const SCREEN_LABELS: Record<string, string> = {
  pe_ttm: "PE (TTM)", pb_mrq: "PB (MRQ)", yield_ttm: "yield TTM", roe_ttm: "ROE (TTM)",
  der_mrq: "DER (MRQ)", market_cap: "market cap", yoy_quarter_earnings_growth: "pertumbuhan laba kuartal (YoY)",
};

export function parseScreen(q: string): Screen | null {
  const s = q.toLowerCase();
  const has = (re: RegExp) => re.test(s);
  if (has(/paling murah|termurah|\bmurah\b|pe rendah|pe kecil|\bpe\b/)) return { where: "pe_ttm > 0", orderBy: "pe_ttm", metric: "pe_ttm", label: "PE terendah" };
  if (has(/paling mahal|termahal|pe tinggi/)) return { where: "pe_ttm > 0", orderBy: "-pe_ttm", metric: "pe_ttm", label: "PE tertinggi" };
  if (has(/pb rendah|pb kecil|\bpb\b/)) return { where: "pb_mrq > 0", orderBy: "pb_mrq", metric: "pb_mrq", label: "PB terendah" };
  if (has(/yield tinggi|yield tertinggi|dividen tertinggi|dividen terbesar|paling royal|saham yield/)) return { where: "yield_ttm > 0", orderBy: "-yield_ttm", metric: "yield_ttm", label: "yield TTM tertinggi" };
  if (has(/\broe\b/)) return { where: "roe_ttm > 0", orderBy: "-roe_ttm", metric: "roe_ttm", label: "ROE tertinggi" };
  if (has(/\bder\b|utang terkecil|utang rendah/)) return { where: "der_mrq >= 0", orderBy: "der_mrq", metric: "der_mrq", label: "DER terendah" };
  if (has(/kapitalisasi terbesar|market ?cap terbesar|terbesar di idx|paling besar/)) return { where: "", orderBy: "-market_cap", metric: "market_cap", label: "market cap terbesar" };
  if (has(/pertumbuhan laba|laba tumbuh|growth/)) return { where: "yoy_quarter_earnings_growth > 0", orderBy: "-yoy_quarter_earnings_growth", metric: "yoy_quarter_earnings_growth", label: "pertumbuhan laba kuartal (YoY) tercepat" };
  if (has(/blue.?chip/)) return { where: "market_cap > 50000000000000", orderBy: "-market_cap", metric: "market_cap", label: "kandidat blue-chip menurut ukuran (market cap > Rp 50 T)" };
  if (has(/screener|screening|saring|filter saham|daftar saham|saham apa/)) return { where: "", orderBy: "-market_cap", metric: "market_cap", label: "market cap terbesar" };
  return null;
}

// Kata sektor/industri → kandidat slug. Slug asli divalidasi ke helper Sectors (subsectors/industries),
// jadi tidak ada asumsi daftar; kata tak dikenal = filter tidak dipasang (jujur, bukan menebak).
const SECTOR_WORDS: Record<string, string[]> = {
  bank: ["banks"], perbankan: ["banks"],
  batubara: ["coal"], tambang: ["coal", "gold", "nickel", "metal-mineral"], mining: ["coal", "gold", "nickel", "metal-mineral"],
  nikel: ["nickel"], emas: ["gold"], "logam": ["metal-mineral"],
  semen: ["cement"], telekomunikasi: ["telecommunication"], telekom: ["telecommunication"],
  rokok: ["tobacco"], otomotif: ["automotive"], ritel: ["retail"], perdagangan: ["retail"],
  kesehatan: ["healthcare"], farmasi: ["pharmaceuticals"], rumahsakit: ["healthcare"],
  properti: ["properties-real-estate", "property"], konstruksi: ["construction"],
  teknologi: ["technology"], energi: ["coal", "oil-gas"], "minyak": ["oil-gas", "coal"],
  pangan: ["food-beverages"], makanan: ["food-beverages"], perkebunan: ["plantation", "plantations"],
  transportasi: ["transportation"], logistik: ["logistics", "transportation"],
  infrastruktur: ["infrastructure", "telecommunication"], asuransi: ["insurance"],
};
const SECTOR_ALIAS: Record<string, string> = { rumahsakit: "kesehatan", mining: "tambang", minyak: "energi" };

export function detectSectorWord(q: string): string | null {
  const s = q.toLowerCase();
  for (const w of Object.keys(SECTOR_WORDS)) if (new RegExp(`\\b${w}\\b`).test(s)) return w;
  return null;
}

export interface SectorFilter { field: "sub_sector" | "sector" | "industry" | "sub_industry"; slug: string; word: string }

/** Cocokkan kata sektor ke daftar slug Sectors. Prioritas: sub_sector → sector → industry → sub_industry. */
export function matchSector(word: string, subsectors: { sector?: string; subsector?: string; industry?: string; sub_industry?: string }[], industries: { industry?: string; sub_industry?: string }[], subindustries: { sub_industry?: string }[]): SectorFilter | null {
  const cands = SECTOR_WORDS[SECTOR_ALIAS[word] ?? word];
  if (!cands) return null;
  for (const it of subsectors) if (it.subsector && cands.includes(it.subsector)) return { field: "sub_sector", slug: it.subsector, word };
  for (const it of subsectors) if (it.sector && cands.includes(it.sector)) return { field: "sector", slug: it.sector, word };
  for (const it of industries) if (it.industry && cands.includes(it.industry)) return { field: "industry", slug: it.industry, word };
  for (const it of subindustries) if (it.sub_industry && cands.includes(it.sub_industry)) return { field: "sub_industry", slug: it.sub_industry, word };
  return null;
}

export const sectorLabel = (f: SectorFilter): string => `${f.word} → ${f.field} '${f.slug}' (validasi daftar Sectors)`;

const pctSmart = (v: number) => `${Math.round((Math.abs(v) <= 1 ? v * 100 : v) * 100) / 100}%`;
export function fmtScreenValue(metric: string, v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  if (metric === "market_cap") return `Rp ${Math.round((v / 1e12) * 10) / 10} T`;
  if (metric === "yield_ttm" || metric === "yoy_quarter_earnings_growth" || metric === "roe_ttm") return pctSmart(v);
  return `${Math.round(v * 100) / 100}`;
}