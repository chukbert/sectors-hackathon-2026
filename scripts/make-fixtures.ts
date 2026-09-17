// Pembuat SEED fixtures (eval/fixtures/) — SYNTHETIC, skenario demo "BRMS gorengan + ilusi diversifikasi".
// Nama file = kunci cache (tool__param…) sehingga lookup seed tahan rotasi tanggal. BUKAN data pasar nyata.
// Jalankan: node --experimental-strip-types scripts/make-fixtures.ts
import { rmSync, mkdirSync } from "node:fs";
process.env.SECTORS_API_KEY = "seed-generator"; // fetch di-stub total di bawah; tidak ada request nyata
delete process.env.ARUS_SEED;
const FIX = "eval/fixtures";
rmSync(FIX, { recursive: true, force: true }); mkdirSync(FIX, { recursive: true });
process.env.ARUS_CACHE = FIX;

const D = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10) };
const M = 1e6;
const RETAIL = ["DG", "PD", "YU"]; const INSTI = ["MG", "ZP"];

// harga: datar lalu +21% dalam 7 hari, volume spike di ujung
const series = (start: number, pump: boolean) => {
  const out: Record<string, unknown>[] = []; let p = start;
  for (let i = 90; i >= 0; i--) {
    if (pump && i < 7) p = Math.round(p * (1 + 0.028)); else p = Math.round(p * (1 + (i % 7 === 0 ? 0.004 : i % 5 === 0 ? -0.004 : 0)));
    out.push({ date: D(i), close: p, volume: pump && i < 7 ? 9_000_000 + (6 - i) * 2_500_000 : 3_000_000 });
  }
  return { data: out };
};

const routes: [RegExp, (m: RegExpMatchArray) => unknown][] = [
  [/\/brokers\//, () => [
    ...RETAIL.map((c) => ({ code: c, name: "Sekuritas Ritel " + c, is_foreign: false, cohort: "retail", license_type: "Pajak" })),
    ...INSTI.map((c) => ({ code: c, name: "Nomor " + c, is_foreign: true, cohort: "institutional", license_type: "UM" })),
    { code: "MX", name: "Campur", is_foreign: false, cohort: "mixed", license_type: "UM" },
  ]],
  [/\/daily\/BRMS/, () => series(220, true)],
  // morning demo: empat "gorengan" sintetis (NSTI/ARUM naik+volledak, KLCN naik tipis, GMRB jatuh)
  [/\/daily\/NSTI/, () => series(140, true)],
  [/\/daily\/ARUM/, () => series(800, true)],
  [/\/daily\/KLCN/, () => series(1150, true)],
  [/\/daily\/GMRB/, () => ({ data: [...Array(45)].map((_, k) => ({ date: D(45 - k), close: 320 - (k > 38 ? (k - 38) * 28 : 0), volume: k > 38 ? 7e6 : 2e6 })) })],
  [/\/daily\/([A-Z]{4})/, (m) => series(1000 + (m as RegExpMatchArray)[1].charCodeAt(0), false)],
  [/\/top-changes/, () => ({ "1d": { top_gainers: { results: [
    { symbol: "NSTI", name: "Nusantara Seed Satu", price_change: 14.2, last_close_price: 198 },
    { symbol: "ARUM", name: "Arum Seed", price_change: 9.4, last_close_price: 890 },
    { symbol: "BRMS", name: "Bumi Resources Minerals (SEED)", price_change: 21, last_close_price: 263 },
    { symbol: "KLCN", name: "Kala Cisadane", price_change: 5.1, last_close_price: 1265 }] },
    top_losers: { results: [{ symbol: "GMRB", name: "Gemilang Seed", price_change: -8.2, last_close_price: 132 }] } } })],
  [/\/most-traded/, () => ({ data: [{ date: D(1), stocks: [
    { symbol: "NSTI" }, { symbol: "ARUM" }, { symbol: "BRMS" }, { symbol: "TLKM" }, { symbol: "BBCA" }] }] })],
  [/\/broker-summary\/BRMS/, () => ({ symbol: "BRMS.JK", start: D(7), end: D(0),
    data: [...Array(7)].map((_, k) => ({ date: D(7 - k), summary: [
      { broker_code: "DG", bval: 9.1 * M * 7, sval: 3.1 * M * 7, nval: 6 * M },
      { broker_code: "PD", bval: 5.0 * M * 7, sval: 2.0 * M * 7, nval: 3 * M },
      { broker_code: "MG", bval: 2.2 * M * 7, sval: 7.1 * M * 7, nval: -4.9 * M },
      { broker_code: "ZP", bval: 1.1 * M * 7, sval: 5.9 * M * 7, nval: -4.8 * M },
      { broker_code: "MX", bval: 2.0 * M * 7, sval: 1.4 * M * 7, nval: 0.6 * M }] })) })],
  [/\/foreign-flow\/BRMS/, () => ({ data: [...Array(90)].map((_, k) => ({ date: D(90 - k), net_foreign_inflow: k < 81 ? 2 * M : -9 * M })) })],
  [/\/filings\??.*symbol=BRMS/, () => ({ results: [], pagination: { total_count: 0, has_next: false } })],
  [/\/filings/, () => ({ results: [], pagination: { total_count: 0, has_next: false } })],
  [/\/news\??.*symbols=BRMS/, () => ({ results: [
    { title: "Blok nikel baru BRMS disebut mulai produksi — viral di X", source: "mock-news", timestamp: D(2) + "T08:00:00Z", symbols: ["BRMS"], tags: ["commodities"] },
    { title: "BRMS melonjak, warganet ramai: \"besaran\"", source: "mock-news", timestamp: D(1) + "T04:00:00Z", symbols: ["BRMS"], tags: ["market"] },
  ], pagination: { total_count: 2, has_next: false } })],
  [/\/news/, () => ({ results: [], pagination: { total_count: 0, has_next: false } })],
  [/\/suspensions\??.*symbol=BRMS/, () => ({ results: [{ symbol: "BRMS", suspension_date: "2023-04-18", reason: "Suspended (mock)" }, { symbol: "BRMS", suspension_date: "2024-11-02", reason: "Suspended (mock)" }], pagination: { total_count: 2, has_next: false } })],
  [/\/suspensions/, () => ({ results: [], pagination: { total_count: 0, has_next: false } })],
  [/\/company\/report\/BRMS/, () => ({
    overview: { company_name: "PT Bumi Resources Minerals Tbk (SEED)", sector: "Energy", sub_sector: "coal", last_close_price: 268 },
    valuation: { historical_valuation: [{ year: 2025, pb: 3.1, pb_peer_avg: 1.8 }, { year: 2026, pb: 4.2, pb_peer_avg: 1.8, pe: null }] },
    ownership: { major_shareholders: [{ name: "PT Bumi Resources Tbk", share_percentage: 30.1 }], conglomerates_group: "Bumi (seed-list)" } })],
  [/\/company\/report\/(INDF|ICBP|BBCA|TLKM|SMGR|BUMI)/, (m) => {
    const t = (m as RegExpMatchArray)[1];
    const grp = t === "BUMI" ? { group: "Bumi (seed-list)", holders: [{ name: "Bakrie & Brothers Holdings (seed)", share_percentage: 41 }] }
      : t === "ICBP" ? { holders: [{ name: "PT Indofood Sukses Makmur Tbk", share_percentage: 40 }] }
      : t === "INDF" ? { holders: [{ name: "PT Indofood Sukses Makmur Tbk", share_percentage: 31 }] }
      : { holders: [{ name: "Public Seed " + t, share_percentage: 55 }] };
    return { overview: { company_name: t + " (SEED synthetis)" }, ownership: { major_shareholders: grp.holders, conglomerates_group: grp.group } };
  }],
  [/\/company\/shareholders-composition\//, () => ({ symbol: "X", year: 2026, data: [{ date: D(20), individual_l: 4_000_000_000, individual_f: 900_000_000, corporate_l: 6_000_000_000, total_l: 11e9, total_f: 1e9, numbers_of_shareholders: 250000, change_in_shareholders: 40000 }] })],
];

globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  for (const [re, make] of routes) { const m = u.match(re); if (m) return new Response(JSON.stringify(make(m))); }
  return new Response(JSON.stringify({ results: [], data: [], pagination: { total_count: 0, has_next: false } }), { status: 200 });
}) as typeof fetch;

const { sectorsGet, lastTradingDay, isoDaysAgo } = await import("../lib/sectors.ts");
const end = lastTradingDay();
const calls: [string, Record<string, string | number>][] = [
  ["broker_registry", {}],
  ["top_changes", { classifications: "top_gainers,top_losers", periods: "1d", n_stock: "20" }],
  ["most_traded", { start: isoDaysAgo(2), end, n_stock: "25" }],
  ...["NSTI", "ARUM", "KLCN", "GMRB"].map((t) => ["daily", { symbol: t, start: isoDaysAgo(45), end }] as [string, Record<string, string>]),
  ["daily", { symbol: "BRMS", start: isoDaysAgo(90), end }],
  ["broker_summary", { symbol: "BRMS", start: isoDaysAgo(7), end }],
  ["foreign_flow", { symbol: "BRMS", start: isoDaysAgo(90), end }],
  ["filings", { symbol: "BRMS", start: isoDaysAgo(7), end }],
  ["news", { symbols: "BRMS", start: isoDaysAgo(14), end }],
  ["suspensions", { symbol: "BRMS" }],
  ["company_report", { symbol: "BRMS", sections: "overview" }],
  ["company_report", { symbol: "BRMS", sections: "valuation,overview" }],
  ["company_report", { symbol: "BRMS", sections: "ownership" }],
  ...["INDF", "ICBP", "BBCA", "TLKM", "SMGR", "BUMI"].map((t) => ["company_report", { symbol: t, sections: "ownership" }] as [string, Record<string, string>]),
];
for (const [tool, params] of calls) await sectorsGet(tool as never, params, { live: true });
console.log("fixtures →", FIX);
