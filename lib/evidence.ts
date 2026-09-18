// lib/evidence.ts — satu pintu semua fetch Sectors (agar hemat kredit & mudah diaudit).
// Live gagal → { ok:false } dan orchestrator menandai "data tidak tersedia" — TIDAK PERNAH fallback karangan.
import type { CreditSession } from "./credit.js";
import { daysAgo, lastTradingDay, type BrokerDay, type DailyRow, type FilingRow, type ForeignDay, type RegistryRow } from "./metrics.js";
import {
  seedBrokerActivity, seedBrokerSummary, seedCommodityPrice, seedCorporateActions, seedDaily, seedFilings,
  seedFilingsUniverse, seedForeignFlow, seedIndexDaily, seedIndustries, seedMiningPerformance, seedNews, seedQuarterly,
  seedRegistry, seedReport, seedSalesDestination, seedScreener, seedSegments, seedSubindustries, seedSubsectors, seedSuspensions,
} from "./seed.js";

export type Getter = <T>(endpoint: string, seed: unknown) => Promise<{ data: T; seed: boolean }>;
export interface Evidence<T> { data: T | null; seed: boolean; ok: boolean; err?: string }

export function getterFor(session: CreditSession) {
  return async <T>(endpoint: string, seed: unknown) => {
    const { sectorsGet } = await import("./sectors.js");
    const r = await sectorsGet<T>(endpoint, session, { seed });
    return { data: r.data, seed: r.seed };
  };
}

async function grab<T>(label: string, fn: () => Promise<{ data: T; seed: boolean }>): Promise<Evidence<T>> {
  try {
    const r = await fn();
    return { data: r.data, seed: r.seed, ok: true };
  } catch (e) {
    return { data: null, seed: false, ok: false, err: `${label}: ${String((e as Error).message ?? e)}` };
  }
}

export const fetchDaily = (get: Getter, sym: string, days = 90): Promise<Evidence<DailyRow[]>> =>
  grab("daily", () => get<DailyRow[]>(`/daily/${sym}?start=${daysAgo(days)}&end=${lastTradingDay()}`, seedDaily(sym, Math.max(30, days))));

export interface BrokerSummaryResp { symbol?: string; start?: string; end?: string; data: BrokerDay[] }
export const fetchBrokerSummary = (get: Getter, sym: string, days = 7): Promise<Evidence<BrokerSummaryResp>> =>
  grab("broker-summary", () => get<BrokerSummaryResp>(`/broker-summary/${sym}?start=${daysAgo(days)}&end=${lastTradingDay()}`, seedBrokerSummary(sym, days)));

export const fetchRegistry = (get: Getter): Promise<Evidence<RegistryRow[]>> =>
  grab("broker-registry", () => get<RegistryRow[]>(`/brokers/`, seedRegistry()));

export interface ForeignResp { symbol?: string; data: ForeignDay[] }
export const fetchForeignFlow = (get: Getter, sym: string, days = 90): Promise<Evidence<ForeignResp>> =>
  grab("foreign-flow", () => get<ForeignResp>(`/foreign-flow/${sym}?start=${daysAgo(days)}&end=${lastTradingDay()}`, seedForeignFlow(sym, days)));

export interface FilingsResp { results: FilingRow[] }
export const fetchFilings = (get: Getter, sym: string | null, days = 14): Promise<Evidence<FilingsResp>> =>
  grab("filings", () => get<FilingsResp>(sym
    ? `/filings/?symbol=${sym}&transaction_type=sell&start=${daysAgo(days)}&end=${lastTradingDay()}`
    : `/filings/?transaction_type=sell&start=${daysAgo(days)}&end=${lastTradingDay()}`,
    sym ? seedFilings(sym) : seedFilingsUniverse()));

export interface NewsResp { results: { title: string; body?: string; symbols?: string; sector?: string; tags?: string[]; timestamp: string; source?: string }[] }
export const fetchNews = (get: Getter, sym: string, days = 14): Promise<Evidence<NewsResp>> =>
  grab("news", () => get<NewsResp>(`/news/?symbols=${sym}&start=${daysAgo(days)}&end=${lastTradingDay()}`, seedNews(sym)));

export interface CorporateActions {
  start?: string; end?: string;
  dividend?: { symbol: string; ex_date: string; cum_date?: string; recording_date?: string; payment_date?: string; dividend_amount?: number; dividend_yield?: number | null }[];
  upcoming_dividend?: { symbol: string; ex_date: string; cum_date?: string; payment_date?: string; dividend_amount?: number }[];
  right_issue?: { symbol: string; ex_date?: string; cum_date?: string; subscription_date?: string; price?: number; new_ratio?: number; old_ratio?: number }[];
  stock_split?: { symbol: string; date?: string; split_ratio?: number; ratio?: number }[];
  agm?: { symbol: string; agm_date: string; agm_place?: string; agm_time?: string; recording_date?: string }[];
  warrant?: unknown[]; bonus?: unknown[];
}
export const fetchCorporateActions = (get: Getter): Promise<Evidence<CorporateActions>> =>
  grab("corporate-actions", () => get<CorporateActions>(`/corporate-actions/`, seedCorporateActions()));

export const fetchReport = (get: Getter, sym: string, sections: string[]): Promise<Evidence<Record<string, unknown>>> =>
  grab("company-report", () => get<Record<string, unknown>>(`/company/report/${sym}?sections=${sections.join(",")}`, seedReport(sym, sections)));

