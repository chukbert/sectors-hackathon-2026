// Klien + tipe Struk Jadi Saham. Semua angka datang dari Core (yang hanya membaca data Sectors).

const BASE = "/api/core/v1/struk";

export type Src = {
  api: string;
  field: string | null;
  query: string | null;
  fetched_at: string | null;
  source: string | null;
  credits: number;
  cache_key?: string;
};

export type SectorsOff = { sectors_off: true; detail: string; message: string };

export type BasketCompany = {
  symbol: string;
  name: string;
  items: string[];
  // Status per baris struk — tebakan AI tidak ikut "terverifikasi" dari baris lain di emiten yang sama.
  lines: { raw: string; relation: "direct" | "indirect" | "dugaan"; verified: boolean; note: string | null }[];
  verified: boolean;
  relation: "direct" | "indirect" | "dugaan";
  note: string | null;
  sub_sector: string | null;
  market_cap: number | null;
  group: string;
};

// Harga = data struk pengguna (bisa dikoreksi); margin laba = data Sectors.
export type ScanItem = { raw: string; brand: string; symbol: string | null; price: number | null };

export type Spend = {
  total: number;
  to_issuers: number;
  to_issuers_share: number | null;
  other: number;
  other_share: number | null;
  lines: number;
  priced_lines: number;
  companies: { symbol: string; name: string; group: string; verified: boolean; amount: number; share: number | null; net_margin: number | null; per_100: number | null }[];
  groups: { label: string; kind: string; symbols: string[]; amount: number; share: number | null }[];
  year: number;
  price_source: string;
  margin_src: Src;
};

export type ScanResult = {
  store_name: string | null;
  llm_read: boolean;
  items: ScanItem[];
  companies: BasketCompany[];
  groups: { label: string; kind: string; symbols: string[] }[];
  unknown: { raw: string; brand: string }[];
  spend: Spend;
  universe_total: number;
  src: Src;
  disclaimer: string;
};

export type Holder = { name: string; pct: number; symbol: string | null };
export type ChainLink = Holder & { of: string };

// Lima sisi (30 cek ala Simply Wall St) — hasil per cek: true lolos, false tidak, null data Sectors tidak cukup.
export type SfCheck = {
  id: string;
  title: string;
  result: boolean | null;
  note: string | null;
  values: { field: string; value: number | null }[];
  where: string;
  market_pass: number;
};

export type SfAxis = { id: string; label: string; blurb: string; checks: SfCheck[]; passed: number; assessed: number; total: number };

export type Snowflake = {
  axes: SfAxis[];
  passed: number;
  assessed: number;
  total: number;
  is_bank: boolean;
  pays_dividend: boolean;
  peer_group: string | null;
  stats: { market_pe: number | null; yield_p25: number | null; yield_p75: number | null; market_eps_growth_fc: number | null; market_rev_growth_fc: number | null };
  universe_total: number;
  src: Src;
};

export type Card = {
  symbol: string;
  name: string;
  sector: string | null;
  sub_sector: string | null;
  industry: string | null;
  brands: string[];
  listing_date: string | null;
  listing_board: string | null;
  employees: number | null;
  year: number;
  facts: {
    revenue: number | null;
    earnings: number | null;
    net_margin: number | null;
    per_100: number | null;
    market_cap: number | null;
    market_cap_rank: number | null;
    universe_total: number;
    total_debt: number | null;
    total_equity: number | null;
    dividend_per_share: number | null;
    payout_ratio: number | null;
    roe: number | null;
  };
  facts_src: Src;
  trend: { revenue: { year: number; value: number | null }[]; earnings: { year: number; value: number | null }[]; src: Src };
  money: null | {
    year: number;
    links: { source: string; target: string; value: number }[];
    src: Src;
    explain?: { labels: Record<string, string>; summary: string | null; llm: boolean };
  };
  owners: { holders: Holder[]; free_float: number | null; group: { label: string; kind: string; chain: ChainLink[]; affiliates: string[] }; src: Src };
  peers: { symbol: string; name: string; is_self: boolean; revenue: number | null; earnings: number | null; net_margin: number | null; market_cap: number | null }[];
  peers_src: Src;
  snowflake: Snowflake;
  disclaimer: string;
};

