// Morning Arus (F5) — eksekusi otonom. Cron 08:30 WIB jalan sendiri; intent chat "pagi" membaca brief terakhir.
// Anomali = z-score volume & lompatan harga dari data FULL-UNIVERSE Sectors (close × top-changes × most-traded).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sectorsGet, isoDaysAgo, lastTradingDay, startQuery, queryCredits } from "./sectors.ts";

const OUT_DIR = process.env.ARUS_CACHE || ".cache";
export interface BriefEntry { ticker: string; delta: number; one: string; sev: "kritis" | "waspada" | "bersih"; body: string; counter: string }
export interface Brief { date: string; jam: string; scanned: number; entries: BriefEntry[] }

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const std = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2)) || 1) };

async function scoreTicker(t: string, end: string): Promise<{ delta: number; volz: number } | null> {
  const j = await sectorsGet("daily", { symbol: t, start: isoDaysAgo(45), end }) as { data?: { close: number; volume: number }[] } | { close: number; volume: number }[];
  const rows = (Array.isArray(j) ? j : j.data ?? []).filter((r) => typeof r.close === "number");
  if (rows.length < 10) return null;
  const rets = rows.slice(1).map((r, i) => r.close / rows[i].close - 1);
  const vols = rows.map((r) => r.volume ?? 0);
  const delta = (rows[rows.length - 1].close / rows[rows.length - 2].close - 1) * 100;
  const volz = (vols[vols.length - 1] - mean(vols.slice(0, -1))) / std(vols.slice(0, -1));
  return { delta, volz };
}

export async function scanAnomalies(limit = 10): Promise<Brief> {
  startQuery(Number(process.env.ARUS_MORNING_BUDGET || 30)); // §5: cron tidak boleh membobol pool
  const end = lastTradingDay();
  const [movers, traded] = await Promise.all([
    sectorsGet("top_changes", { classifications: "top_gainers,top_losers", periods: "1d", n_stock: "20" }),
    sectorsGet("most_traded", { start: isoDaysAgo(2), end, n_stock: "25" }).catch(() => null),
  ]);
  const cand = new Set<string>();
  const g = movers as Record<string, { results?: { symbol: string }[] } | { symbol: string }[]>;
  // top-changes di-key per classification×period → kumpulkan semua symbol yang muncul
  JSON.stringify(movers).match(/"symbol":"([A-Z]{4})"/g)?.forEach((s) => cand.add(s.slice(10, -1)));
  JSON.stringify(traded ?? "").match(/"symbol":"([A-Z]{4})/g)?.forEach((s) => cand.add(s.slice(10)));

  const scored = (await Promise.all([...cand].slice(0, 10).map(async (t) => {
    const sc = await scoreTicker(t, end).catch(() => null);
    return sc ? { t, ...sc } : null;
  }))).filter(Boolean) as { t: string; delta: number; volz: number }[];

  const anom = scored
    .filter((s) => s.volz > 2 || Math.abs(s.delta) > 9)
    .sort((a, b) => (b.volz + Math.abs(b.delta) / 10) - (a.volz + Math.abs(a.delta) / 10))
    .slice(0, limit);

  const entries: BriefEntry[] = [];
  for (const s of anom) {
    const [news, susp, ff] = await Promise.all([
      sectorsGet("news", { symbols: s.t, start: isoDaysAgo(7), end }).catch(() => ({ results: [] })),
      sectorsGet("suspensions", { symbol: s.t }).catch(() => ({ results: [] })),
      sectorsGet("foreign_flow", { symbol: s.t, start: isoDaysAgo(7), end }).catch(() => null),
    ]);
    const nArt = ((news as { results?: unknown[] }).results ?? []).length;
    const nSusp = ((susp as { results?: unknown[] }).results ?? []).length;
    const frows = ff ? (((ff as { data?: { net_foreign_inflow: number }[] }).data) ?? []) : [];
    const asingNetM = Math.round(frows.reduce((x, r) => x + r.net_foreign_inflow, 0) / 1e6);
    const sev: BriefEntry["sev"] = (Math.abs(s.delta) > 13 && s.volz > 3) || (s.delta > 0 && nArt === 0) ? "kritis"
      : Math.abs(s.delta) > 12 || s.volz > 2.5 ? "waspada" : "bersih";
    entries.push({
      ticker: s.t, delta: Math.round(s.delta),
      one: `vol ${s.volz.toFixed(1)}× rata-rata · ${nArt} berita 7d · asing ${asingNetM >= 0 ? "+" : ""}${asingNetM} M${nSusp ? ` · ${nSusp}× suspend` : ""}`,
      sev,
      body: `z-score volume ${s.volz.toFixed(1)} (ambang 2.0) · return 1d ${s.delta >= 0 ? "+" : ""}${Math.round(s.delta)}% · ${nArt} berita vs ${nSusp} riwayat suspend (pilar cepat, data cache)`,
      counter: nArt === 0 && s.delta > 5 ? "“kalau ini beneran, kenapa nol filing/berita? biasanya yang beli pertama justru kohort ritel.”"
        : s.delta < 0 ? "“diskon setelah gorengan tetap gorengan — jangan panggil value.”"
        : "“beritanya ada — tapi cek tanggalnya: kamu yang tahu atau yang ke-3000?”",
    });
  }
  return { date: end, jam: "08:30", scanned: cand.size, entries };
}

export function briefPath(date: string) { return path.join(OUT_DIR, `morning-${date}.json`) }
export async function morningBrief(opts: { live?: boolean } = {}): Promise<Brief> {
  const p = briefPath(lastTradingDay());
  if (!opts.live && existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  const b = await scanAnomalies();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(p, JSON.stringify(b));
  return b;
}