export interface ActivityResp { broker_code?: string; start?: string; end?: string; data: { date: string; summary: { symbol: string; nval?: number | null; bval?: number | null; sval?: number | null; f_bval?: number | null; f_sval?: number | null }[] }[] }
export const fetchBrokerActivity = (get: Getter, code: string, days = 14): Promise<Evidence<ActivityResp>> =>
  grab("broker-activity", () => get<ActivityResp>(`/broker-activity/${code}?start=${daysAgo(days)}&end=${lastTradingDay()}`, seedBrokerActivity(code, days)));

export interface SuspensionResp { results: { symbol?: string; suspension_date?: string; reason?: string }[] }
export const fetchSuspensions = (get: Getter, sym: string | null): Promise<Evidence<SuspensionResp>> =>
  grab("suspensions", () => get<SuspensionResp>(sym ? `/suspensions/?symbol=${sym}` : `/suspensions/`, seedSuspensions()));

export interface IndexResp { data: { date: string; close: number }[] }
export const fetchIndexDaily = (get: Getter, code = "IDXCOMPOSITE", days = 60): Promise<Evidence<IndexResp>> =>
  grab("index-daily", () => get<IndexResp>(`/index-daily/${code}?start=${daysAgo(days)}&end=${lastTradingDay()}`, seedIndexDaily(days)));

export interface PriceResp extends Array<{ name?: string; date: string; price_usd_per_ton?: number; price?: number }> {}
export const fetchCommodityPrice = (get: Getter, commodity: string): Promise<Evidence<PriceResp>> =>
  grab("commodity-price", () => get<PriceResp>(`/mining/commodities/${commodity}/price?start_year=2024&end_year=2026`, seedCommodityPrice(commodity)));

export interface SalesResp { year?: number; data: Record<string, { percentage_of_sales_volume?: number | null; percentage_of_total_revenue?: number | null; volume?: number | null; revenue_usd?: number | null }> }
export const fetchSalesDestination = (get: Getter, mslug: string): Promise<Evidence<SalesResp>> =>
  grab("sales-destination", () => get<SalesResp>(`/mining/sales-destination/${mslug}`, seedSalesDestination()));

export interface PerfResp { year?: number; data: { year: number; strip_ratio?: number | null; production_volume?: number | null; sales_volume?: number | null }[] }
export const fetchMiningPerformance = (get: Getter, mslug: string): Promise<Evidence<PerfResp>> =>
  grab("mining-performance", () => get<PerfResp>(`/mining/companies/performance/${mslug}`, seedMiningPerformance()));

export interface ScreenerRow { symbol: string; company_name: string; query_values?: Record<string, number | null> }
export interface ScreenerResp { results: ScreenerRow[]; pagination?: { total_count?: number; has_next?: boolean } }
export const fetchScreener = (get: Getter, where: string, orderBy: string, limit = 5): Promise<Evidence<ScreenerResp>> =>
  grab("companies-screener", () => get<ScreenerResp>(
    `/companies/?where=${encodeURIComponent(where)}&order_by=${encodeURIComponent(orderBy)}&limit=${limit}&include_query_values=true`,
    seedScreener(where, orderBy, limit)));

// — helper slug (universe pair kebab-case; dipakai screener untuk memetakan kata sektor → slug) —
export interface SlugPairRow { sector?: string; subsector?: string; industry?: string; sub_industry?: string }
export const fetchSubsectors = (get: Getter): Promise<Evidence<SlugPairRow[]>> =>
  grab("subsectors", () => get<SlugPairRow[]>(`/subsectors/`, seedSubsectors()));
export const fetchIndustries = (get: Getter): Promise<Evidence<SlugPairRow[]>> =>
  grab("industries", () => get<SlugPairRow[]>(`/industries/`, seedIndustries()));
export const fetchSubindustries = (get: Getter): Promise<Evidence<SlugPairRow[]>> =>
  grab("subindustries", () => get<SlugPairRow[]>(`/subindustries/`, seedSubindustries()));

// — fundamental —
export interface QuarterlyItem {
  symbol?: string; date: string;
  revenue?: number | null; earnings?: number | null; gross_profit?: number | null; ebitda?: number | null;
  total_assets?: number | null; total_liabilities?: number | null; total_equity?: number | null; total_debt?: number | null;
  operating_cash_flow?: number | null; free_cash_flow?: number | null; [k: string]: unknown;
}
export const fetchQuarterly = (get: Getter, sym: string, n = 4): Promise<Evidence<QuarterlyItem[]>> =>
  grab("financials-quarterly", () => get<QuarterlyItem[]>(`/financials/quarterly/${sym}?n_quarters=${n}`, seedQuarterly(sym, n)));

export interface SegmentResp { symbol?: string; financial_year?: number; revenue_breakdown: { value: number; source: string; target: string }[] }
export const fetchSegments = (get: Getter, sym: string, year?: number): Promise<Evidence<SegmentResp>> =>
  grab("company-segments", () => get<SegmentResp>(
    `/company/get-segments/${sym}${year ? `?financial_year=${year}` : ""}`, seedSegments(sym)));

export function evidenceSeed(...items: Evidence<unknown>[]): boolean {
  return items.some((e) => e.seed);
}
export function evidenceOk(...items: Evidence<unknown>[]): boolean {
  return items.every((e) => e.ok);
}