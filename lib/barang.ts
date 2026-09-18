// lib/barang.ts — F9 Rantai Barang: divergence harga-vs-volume, health, exposure. Pure code, LLM dilarang hitung.
// Nol konstanta karangan: field yang tidak diketahui TIDAK menghasilkan flag.
export interface BarangInput {
  commodityPct12m: number;
  volumePct: number;
  stripDelta?: number;
  costCoverage?: number;
  topCountryShare?: number;
  licenseMonthsLeft?: number;
  auctionFailed?: boolean;
  contractorChanged?: boolean;
}

export interface BarangResult {
  divergence: number;
  verdict: "didukung" | "campuran" | "tak-didukung";
  probability: number;
  flags: string[];
  sankey: { nodes: string[]; edges: { from: string; to: string; label: string }[] };
}

export function computeBarang(i: BarangInput): BarangResult {
  const flags: string[] = [];
  let div = 0;
  if (i.commodityPct12m > 5 && i.volumePct < -10) {
    div += 0.5;
    flags.push(`Divergence: komoditas +${i.commodityPct12m}% tapi volume ${i.volumePct}%`);
  }
  if ((i.stripDelta ?? 0) > 0.5) {
    div += 0.2;
    flags.push(`Strip ratio memburuk +${i.stripDelta}`);
  }
  if (i.topCountryShare !== undefined && i.topCountryShare > 0.6) {
    div += 0.15;
    flags.push(`Exposure 1-negara ${Math.round(i.topCountryShare * 100)}% > 60%`);
  }
  if (i.costCoverage !== undefined && i.costCoverage < 1.2) {
    div += 0.15;
    flags.push(`Harga mepet cost (coverage ${i.costCoverage})`);
  }
  if (i.licenseMonthsLeft !== undefined && i.licenseMonthsLeft < 12) flags.push(`Izin habis ${i.licenseMonthsLeft}bln ⚑`);
  if (i.auctionFailed) flags.push("Lelang gagal ");
  if (i.contractorChanged) flags.push("Kontraktor ganti ");
  div = Math.min(1, div);

  const verdict = div >= 0.5 ? "tak-didukung" : div >= 0.25 ? "campuran" : "didukung";
  const probability = verdict === "didukung" ? 0.7 : verdict === "campuran" ? 0.58 : 0.74;
  const buyerLabel = i.topCountryShare !== undefined ? `top ${Math.round(i.topCountryShare * 100)}%` : "n/a";
  return {
    divergence: div,
    verdict,
    probability,
    flags,
    sankey: {
      nodes: ["commodity", "emiten", "kontraktor", "buyer"],
      edges: [
        { from: "commodity", to: "emiten", label: `${i.commodityPct12m}% / vol ${i.volumePct}%` },
        { from: "emiten", to: "kontraktor", label: i.contractorChanged ? "ganti" : "tetap" },
        { from: "emiten", to: "buyer", label: buyerLabel },
      ],
    },
  };
}

interface PriceRow { date: string; price_usd_per_ton?: number; price?: number }
interface DailyRow { date: string; volume?: number }

export function pctFromPriceSeries(series: PriceRow[]): number {
  const pts = series
    .map((r) => ({ date: r.date, px: r.price_usd_per_ton ?? r.price ?? NaN }))
    .filter((r) => r.date && Number.isFinite(r.px))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length < 2) throw new Error("price series terlalu pendek");
  const last12 = pts.slice(-12);
  const first = last12[0]!.px;
  const last = last12[last12.length - 1]!.px;
  if (!(first > 0)) throw new Error("price series invalid");
  return Math.round(((last - first) / first) * 1000) / 10;
}

export function pctFromDailyVolume(rows: DailyRow[]): number {
  const vols = rows
    .filter((r) => r.date && typeof r.volume === "number")
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => r.volume as number);
  if (vols.length < 30) throw new Error("daily terlalu pendek untuk volumePct");
  const recent = vols.slice(-20);
  const prior = vols.slice(-60, -20);
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const p = avg(prior);
  if (!(p > 0)) throw new Error("volume prior nol");
  return Math.round(((avg(recent) - p) / p) * 1000) / 10;
}