export type Status = {
  sectors_off: boolean;
  llm_available: boolean;
  model: string;
  disclaimer: string;
  store?: { credits_spent: number; credits_saved: number; store_hits: number; cached_keys: number; credit_remaining: number; mode: string };
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: string = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* noop */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const isOff = (x: unknown): x is SectorsOff => !!x && typeof x === "object" && (x as SectorsOff).sectors_off === true;

export async function status(): Promise<Status> {
  return j(await fetch(`${BASE}/status`, { cache: "no-store" }));
}

export async function scan(body: { text?: string; image?: string }): Promise<ScanResult | SectorsOff> {
  return j(await fetch(`${BASE}/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

export async function recount(items: ScanItem[]): Promise<Omit<ScanResult, "store_name" | "llm_read"> | SectorsOff> {
  return j(await fetch(`${BASE}/basket`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) }));
}

export async function company(symbol: string): Promise<Card | SectorsOff> {
  return j(await fetch(`${BASE}/company/${encodeURIComponent(symbol)}`, { cache: "no-store" }));
}

export async function search(q: string): Promise<{ results: { symbol: string; name: string; brand: string | null }[] } | SectorsOff> {
  return j(await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`, { cache: "no-store" }));
}

// ------------------------------------------------------------- format angka (id-ID)

const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function rupiah(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e12) return `${sign}Rp${nf1.format(a / 1e12)} triliun`;
  if (a >= 1e9) return `${sign}Rp${nf1.format(a / 1e9)} miliar`;
  if (a >= 1e6) return `${sign}Rp${nf1.format(a / 1e6)} juta`;
  return `${sign}Rp${nf0.format(a)}`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(v * 100)}%`;
}

export function num(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return nf0.format(v);
}

// Porsi saham: di bawah 1% pakai 2 angka penting agar 0,04% tidak terbulatkan jadi "0%".
export function share(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const p = v * 100;
  if (p > 0 && p < 1) return `${new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 2 }).format(p)}%`;
  return pct(v);
}

// Nominal belanja pengguna: tampil persis (Rp1.998.000), bukan dibulatkan seperti angka perusahaan.
export function rp(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `Rp${nf0.format(v)}`;
}

// ------------------------------------------------------------- label & format field lima sisi

const SF_LABEL: Record<string, string> = {
  last_close_price: "Harga saham",
  intrinsic_value: "Nilai wajar (Sectors)",
  pe_ttm: "PE 12 bulan",
  pe: "PE",
  pe_peer_avg: "PE rata-rata industri",
  pb: "PB",
  pb_peer_avg: "PB rata-rata industri",
  peg: "PEG",
  forecast_eps_estimate: "Perkiraan laba/saham",
  forecast_eps_growth: "Perkiraan pertumbuhan laba",
  forecast_revenue_growth: "Perkiraan pertumbuhan pendapatan",
  outstanding_shares: "Jumlah saham",
  total_equity: "Modal sendiri",
  total_assets: "Total aset",
  total_debt: "Utang berbunga",
  eps: "Laba/saham",
  eps_growth: "Pertumbuhan laba/saham",
  roe: "ROE",
  roa: "ROA",
  ebit: "Laba operasi (EBIT)",
  current_liabilities: "Utang jangka pendek",
  current_assets: "Aset lancar",
  non_current_liabilities: "Utang jangka panjang",
  current_ratio: "Rasio lancar",
  debt_to_equity_ratio: "Utang/modal",
  cash_flow_to_debt_ratio: "Kas operasi/utang",
  interest_coverage_ratio: "EBIT/beban bunga",
  non_performing_loan: "Kredit macet (NPL)",
  gross_loan: "Total kredit",
  loan_to_deposit_ratio: "LDR",
  capital_adequacy_ratio: "CAR",
  yield_ttm: "Imbal hasil dividen",
  total_dividend: "Dividen/saham",
  payout_ratio: "Rasio dividen/laba",
};

const SF_PER_SHARE = new Set(["last_close_price", "intrinsic_value", "eps", "total_dividend", "forecast_eps_estimate"]);
const SF_TIMES = new Set(["pe_ttm", "pe", "pe_peer_avg", "pb", "pb_peer_avg", "peg", "current_ratio", "interest_coverage_ratio"]);
const SF_PCT = new Set([
  "eps_growth", "forecast_eps_growth", "forecast_revenue_growth", "roe", "roa", "yield_ttm", "payout_ratio",
  "debt_to_equity_ratio", "cash_flow_to_debt_ratio", "loan_to_deposit_ratio", "capital_adequacy_ratio",
]);

function sfBase(field: string): [string, string | undefined] {
  const m = field.match(/^([a-z_]+)(?:\[(\d{4})\])?$/);
  return m ? [m[1], m[2]] : [field, undefined];
}

export function sfLabel(field: string): string {
  const [base, year] = sfBase(field);
  const label = SF_LABEL[base] ?? base;
  return year ? `${label} ${year}` : label;
}

export function sfValue(field: string, v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  const [base] = sfBase(field);
  if (SF_PER_SHARE.has(base)) return `${v < 0 ? "−" : ""}Rp${nf1.format(Math.abs(v))}`;
  if (SF_TIMES.has(base)) return `${nf1.format(v)}×`;
  if (SF_PCT.has(base)) return pct(v);
  if (base === "outstanding_shares") return `${nf0.format(v)} lembar`;
  return rupiah(v);
}
