// Kohort Flow Index — derived asset #1. Tidak ada endpoint Sectors yang mengatakannya;
// ini JOIN broker-summary × broker-registry yang dihitung di kode kita.
import { sectorsGet, isoDaysAgo, lastTradingDay } from "./sectors.ts";
import type { FlowIndex, FlowDay } from "./types.ts";

interface SummaryRow { broker_code: string; nval: number; bval: number; sval: number }
interface SummaryDay { date: string; summary: SummaryRow[] }
interface RegistryRow { code: string; name: string; is_foreign: boolean; cohort: string }

const M = 1e6; // Rp → juta
const r1 = (x: number) => Math.round(x * 10) / 10;
const toM = (x: number) => r1(x / M);

export async function kohortFlowIndex(ticker: string, days = 7, preDaily?: { close: number }[]): Promise<FlowIndex> {
  const end = lastTradingDay();
  const start = isoDaysAgo(days);
  const [regRaw, sumRaw, fflowRaw, filRaw, dRaw] = await Promise.all([
    sectorsGet("broker_registry", {}),
    sectorsGet("broker_summary", { symbol: ticker, start, end }),
    sectorsGet("foreign_flow", { symbol: ticker, start: isoDaysAgo(90), end }),
    sectorsGet("filings", { symbol: ticker, start: isoDaysAgo(14), end }).catch(() => ({ results: [] })), // window kanonik = punya katalis → 1 kredit utk dua agen
    preDaily ? Promise.resolve({ data: preDaily }) : sectorsGet("daily", { symbol: ticker, start, end }), // reuse milik mover
  ]);
  const reg = new Map((regRaw as RegistryRow[]).map((b) => [b.code, b]));
  const data = (sumRaw as { data: SummaryDay[] }).data ?? [];

  const byDate: FlowDay[] = [];
  const agg = new Map<string, number>(); // broker → net window
  for (const day of data) {
    let retail = 0, institusi = 0;
    for (const row of day.summary) {
      const b = reg.get(row.broker_code);
      agg.set(row.broker_code, (agg.get(row.broker_code) ?? 0) + row.nval);
      const cohort = b?.cohort ?? "unknown";
      if (cohort === "retail") retail += row.nval;
      else if (cohort === "institutional" || b?.is_foreign) institusi += row.nval; // mixed tidak masuk keduanya → limitasi jujur
    }
    byDate.push({ d: day.date.slice(5), retail: toM(retail), institusi: toM(institusi) });
  }
  const retail_net_m = r1(byDate.reduce((s, x) => s + x.retail, 0));
  const institusi_net_m = r1(byDate.reduce((s, x) => s + x.institusi, 0));

  // streak asing dari foreign-flow (90d):卖出 beruntun sampai hari terakhir
  const ff = (((fflowRaw as { data?: { date: string; net_foreign_inflow: number }[] }).data) ?? []) as { date: string; net_foreign_inflow: number }[];
  const asing_net_m = toM(ff.reduce((s, x) => s + x.net_foreign_inflow, 0));
  let asing_sell_streak = 0;
  for (let i = ff.length - 1; i >= 0 && ff[i].net_foreign_inflow < 0; i--) asing_sell_streak++;
  let retail_streak = 0;
  for (let i = byDate.length - 1; i >= 0 && byDate[i].retail > 0; i--) retail_streak++;

  // harga naik selama window?
  const daily = (((dRaw as { data?: { close: number }[] }).data) ?? []) as { close: number }[];
  const price_up = daily.length > 1 && daily[daily.length - 1].close > daily[0].close;
  const distribusi_ritel = price_up && retail_net_m > 0 && institusi_net_m < 0;

  // ⚑ insider: direksi/komisaris jual dalam window
  const insider_sold = (((filRaw as { results?: { transaction_type: string }[] }).results) ?? [])
    .some((f) => (f.transaction_type ?? "").toLowerCase().includes("sell"));

  const rank = [...agg.entries()]
    .map(([code, net]) => ({ code, name: reg.get(code)?.name ?? code, net_m: toM(net) }))
    .sort((a, b) => b.net_m - a.net_m);

  return { ticker, window: `${start}..${end}`, retail_net_m, institusi_net_m, asing_net_m,
    days: byDate, retail_streak, asing_sell_streak, distribusi_ritel, insider_sold,
    top_buyers: rank.slice(0, 5), top_sellers: rank.slice(-5).reverse() };
}

// kalimat siap-pakai untuk kartu (angka selalu dari objek terhitung, bukan karangan LLM)
export function flowSentences(f: FlowIndex): string[] {
  const out: string[] = [];
  const Mx = (x: number) => Math.abs(x) >= 1000 ? `Rp ${Math.round(x / 100) / 10} T` : `Rp ${Math.abs(x)} M`;
  out.push(`broker kohort ritel net-${f.retail_net_m >= 0 ? "buy" : "sell"} ${Mx(f.retail_net_m)} / asing+institusional net-${f.institusi_net_m >= 0 ? "buy" : "sell"} ${Mx(Math.abs(f.institusi_net_m))} selama 7 hari`);
  if (f.asing_sell_streak >= 3) out.push(`asing net-jual ${f.asing_sell_streak} hari beruntun (90d: ${f.asing_net_m >= 0 ? "+" : "−"}${Mx(f.asing_net_m)})`);
  if (f.distribusi_ritel) out.push(`⚑ harga naik + uang besar keluar + ritel masuk = pola distribusi ke kohort ritel`);
  if (f.insider_sold) out.push(`⚑ ada filing insider menjual dalam window ini`);
  return out;
}
