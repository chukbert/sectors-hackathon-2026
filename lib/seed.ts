// lib/seed.ts — fixture deterministik berlabel SEED (hanya dipakai saat SEED=1).
// Tidak pernah dipakai di mode live: live gagal = error jujur, bukan data karangan.
import type { BrokerDay, BrokerRow, DailyRow, FilingRow, ForeignDay, RegistryRow } from "./metrics.js";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let x = hash(seed) || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
function dayBack(n: number, i: number): string { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return iso(d); }

export const COMPANY_NAMES: Record<string, string> = {
  SMAR: "PT Sinar Mas Agro Resources and Technology Tbk", BBCA: "PT Bank Central Asia Tbk", BBRI: "PT Bank Rakyat Indonesia (Persero) Tbk",
  BMRI: "PT Bank Mandiri (Persero) Tbk", BBNI: "PT Bank Negara Indonesia (Persero) Tbk", BRIS: "PT Bank Syariah Indonesia Tbk",
  TLKM: "PT Telkom Indonesia (Persero) Tbk", ASII: "PT Astra International Tbk", UNTR: "PT United Tractors Tbk",
  ADRO: "PT Alamtri Resources Indonesia Tbk", PTBA: "PT Bukit Asam Tbk", ITMG: "PT Indo Tambangraya Megah Tbk",
  BUMI: "PT Bumi Resources Tbk", BRMS: "PT Bumi Resources Minerals Tbk", ANTM: "PT Aneka Tambang Tbk", INCO: "PT Vale Indonesia Tbk",
  TINS: "PT Timah Tbk", MDKA: "PT Merdeka Copper Gold Tbk", INDF: "PT Indofood Sukses Makmur Tbk", ICBP: "PT Indofood CBP Sukses Makmur Tbk",
  MYOR: "PT Mayora Indah Tbk", CPIN: "PT Charoen Pokphand Indonesia Tbk", GOTO: "PT GoTo Gojek Tokopedia Tbk",
  BBRI_ALT: "", MEDC: "PT Medco Energi Internasional Tbk", PGAS: "PT Perusahaan Gas Negara Tbk", SMGR: "PT Semen Indonesia (Persero) Tbk",
  INTP: "PT Indocement Tunggal Prakarsa Tbk", JSMR: "PT Jasa Marga (Persero) Tbk", ACES: "PT Aspirasi Hidup Indonesia Tbk",
  MAPI: "PT Map Aktif Adiperkasa Tbk", AMRT: "PT Sumber Alfaria Trijaya Tbk", KLBF: "PT Kalbe Farma Tbk", SIDO: "PT Industri Jamu dan Farmasi Sido Muncul Tbk",
};
export const companyName = (sym: string) => COMPANY_NAMES[sym.toUpperCase()] ?? `PT ${sym.toUpperCase()} Tbk`;

export function seedDaily(sym: string, n = 90): DailyRow[] {
  const r = rng("daily" + sym);
  const base = 500 + Math.floor(r() * 4500);
  const drift = (r() - 0.4) / 100;
  let px = base;
  const rows: DailyRow[] = [];
  for (let i = 0; i < n; i++) {
    px = Math.max(50, px * (1 + drift + (r() - 0.5) / 40));
    const volume = Math.round((5_000_000 + r() * 95_000_000) / 100) * 100;
    rows.push({ date: dayBack(n, i), close: Math.round(px), volume, market_cap: Math.round(px * (2_000_000_000 + r() * 60_000_000_000)) });
  }
  return rows;
}

const SEED_BROKERS = ["YP", "AK", "BK", "CC", "DX", "MG", "NI", "OD", "PF", "RS"];
export function seedRegistry(): RegistryRow[] {
  return [
    { code: "YP", name: "Yellow Sekuritas", cohort: "retail", is_foreign: false },
    { code: "AK", name: "Asing Kapital", cohort: "institutional", is_foreign: true },
    { code: "BK", name: "Biru Kapital", cohort: "mixed", is_foreign: false },
    { code: "CC", name: "Cahaya Cemerlang", cohort: "retail", is_foreign: false },
    { code: "DX", name: "Delta Exchange", cohort: "institutional", is_foreign: true },
    { code: "MG", name: "Mega Gemilang", cohort: "retail", is_foreign: false },
    { code: "NI", name: "Nusantara Invest", cohort: "mixed", is_foreign: false },
    { code: "OD", name: "Ocean Dana", cohort: "institutional", is_foreign: true },
    { code: "PF", name: "Prima Fund", cohort: "retail", is_foreign: false },
    { code: "RS", name: "Raksa Sekuritas", cohort: "mixed", is_foreign: false },
  ];
}

