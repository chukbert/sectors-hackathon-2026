// lib/metrics.ts — semua angka turunan dihitung di sini (pure code). LLM dilarang membuat angka.
export interface DailyRow { date: string; close: number; volume: number; market_cap?: number }
export interface BrokerRow { broker_code: string; nval: number; bval: number; sval: number; f_bval?: number | null; f_sval?: number | null }
export interface BrokerDay { date: string; summary: BrokerRow[] }
export interface RegistryRow { code: string; name: string; is_foreign?: boolean; cohort?: string }
export interface ForeignDay { date: string; net_foreign_inflow: number; foreign_share?: number | null }
export interface FilingRow {
  symbol?: string; sector?: string; sub_sector?: string; transaction_type?: string; timestamp?: string;
  holder_type?: string; holder_name?: string; share_percentage_transaction?: number | null; transaction_value?: number | null; title?: string;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const toM = (idr: number) => r1(idr / 1e6);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
export const lastTradingDay = (now = new Date()): string => {
  const x = new Date(now);
  if (x.getHours() < 16) x.setDate(x.getDate() - 1);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1);
  return iso(x);
};

export function sortDaily(rows: DailyRow[]): DailyRow[] {
  return [...rows].filter((r) => r && r.date && typeof r.close === "number").sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface Returns {
  price: number; ret7: number; ret30: number; ret90: number;
  volMult: number; avgValueB: number; marketCapB: number; nDays: number; zeroVolDays: number;
}

export function returnsFromDaily(rows0: DailyRow[]): Returns | null {
  const rows = sortDaily(rows0);
  const n = rows.length;
  if (n < 2) return null;
  const c = rows.map((r) => r.close);
  const v = rows.map((r) => r.volume);
  const last = c[n - 1]!;
  const at = (k: number) => (n > k ? c[n - 1 - k]! : c[0]!);
  const ret = (k: number) => (at(k) > 0 ? r1(((last - at(k)) / at(k)) * 100) : 0);
  const volBase = n >= 21 ? v.slice(-21, -1).reduce((s, x) => s + x, 0) / 20 : v.reduce((s, x) => s + x, 0) / n;
  const values = rows.slice(-20).map((r) => r.close * r.volume);
  return {
    price: last, ret7: ret(7), ret30: ret(30), ret90: ret(90),
    volMult: volBase > 0 ? r1(v[n - 1]! / volBase) : 1,
    avgValueB: r1(values.reduce((s, x) => s + x, 0) / Math.max(1, values.length) / 1e9),
    marketCapB: r1((rows[n - 1]!.market_cap ?? 0) / 1e9),
    nDays: n, zeroVolDays: rows.slice(-20).filter((r) => !r.volume).length,
  };
}

// FOMO Meter 0–100 yang bisa dibedah komponennya (port v4 lib/fomo.ts).
export interface Fomo { score: number; label: string; components: { label: string; value: string; bad?: boolean }[]; raw: Record<string, number> }
export function fomoMeter(i: { daily: DailyRow[]; asingSellStreak?: number; insiderSold?: boolean; newsNoFiling?: boolean; fundamentalWeak?: boolean }): Fomo | null {
  const rows = sortDaily(i.daily);
  const n = rows.length;
  if (n < 10) return null;
  const c = rows.map((r) => r.close), v = rows.map((r) => r.volume);
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
  const ret7 = n > 7 ? (c[n - 1]! / c[n - 8]! - 1) * 100 : 0;
  const ret30 = n > 30 ? (c[n - 1]! / c[n - 31]! - 1) * 100 : ret7;
  const volz = n >= 30 ? (v[n - 1]! - mean(v.slice(0, -1))) / (std(v.slice(0, -1)) || 1) : 0;
  const sma20 = mean(c.slice(Math.max(0, n - 20)));
  const devSMA = sma20 > 0 ? ((c[n - 1]! - sma20) / sma20) * 100 : 0;
  const parts = {
    ret: clamp01(ret7 / 25) * 25,
    vol: clamp01((volz - 1) / 3) * 20,
    sma: clamp01(devSMA / 15) * 15,
    kat: i.newsNoFiling ? 20 : i.insiderSold ? 8 : 0,
    asing: clamp01((i.asingSellStreak ?? 0) / 9) * 20,
  };
  const score = Math.round(Math.min(100, Object.values(parts).reduce((s, x) => s + x, 0) + (i.fundamentalWeak && ret7 > 10 ? 5 : 0)));
  const label = score >= 80 ? "sangat panas" : score >= 65 ? "panas" : score >= 40 ? "mendekati panas" : "dingin";
  const components = [
    { label: "7d return", value: `${ret7 >= 0 ? "+" : ""}${Math.round(ret7)}%`, bad: ret7 > 15 },
    { label: "z-score vol", value: volz.toFixed(1), bad: volz > 2 },
    { label: "deviasi SMA20", value: `${devSMA >= 0 ? "+" : ""}${Math.round(devSMA)}%`, bad: devSMA > 10 },
    { label: "berita ∉ filing", value: i.newsNoFiling ? "ya" : "tidak", bad: !!i.newsNoFiling },
    { label: `asing −${i.asingSellStreak ?? 0} hari`, value: `${i.asingSellStreak ?? 0}h net-jual`, bad: (i.asingSellStreak ?? 0) >= 5 },
  ];
  return { score, label, components, raw: { ret7: Math.round(ret7), ret30: Math.round(ret30), volz: r1(volz), dev_sma20: Math.round(devSMA), vol_mult: r1(v[n - 1]! / (mean(v.slice(0, -1)) || 1)) } };
}

// Kohort Flow Index — join broker-summary × broker-registry + foreign-flow + filings.
export interface FlowIndex {
  windowDays: number;
  retailNetM: number; institusiNetM: number; asingNetM: number; foreignAvgShare: number;
  retailStreak: number; asingSellStreak: number;
  distribusiRitel: boolean; insiderSold: boolean;
  topBuyers: { code: string; name: string; netM: number; cohort: string }[];
  topSellers: { code: string; name: string; netM: number; cohort: string }[];
  nBrokers: number;
}
export function computeFlow(i: {
  summary: BrokerDay[]; registry: RegistryRow[]; foreign: ForeignDay[]; filings: FilingRow[]; priceUp: boolean;
}): FlowIndex | null {
  const days = i.summary ?? [];
  if (!days.length) return null;
  const reg = new Map(i.registry.map((b) => [b.code, b]));
  const agg = new Map<string, number>();
  let retail = 0, institusi = 0;
  const byDay: { retail: number }[] = [];
  for (const day of days) {
    let r = 0;
    for (const row of day.summary ?? []) {
      agg.set(row.broker_code, (agg.get(row.broker_code) ?? 0) + (row.nval ?? 0));
      const b = reg.get(row.broker_code);
      const cohort = b?.cohort ?? "unknown";
      if (cohort === "retail") { retail += row.nval ?? 0; r += row.nval ?? 0; }
      else if (cohort === "institutional" || b?.is_foreign) institusi += row.nval ?? 0;
    }
    byDay.push({ retail: toM(r) });
  }
  const ff = i.foreign ?? [];
  const asingNetM = toM(ff.reduce((s, x) => s + (x.net_foreign_inflow ?? 0), 0));
  const shares = ff.filter((x) => typeof x.foreign_share === "number") as { foreign_share: number }[];
  const foreignAvgShare = shares.length ? r1((shares.reduce((s, x) => s + x.foreign_share, 0) / shares.length) * 100) : 0;
  let asingSellStreak = 0;
  for (let k = ff.length - 1; k >= 0 && (ff[k]!.net_foreign_inflow ?? 0) < 0; k--) asingSellStreak++;
  let retailStreak = 0;
  for (let k = byDay.length - 1; k >= 0 && byDay[k]!.retail > 0; k--) retailStreak++;
  const retailNetM = r1(byDay.reduce((s, x) => s + x.retail, 0));
  const institusiNetM = toM(institusi);
  const insiderSold = (i.filings ?? []).some((f) => (f.transaction_type ?? "").toLowerCase().includes("sell"));
  const rank = [...agg.entries()]
    .map(([code, net]) => ({ code, name: reg.get(code)?.name ?? code, netM: toM(net), cohort: reg.get(code)?.cohort ?? "unknown" }))
    .sort((a, b) => b.netM - a.netM);
  return {
    windowDays: days.length, retailNetM, institusiNetM, asingNetM, foreignAvgShare,
    retailStreak, asingSellStreak,
    distribusiRitel: i.priceUp && retailNetM > 0 && institusiNetM < 0,
    insiderSold,
    topBuyers: rank.slice(0, 5), topSellers: rank.slice(-5).reverse(),
    nBrokers: rank.length,
  };
}

export interface Liquidity { avgValueB: number; marketCapB: number; label: string; score: number; zeroVolDays: number }
export function liquidityFromDaily(rows0: DailyRow[]): Liquidity | null {
  const r = returnsFromDaily(rows0);
  if (!r) return null;
  const score = clamp01(r.avgValueB / 100);
  const label = r.avgValueB >= 50 ? "sangat likuid" : r.avgValueB >= 10 ? "likuid" : r.avgValueB >= 1 ? "cukup" : "tipis";
  return { avgValueB: r.avgValueB, marketCapB: r.marketCapB, label, score: r1(score), zeroVolDays: r.zeroVolDays };
}

export interface DividendYear { year: number; yieldPct: number; total: number; dates: string[] }
export interface DividendInfo { years: DividendYear[]; latestYieldPct: number; latestYear: number; consistency: number; avgYieldPct: number }
export function dividendFromReport(rep: unknown): DividendInfo | null {
  const hist = (rep as { dividend?: { historical_dividends?: Record<string, { total_yield?: number; total_dividend?: number; breakdown?: { date: string }[] }> } })
    ?.dividend?.historical_dividends;
  if (!hist) return null;
  const years: DividendYear[] = Object.entries(hist)
    .map(([y, v]) => ({ year: Number(y), yieldPct: r1((v.total_yield ?? 0) * 100), total: r1(v.total_dividend ?? 0), dates: (v.breakdown ?? []).map((b) => b.date) }))
    .filter((y) => Number.isFinite(y.year))
    .sort((a, b) => a.year - b.year);
  if (!years.length) return null;
  const recent = years.slice(-5);
  const latest = years[years.length - 1]!;
  return {
    years, latestYieldPct: latest.yieldPct, latestYear: latest.year,
    consistency: Math.round((recent.filter((y) => y.yieldPct > 0).length / recent.length) * 100),
    avgYieldPct: r1(recent.reduce((s, y) => s + y.yieldPct, 0) / recent.length),
  };
}

export function maxDrawdownPct(rows0: DailyRow[], window = 90): number {
  const rows = sortDaily(rows0).slice(-window);
  let peak = -Infinity, mdd = 0;
  for (const r of rows) {
    peak = Math.max(peak, r.close);
    if (peak > 0) mdd = Math.min(mdd, ((r.close - peak) / peak) * 100);
  }
  return r1(mdd);
}