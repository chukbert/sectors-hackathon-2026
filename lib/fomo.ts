// FOMO Meter 0–100 — skor + komponen yang bisa dibedah, bukan angka kosong (F1 PRD).
import type { FomoMeter } from "./types.ts";

export interface DailyRow { date: string; close: number; volume: number }
export interface FomoInput {
  daily: DailyRow[];                 // dari /daily/{symbol}/ (≥30 baris ideal)
  asing_sell_streak?: number;        // dari foreign-flow / flow index
  news_no_filing?: boolean;          // katalis viral tanpa filing (F4)
  fundamental_weak?: boolean;        // revenue/earnings memburuk vs harga naik
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function fomoMeter(i: FomoInput): FomoMeter {
  const c = i.daily.map((d) => d.close), v = i.daily.map((d) => d.volume);
  const n = c.length;
  const ret7 = n > 7 ? (c[n - 1] / c[n - 8] - 1) * 100 : 0;
  const ret30 = n > 30 ? (c[n - 1] / c[n - 31] - 1) * 100 : ret7;
  const volz = n >= 30 ? (v[n - 1] - mean(v.slice(0, -1))) / (std(v.slice(0, -1)) || 1) : 0;
  const sma20 = mean(c.slice(Math.max(0, n - 20)));
  const devSMA = ((c[n - 1] - sma20) / sma20) * 100;
  const volMult = n >= 30 ? v[n - 1] / mean(v.slice(0, -1)) : 1;

  // bobot: 7d return 25 · z-vol 20 · deviasi SMA 15 · berita-vs-filing 20 · streak asing 20
  const parts: Record<string, number> = {
    ret: clamp01(ret7 / 25) * 25,
    vol: clamp01((volz - 1) / 3) * 20,
    sma: clamp01(devSMA / 15) * 15,
    kat: i.news_no_filing ? 20 : 0,
    asing: clamp01((i.asing_sell_streak ?? 0) / 9) * 20,
  };
  const score = Math.round(Math.min(100, Object.values(parts).reduce((s, x) => s + x, 0) + (i.fundamental_weak && ret7 > 10 ? 5 : 0)));
  const label = score >= 80 ? "sangat panas" : score >= 65 ? "panas" : score >= 40 ? "mendekati panas" : "dingin";

  const comps: FomoMeter["components"] = [
    { label: "7d return", value: `${ret7 >= 0 ? "+" : ""}${Math.round(ret7)}%`, bad: ret7 > 15 },
    { label: "z-score vol", value: volz.toFixed(1), bad: volz > 2 },
    { label: "deviasi SMA20", value: `${devSMA >= 0 ? "+" : ""}${Math.round(devSMA)}%`, bad: devSMA > 10 },
    { label: "berita ∉ filing", value: i.news_no_filing ? "ya" : "tidak", bad: !!i.news_no_filing },
    { label: `asing −${i.asing_sell_streak ?? 0} hari`, value: `${i.asing_sell_streak ?? 0}h net-jual`, bad: (i.asing_sell_streak ?? 0) >= 5 },
  ];
  // raw ikut dibagikan ke verifier pool — angka turunan KODE juga boleh dikutip kartu
  const raw = { ret7: Math.round(ret7), ret30: Math.round(ret30), volz: Math.round(volz * 10) / 10, dev_sma20: Math.round(devSMA), vol_mult: Math.round((n >= 30 ? v[n - 1] / mean(v.slice(0, -1)) : 1) * 10) / 10 };
  return { score, label, components: comps.slice(0, 5), raw };
}