export interface BrokerSummaryResp { symbol: string; start: string; end: string; data: BrokerDay[] }
export function seedBrokerSummary(sym: string, days = 7): BrokerSummaryResp {
  const r = rng("broker" + sym);
  const data: BrokerDay[] = [];
  for (let i = 0; i < days; i++) {
    const summary: BrokerRow[] = SEED_BROKERS.map((code) => {
      const gross = 1e9 + r() * 40e9;
      const net = (r() - 0.5) * 2 * gross * 0.3;
      const fShare = code === "AK" || code === "DX" || code === "OD" ? 0.6 + r() * 0.3 : 0;
      return {
        broker_code: code, nval: Math.round(net), bval: Math.round(gross), sval: Math.round(gross - net),
        f_bval: Math.round(gross * fShare), f_sval: Math.round((gross - net) * fShare),
      };
    });
    data.push({ date: dayBack(days, i), summary });
  }
  return { symbol: `${sym}.JK`, start: dayBack(days, 0), end: dayBack(days, days - 1), data };
}

export interface ForeignResp { symbol: string; start: string; end: string; data: ForeignDay[] }
export function seedForeignFlow(sym: string, days = 90): ForeignResp {
  const r = rng("ff" + sym);
  const data: ForeignDay[] = [];
  let trend = (r() - 0.6) * 20e9;
  for (let i = 0; i < days; i++) {
    trend = trend * 0.9 + (r() - 0.5) * 30e9;
    data.push({ date: dayBack(days, i), net_foreign_inflow: Math.round(trend), foreign_share: 0.2 + r() * 0.4 });
  }
  return { symbol: `${sym}.JK`, start: dayBack(days, 0), end: dayBack(days, days - 1), data };
}

export interface FilingsResp { results: FilingRow[] }
export function seedFilings(sym: string): FilingsResp {
  const r = rng("fil" + sym);
  const now = Date.now();
  const mk = (days: number, side: "sell" | "buy", sector = "unknown"): FilingRow => ({
    symbol: `${sym}.JK`, sector, sub_sector: "seed", transaction_type: side,
    timestamp: new Date(now - days * 86400000).toISOString(), holder_type: side === "sell" ? "direksi" : "komisaris",
    holder_name: `Seed Holder ${Math.floor(r() * 100)}`, share_percentage_transaction: Math.round(r() * 100) / 100,
    transaction_value: Math.round(r() * 5e9), title: `${side === "sell" ? "Penjualan" : "Pembelian"} saham ${sym} (SEED)`,
  });
  return { results: [mk(1, "sell"), mk(3, "sell"), mk(6, "buy"), mk(9, "sell")] };
}

// Universe insider untuk intent kuasa: 4+ sell 1 sektor 7hr → cluster terdeteksi.
export function seedFilingsUniverse(): FilingsResp {
  const now = Date.now();
  const mk = (symbol: string, sector: string, days: number): FilingRow => ({
    symbol: `${symbol}.JK`, sector, sub_sector: "seed", transaction_type: "sell",
    timestamp: new Date(now - days * 86400000).toISOString(), holder_type: "direksi", holder_name: `Seed Direksi ${symbol}`,
    share_percentage_transaction: 0.5, transaction_value: 2_000_000_000, title: `Penjualan saham ${symbol} (SEED)`,
  });
  return { results: [mk("BMRI", "bank", 1), mk("BBCA", "bank", 2), mk("BBNI", "bank", 4), mk("BRIS", "bank", 6), mk("ANTM", "mining", 3), mk("SMAR", "plantation", 5)] };
}

export interface NewsRow { title: string; body: string; symbols?: string; sector?: string; tags?: string[]; timestamp: string; source?: string }
export function seedNews(sym: string): { results: NewsRow[] } {
  const now = new Date().toISOString();
  return { results: [
    { title: `${companyName(sym)} catat kenaikan volume transaksi (SEED)`, body: `Seed: aktivitas ${sym} meningkat.`, symbols: sym, sector: "seed", tags: ["seed"], timestamp: now },
    { title: `Insider ${sym} transaksi (SEED)`, body: `Seed: filing insider ${sym}.`, symbols: sym, sector: "seed", tags: ["insider", "seed"], timestamp: now },
  ] };
}

export interface CorporateActionsResp {
  start: string; end: string;
  dividend: { symbol: string; ex_date: string; cum_date?: string; recording_date?: string; payment_date?: string; dividend_amount: number; dividend_yield?: number | null }[];
  upcoming_dividend: { symbol: string; ex_date: string; cum_date?: string; payment_date?: string; dividend_amount: number }[];
  right_issue: { symbol: string; ex_date?: string; cum_date?: string; subscription_date?: string; price?: number; new_ratio?: number; old_ratio?: number }[];
  stock_split: { symbol: string; date?: string; split_ratio?: number; ratio?: number }[];
  agm: { symbol: string; agm_date: string; agm_place?: string; agm_time?: string; recording_date?: string }[];
  warrant: unknown[]; bonus: unknown[];
}
function futureDay(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
export function seedCorporateActions(): CorporateActionsResp {
  return {
    start: dayBack(30, 0), end: futureDay(30),
    dividend: [
      { symbol: "BMRI.JK", ex_date: dayBack(60, 59), cum_date: dayBack(60, 58), recording_date: dayBack(60, 57), payment_date: dayBack(60, 40), dividend_amount: 66, dividend_yield: null },
      { symbol: "ADRO.JK", ex_date: dayBack(20, 19), cum_date: dayBack(20, 18), recording_date: dayBack(20, 17), payment_date: futureDay(5), dividend_amount: 12, dividend_yield: null },
    ],
    upcoming_dividend: [
      { symbol: "SMAR.JK", ex_date: futureDay(4), cum_date: futureDay(3), payment_date: futureDay(18), dividend_amount: 250 },
    ],
    right_issue: [
      { symbol: "BUMI.JK", ex_date: futureDay(7), cum_date: futureDay(5), subscription_date: futureDay(9), price: 80, new_ratio: 3, old_ratio: 10 },
    ],
    stock_split: [{ symbol: "BRMS.JK", date: futureDay(12), split_ratio: 5, ratio: 5 }],
    agm: [
      { symbol: "BBCA.JK", agm_date: futureDay(10), agm_place: "Jakarta (SEED)", agm_time: "10:00", recording_date: futureDay(3) },
      { symbol: "TLKM.JK", agm_date: futureDay(21), agm_place: "Bandung (SEED)", agm_time: "14:00", recording_date: futureDay(14) },
    ],
    warrant: [], bonus: [],
  };
}

const KNOWN_GROUP_BY_SYMBOL: Record<string, string> = {
  SMAR: "Sinar Mas", BSDE: "Sinar Mas", INKP: "Sinar Mas", BMAS: "Sinar Mas",
  BRPT: "Barito (Prajogo)", TPIA: "Barito (Prajogo)", BREN: "Barito (Prajogo)", CUAN: "Barito (Prajogo)",
  INDF: "Salim", ICBP: "Salim", ISAT: "Salim", DSSA: "Salim",
  ADRO: "Alamtri (Adaro)", BUMI: "Bumi", BRMS: "Bumi",
  ANTM: "MIND ID (BUMM)", INCO: "MIND ID (BUMM)", TINS: "MIND ID (BUMM)", PTBA: "MIND ID (BUMM)",
  ASII: "Astra", UNTR: "Astra", AUTO: "Astra", SMBR: "Astra",
  MDKA: "Merdeka", MBMA: "Merdeka", BNBR: "Bakrie", BABP: "Bakrie", YULE: "Bakrie",
};
export function seedReport(symRaw: string, sections: string[]): Record<string, unknown> {
  const sym = symRaw.toUpperCase();
  const r = rng("rep" + sym);
  const out: Record<string, unknown> = { symbol: `${sym}.JK`, company_name: companyName(sym) };
  if (sections.includes("overview")) out.overview = {
    sector: "seed-universe", sub_sector: "seed", industry: "seed-industry", sub_industry: "seed-sub-industry",
    listing_board: "Main", listing_date: "1990-01-01", market_cap: Math.round((1 + r() * 40) * 1e12), market_cap_rank: Math.ceil(r() * 100),
    employee_num: Math.round(1000 + r() * 30000), last_close_price: Math.round(500 + r() * 5000), latest_close_date: dayBack(1, 0),
    esg_score: Math.round((15 + r() * 40) * 100) / 100, tags: ["seed-tag"], indices: ["IDX30", "LQ45"],
  };
  if (sections.includes("valuation")) out.valuation = {
    last_close_price: Math.round(500 + r() * 5000), latest_close_date: dayBack(1, 0), daily_close_change: Math.round((r() - 0.5) * 400) / 10000,
    forward_pe: Math.round((5 + r() * 30) * 100) / 100, intrinsic_value: Math.round(500 + r() * 8000),
    historical_valuation: [2023, 2024, 2025].map((year) => ({
      year, pe: Math.round((5 + r() * 30) * 100) / 100, pb: Math.round((0.5 + r() * 5) * 100) / 100,
      ps: Math.round((0.5 + r() * 8) * 100) / 100, pcf: Math.round((3 + r() * 25) * 100) / 100,
      peg: Math.round((0.3 + r() * 3) * 100) / 100, pe_peer_avg: null, pb_peer_avg: null, enterprise_to_ebitda: null, enterprise_to_revenue: null,
    })),
  };
  if (sections.includes("financials")) {
    const yearly = [2021, 2022, 2023, 2024, 2025].map((year) => {
      const revenue = Math.round((1 + r() * 30) * 1e12);
      return { year, revenue, earnings: Math.round(revenue * (0.04 + r() * 0.14)), total_assets: Math.round((2 + r() * 60) * 1e12), total_equity: Math.round((1 + r() * 20) * 1e12), total_liabilities: Math.round((1 + r() * 30) * 1e12), operating_cash_flow: Math.round((0.2 + r() * 5) * 1e12), free_cash_flow: Math.round((0.1 + r() * 4) * 1e12), eps: Math.round((50 + r() * 500) * 100) / 100 };
    });
    out.financials = {
      eps: yearly[yearly.length - 1]!.eps, historical_financials: yearly,
      yoy_quarter_earnings_growth: Math.round((r() - 0.3) * 400) / 10000, yoy_quarter_revenue_growth: Math.round((r() - 0.3) * 300) / 10000,
    };
  }
  if (sections.includes("future")) out.future = {
    company_value_forecasts: [{ estimate_year: 2026, eps_estimate: Math.round((50 + r() * 500) * 100) / 100, revenue_estimate: Math.round((1 + r() * 30) * 1e12) }],
    company_growth_forecasts: [{ base_year: 2025, estimate_year: 2026, eps_growth: Math.round((r() - 0.2) * 500) / 10000, revenue_growth: Math.round((r() - 0.2) * 400) / 10000 }],
    analyst_rating_breakdown: { strong_buy: Math.ceil(r() * 15), buy: Math.ceil(r() * 8), hold: Math.ceil(r() * 8), sell: Math.ceil(r() * 3), strong_sell: 0, n_analyst: Math.round(5 + r() * 25), updated_on: `${dayBack(30, 0)} 10:00:00` },
  };
  if (sections.includes("management")) out.management = {
    key_executives: [{ name: `Seed Direktur ${sym}`, position: "President Director" }, { name: `Seed Wakil ${sym}`, position: "Vice President Director" }],
    executives_shareholdings: [{ name: `Seed Direktur ${sym}`, position: "President Director", share_amount: Math.round(r() * 5e6), share_percentage: Math.round(r() * 100) / 100 }],
  };
  if (sections.includes("peers")) {
    const peerSyms = ["BBCA", "BBRI", "BMRI", "TLKM", "ASII", "UNTR", "ADRO", "ANTM"].filter((p) => p !== sym).slice(0, 5);
    out.peers = [{ peers_data: { group_name: { sector: "seed", industry: "seed-industry", sub_sector: "seed", sub_industry: "seed" }, companies: [{ symbol: `${sym}.JK`, company_name: companyName(sym), group: ["self"], year: 2025, pe_ttm: Math.round((5 + r() * 20) * 100) / 100, pb_mrq: Math.round((0.5 + r() * 4) * 100) / 100, market_cap: Math.round((1 + r() * 30) * 1e12), net_income: Math.round(r() * 5e12), total_revenue: Math.round((1 + r() * 30) * 1e12), total_equity: Math.round((1 + r() * 20) * 1e12), total_assets: Math.round((2 + r() * 60) * 1e12) }, ...peerSyms.map((p) => ({ symbol: `${p}.JK`, company_name: companyName(p), group: [], year: 2025, pe_ttm: Math.round((5 + r() * 20) * 100) / 100, pb_mrq: Math.round((0.5 + r() * 4) * 100) / 100, market_cap: Math.round((1 + r() * 30) * 1e12), net_income: Math.round(r() * 5e12), total_revenue: Math.round((1 + r() * 30) * 1e12), total_equity: Math.round((1 + r() * 20) * 1e12), total_assets: Math.round((2 + r() * 60) * 1e12) }))] } }];
  }
  if (sections.includes("dividend")) {
    const years: Record<string, unknown> = {};
    let yieldNow = 0.02 + r() * 0.04;
    for (let y = 2020; y <= 2026; y++) {
      const paid = r() > 0.15 || y < 2024;
      years[String(y)] = { breakdown: paid ? [{ date: `${y}-05-15`, total: Math.round(yieldNow * 100) }] : [], total_yield: paid ? Math.round(yieldNow * 10000) / 10000 : 0, total_dividend: paid ? Math.round(yieldNow * 100) : 0 };
      yieldNow = Math.max(0.005, yieldNow * (0.8 + r() * 0.5));
    }
    out.dividend = { historical_dividends: years };
  }
  if (sections.includes("ownership")) {
    const group = KNOWN_GROUP_BY_SYMBOL[sym];
    out.ownership = {
      conglomerates_group: group ?? undefined,
      major_shareholders: group
        ? [{ name: `PT ${group} Holdings`, share_percentage: 55 + r() * 20 }, { name: "Masyarakat", share_percentage: 30 }]
        : [{ name: "Masyarakat", share_percentage: 40 + r() * 40 }, { name: `${companyName(sym)} Founders`, share_percentage: 10 + r() * 15 }],
    };
  }
  return out;
}

export interface ActivityResp { broker_code: string; start: string; end: string; data: { date: string; summary: { symbol: string; nval: number; bval: number; sval: number; f_bval?: number | null; f_sval?: number | null }[] }[] }
export function seedBrokerActivity(code: string, days = 14): ActivityResp {
  const r = rng("act" + code);
  const syms = ["BRMS", "BUMI", "ANTM", "ADRO", "PTBA", "SMAR", "BBCA", "TLKM"];
  const data = [];
  for (let i = 0; i < days; i++) {
    const summary = syms.map((symbol) => {
      const bval = 1e9 + r() * 20e9, sval = 1e9 + r() * 20e9;
      const isForeign = code === "AK" || code === "DX" || code === "OD";
      return { symbol: `${symbol}.JK`, nval: Math.round(bval - sval), bval: Math.round(bval), sval: Math.round(sval), f_bval: isForeign ? Math.round(bval) : null, f_sval: isForeign ? Math.round(sval) : null };
    });
    data.push({ date: dayBack(days, i), summary });
  }
  return { broker_code: code, start: dayBack(days, 0), end: dayBack(days, days - 1), data };
}

export function seedCommodityPrice(commodity: string): { name: string; date: string; price_usd_per_ton: number }[] {
  const start = commodity === "nickel" ? 16000 : 110;
  const end = commodity === "nickel" ? 17200 : 123.2;
  const out: { name: string; date: string; price_usd_per_ton: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
    out.push({ name: commodity === "nickel" ? "Nickel" : "Coal", date: iso(d), price_usd_per_ton: Math.round((start + ((end - start) * i) / 11) * 100) / 100 });
  }
  return out;
}

export function seedSalesDestination(): { year: number; data: Record<string, { percentage_of_sales_volume: number | null; percentage_of_total_revenue: number | null; volume: number | null; revenue_usd?: number | null }> } {
  return { year: 2024, data: {
    China: { percentage_of_sales_volume: 16, percentage_of_total_revenue: null, volume: null, revenue_usd: 70_577_000 },
    India: { percentage_of_sales_volume: null, percentage_of_total_revenue: null, volume: 7, revenue_usd: 36_988_000 },
    Indonesia: { percentage_of_sales_volume: 32, percentage_of_total_revenue: null, volume: null },
    Japan: { percentage_of_sales_volume: null, percentage_of_total_revenue: null, volume: 29 },
  } };
}

export function seedMiningPerformance(): { year: number; available_years: number[]; data: { year: number; strip_ratio: number; production_volume: number; sales_volume: number }[] } {
  return { year: 2024, available_years: [2022, 2023, 2024], data: [
    { year: 2022, strip_ratio: 4.4, production_volume: 60.1, sales_volume: 62.5 },
    { year: 2023, strip_ratio: 4.1, production_volume: 62.3, sales_volume: 66.2 },
    { year: 2024, strip_ratio: 3.9, production_volume: 64.64, sales_volume: 71.36 },
  ] };
}

export function seedIndexDaily(n = 60): { data: { date: string; close: number }[] } {
  const r = rng("ihsg");
  let px = 7100;
  const data = [];
  for (let i = 0; i < n; i++) { px = px * (1 + (r() - 0.48) / 60); data.push({ date: dayBack(n, i), close: Math.round(px * 100) / 100 }); }
  return { data };
}

export function seedSuspensions(): { results: { symbol: string; suspension_date: string; reason: string }[] } {
  return { results: [{ symbol: "SEED.JK", suspension_date: dayBack(14, 10), reason: "Seed: suspend contoh" }] };
}

export interface ScreenerSeedRow { symbol: string; company_name: string; query_values: Record<string, number | null> }
export function seedScreener(where: string, orderBy: string, limit = 5): { results: ScreenerSeedRow[]; pagination: { total_count: number } } {
  const metric = orderBy.replace(/^-/, "");
  const pe: Record<string, number> = { BBCA: 18.2, BBRI: 11.4, BMRI: 9.5, TLKM: 14.1, ASII: 7.2, UNTR: 5.1, ADRO: 4.3, PTBA: 6.8, ANTM: 22.4, SMAR: 3.9 };
  const roe: Record<string, number> = { BBCA: 0.21, BBRI: 0.18, BMRI: 0.19, TLKM: 0.14, ASII: 0.12, UNTR: 0.16, ADRO: 0.09, PTBA: 0.11, ANTM: 0.07, SMAR: 0.13 };
  const der: Record<string, number> = { BBCA: 0.9, BBRI: 1.4, BMRI: 1.1, TLKM: 0.6, ASII: 0.8, UNTR: 0.5, ADRO: 0.7, PTBA: 0.4, ANTM: 1.2, SMAR: 1.0 };
  const mcap: Record<string, number> = { BBCA: 1230e12, BBRI: 980e12, BMRI: 750e12, TLKM: 380e12, ASII: 210e12, UNTR: 120e12, ADRO: 95e12, PTBA: 42e12, ANTM: 65e12, SMAR: 12e12 };
  const yld: Record<string, number> = { BBCA: 0.028, BBRI: 0.045, BMRI: 0.052, TLKM: 0.041, ASII: 0.033, UNTR: 0.071, ADRO: 0.084, PTBA: 0.095, ANTM: 0.012, SMAR: 0.074 };
  const grow: Record<string, number> = { BBCA: 0.12, BBRI: 0.08, BMRI: 0.09, TLKM: 0.05, ASII: 0.03, UNTR: -0.04, ADRO: -0.12, PTBA: 0.06, ANTM: 0.21, SMAR: 0.15 };
  const value = (s: string): number =>
    metric === "market_cap" ? mcap[s]! : metric === "der_mrq" ? der[s]! : metric === "yield_ttm" ? yld[s]! :
    metric === "yoy_quarter_earnings_growth" ? grow[s]! : metric === "roe_ttm" ? roe[s]! : pe[s]!;
  const syms = Object.keys(pe).sort((a, b) => (orderBy.startsWith("-") ? value(b) - value(a) : value(a) - value(b))).slice(0, limit);
  void where;
  return {
    results: syms.map((s) => ({ symbol: s, company_name: companyName(s), query_values: { [metric]: value(s) } })),
    pagination: { total_count: Object.keys(pe).length },
  };
}

// — helper list slug (bentuk mengikuti docs: array pair kebab-case) —
export interface SlugPair { sector?: string; subsector?: string; industry?: string; sub_industry?: string }
export function seedSubsectors(): SlugPair[] {
  return [
    { sector: "financials", subsector: "banks" }, { sector: "financials", subsector: "insurance" },
    { sector: "energy", subsector: "coal" }, { sector: "energy", subsector: "oil-gas" },
    { sector: "basic-materials", subsector: "gold" }, { sector: "basic-materials", subsector: "nickel" },
    { sector: "basic-materials", subsector: "cement" }, { sector: "basic-materials", subsector: "metal-mineral" },
    { sector: "infrastructures", subsector: "telecommunication" }, { sector: "industrials", subsector: "construction" },
    { sector: "consumer-non-cyclicals", subsector: "tobacco" }, { sector: "consumer-non-cyclicals", subsector: "food-beverages" },
    { sector: "consumer-cyclicals", subsector: "automotive" }, { sector: "consumer-cyclicals", subsector: "retail" },
    { sector: "healthcare", subsector: "pharmaceuticals" }, { sector: "properties-real-estate", subsector: "properties-real-estate" },
    { sector: "technology", subsector: "technology" }, { sector: "transportation-logistic", subsector: "transportation" },
    { sector: "transportation-logistic", subsector: "logistics" },
  ];
}
export function seedIndustries(): SlugPair[] {
  return [
    { subsector: "banks", industry: "banks" }, { subsector: "coal", industry: "coal" },
    { subsector: "telecommunication", industry: "telecommunication" }, { subsector: "automotive", industry: "automotive" },
    { subsector: "pharmaceuticals", industry: "pharmaceuticals" }, { subsector: "retail", industry: "retail" },
  ];
}
export function seedSubindustries(): SlugPair[] {
  return [
    { industry: "banks", sub_industry: "banks" }, { industry: "coal", sub_industry: "coal" },
    { industry: "telecommunication", sub_industry: "telecommunication" },
  ];
}

// — quarterly financials (bentuk mengikuti docs: array QuarterlyFinancialItem) —
export interface QuarterlySeedItem {
  symbol: string; date: string; revenue: number; earnings: number; gross_profit: number; ebitda: number;
  total_assets: number; total_liabilities: number; total_equity: number; total_debt: number | null;
  operating_cash_flow: number; free_cash_flow: number;
}
function quarterEnds(n: number): string[] {
  const now = new Date();
  let y = now.getUTCFullYear();
  let qIdx = Math.floor(now.getUTCMonth() / 3) - 1;
  if (qIdx < 0) { qIdx = 3; y -= 1; }
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(iso(new Date(Date.UTC(y, (qIdx + 1) * 3, 0))));
    qIdx -= 1;
    if (qIdx < 0) { qIdx = 3; y -= 1; }
  }
  return out;
}
export function seedQuarterly(symRaw: string, n = 4): QuarterlySeedItem[] {
  const sym = symRaw.toUpperCase();
  const r = rng("qfin" + sym);
  const base = 0.8e12 + r() * 6e12;
  const margin = 0.05 + r() * 0.12;
  return quarterEnds(n).map((date, i) => {
    const seasonal = 1 + 0.12 * Math.sin((i % 4) * 1.7) + (r() - 0.5) * 0.1;
    const revenue = Math.round(base * seasonal * (1.015 ** i));
    const earnings = Math.round(revenue * margin * (0.85 + r() * 0.3));
    return {
      symbol: `${sym}.JK`, date, revenue, earnings, gross_profit: Math.round(revenue * (0.2 + r() * 0.3)),
      ebitda: Math.round(earnings * (1.4 + r() * 0.6)), total_assets: Math.round(revenue * (2 + r() * 3)),
      total_liabilities: Math.round(revenue * (1 + r() * 1.6)), total_equity: Math.round(revenue * (0.8 + r() * 1.4)),
      total_debt: r() > 0.2 ? Math.round(revenue * r()) : null,
      operating_cash_flow: Math.round(earnings * (0.9 + r() * 0.8)), free_cash_flow: Math.round(earnings * (0.4 + r() * 0.7)),
    };
  });
}

// — revenue segments (bentuk mengikuti docs: revenue_breakdown source/target) —
export function seedSegments(symRaw: string): { symbol: string; financial_year: number; revenue_breakdown: { value: number; source: string; target: string }[] } {
  const sym = symRaw.toUpperCase();
  const r = rng("seg" + sym);
  const total = (2 + r() * 12) * 1e12;
  const parts: [string, string, number][] = [
    ["Coal", "Penjualan", 0.52], ["Jasa", "Pendapatan jasa", 0.21], ["Logistik", "Pendapatan jasa", 0.14], ["Lainnya", "Pendapatan lain", 0.13],
  ];
  return {
    symbol: `${sym}.JK`, financial_year: new Date().getFullYear() - 1,
    revenue_breakdown: parts.map(([source, target, share]) => ({ value: Math.round(total * share), source, target })),
  };
}