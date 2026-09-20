import { LEVEL_CAPS_KR, config } from "@/lib/config";
import type { Plan, PlanStep, Slots } from "@/lib/agent/types";
import type { Domain } from "@/lib/config";
import { ENDPOINT_BY_ID, estimateCost } from "@/lib/sectors/registry";

export type Capability = {
  name: string;
  domain: Domain;
  desc: string;
  costHint: string;
  endpointIds: string[];
};

export const CAPABILITIES: Capability[] = [
  { name: "harga", domain: "harga", desc: "harga harian, volume, market cap, tren harga", costHint: "1 kr/simbol", endpointIds: ["daily", "most-traded", "company-universe"] },
  { name: "fundamental", domain: "fundamental", desc: "laporan keuangan, section laporan, segmen", costHint: "1 kr/section, 1 kr/kuartal", endpointIds: ["report", "quarterly", "segments", "segments-list"] },
  { name: "valuasi", domain: "valuasi", desc: "PE/PB/PS, peers, proyeksi, intrinsic value", costHint: "1 kr/section", endpointIds: ["report", "quarterly"] },
  { name: "dividen", domain: "dividen", desc: "riwayat & jadwal dividen, aksi korporasi", costHint: "1 kr", endpointIds: ["corporate-actions", "corporate-actions-symbol"] },
  { name: "bandarmologi", domain: "bandarmologi", desc: "top buyer/seller, aktivitas broker, registry broker", costHint: "1–2 kr", endpointIds: ["broker-summary", "broker-summary-top", "broker-activity", "broker-activity-top", "brokers", "brokers-top"] },
  { name: "asing", domain: "asing", desc: "net foreign flow per emiten atau IHSG", costHint: "1 kr", endpointIds: ["foreign-flow", "foreign-flow-universe"] },
  { name: "screening", domain: "screening", desc: "screener terstruktur/natural language, top movers", costHint: "1 kr (where) / 3 kr (q)", endpointIds: ["screener", "top-changes", "free-float"] },
  { name: "komoditas", domain: "komoditas", desc: "harga komoditas, produksi, izin tambang, ekspor", costHint: "1 kr", endpointIds: ["mining-commodities", "mining-price", "mining-total-production", "mining-licenses", "mining-company-performance", "mining-sales-destination", "mining-exports", "mining-global", "mining-sites", "mining-resources", "mining-auctions"] },
  { name: "ipo", domain: "ipo", desc: "performa sejak listing, kalender IPO", costHint: "1 kr", endpointIds: ["listing-performance"] },
  { name: "kalender", domain: "kalender", desc: "aksi korporasi, RUPS, tanggal laporan, suspensi", costHint: "1 kr/tipe", endpointIds: ["corporate-actions", "financial-dates", "quarterly-dates-universe", "suspensions"] },
  { name: "sektor", domain: "sektor", desc: "level indeks, kapitalisasi pasar IDX, laporan subsektor", costHint: "1 kr", endpointIds: ["index-daily", "index-universe", "idx-total", "subsector-report", "subsectors", "industries", "subindustries"] },
  { name: "klaim", domain: "klaim", desc: "berita, filings insider, suspensi untuk verifikasi klaim", costHint: "1 kr", endpointIds: ["news", "filings", "suspensions"] },
  { name: "tag", domain: "tag", desc: "daftar tag & klasifikasi", costHint: "1 kr", endpointIds: ["tags", "report"] },
];

export function deterministicCapabilities(): Capability[] {
  return CAPABILITIES;
}

export function expandCapability(name: string, slots: Slots): PlanStep[] {
  const cap = CAPABILITIES.find((c) => c.name === name);
  if (!cap) return [];
  const sym = slots.symbols[0];
  const now = new Date();
  const y = now.getUTCFullYear();
  const start30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const out: PlanStep[] = [];
  const push = (endpoint: string, args: Record<string, unknown>, purpose: string, phase: 1 | 2 | 3 = 1, optional = false) => {
    const def = ENDPOINT_BY_ID.get(endpoint);
    out.push({
      id: `${endpoint}:${JSON.stringify(args)}`,
      endpoint,
      args,
      purpose,
      estCostKr: def ? estimateCost(def, args) : 1,
      phase,
      optional,
    });
  };
  switch (name) {
    case "harga":
      if (sym) push("daily", { symbol: sym, start: start30, end }, `Harga ${sym}`);
      else push("most-traded", { start: start30, end, n_stock: 5 }, "Saham paling ramai");
      break;
    case "fundamental":
      if (sym) push("report", { symbol: sym, sections: ["overview", "financials"] }, `Fundamental ${sym}`);
      break;
    case "valuasi":
      if (sym) push("report", { symbol: sym, sections: ["valuation"] }, `Valuasi ${sym}`);
      break;
    case "dividen":
      if (sym) push("corporate-actions-symbol", { symbol: sym }, `Dividen ${sym}`);
      else push("corporate-actions", { start: start30, end, type: ["dividend"] }, "Agenda dividen");
      break;
    case "bandarmologi":
      if (sym) push("broker-summary-top", { symbol: sym, start: start30, end }, `Bandarmologi ${sym}`);
      break;
    case "asing":
      push("foreign-flow", { symbol: sym ?? "IHSG", start: start30, end }, "Aliran asing");
      break;
    case "screening":
      push("screener", { where: "pe_ttm > 0 and pe_ttm < 15", order_by: "market_cap", desc: true, limit: 10, include_query_values: true }, "Screening valuasi murah");
      break;
    case "komoditas":
      push("mining-commodities", {}, "Daftar komoditas");
      if (slots.commodity) push("mining-price", { commodity_name: slots.commodity, start_year: y - 2, end_year: y }, `Harga ${slots.commodity}`);
      break;
    case "ipo":
      if (sym) push("listing-performance", { symbol: sym }, `Performa IPO ${sym}`);
      else push("quarterly-dates-universe", { limit: 20 }, "Kalender laporan kuartalan terbaru");
      break;
    case "kalender":
      push("corporate-actions", { start: start30, end, type: ["dividend"] }, "Agenda korporasi terdekat");
      break;
    case "sektor":
      push("index-daily", { index_code: slots.indexCode ?? "ihsg", start: start30, end }, "Level indeks");
      break;
    case "klaim":
      if (sym) push("news", { symbols: sym, start: start30, end, limit: 8 }, `Berita ${sym}`);
      push("filings", { symbol: sym, start: start30, end, limit: 10 }, "Filings insider");
      break;
    case "tag":
      push("tags", {}, "Daftar tag");
      break;
  }
  return out;
}

export type GovernedPlan = {
  executable: PlanStep[];
  skipped: Array<{ step: PlanStep; reason: string }>;
  estCostKr: number;
  capKr: number;
  allowLive: boolean;
  spendTodayKr: number;
};

export function govern(plan: Plan, opts: { level: number; allowLive: boolean; spendTodayKr: number }): GovernedPlan {
  const capKr = LEVEL_CAPS_KR[Math.min(10, Math.max(1, opts.level))] ?? 8;
  const dailyLeft = Math.max(0, config.run.dailyBudgetKr - opts.spendTodayKr);
  let budget = Math.min(capKr, dailyLeft);
  const executable: PlanStep[] = [];
  const skipped: GovernedPlan["skipped"] = [];
  const ordered = [...plan.steps].sort((a, b) => a.phase - b.phase || Number(a.optional) - Number(b.optional));
  for (const s of ordered) {
    if (!opts.allowLive) {
      executable.push(s);
      continue;
    }
    if (s.estCostKr <= budget) {
      executable.push(s);
      budget -= s.estCostKr;
    } else {
      skipped.push({ step: s, reason: `melebihi cap level ${opts.level} (${capKr} kr)` });
    }
  }
  const estCostKr = executable.reduce((a, s) => a + s.estCostKr, 0);
  return { executable, skipped, estCostKr, capKr, allowLive: opts.allowLive, spendTodayKr: opts.spendTodayKr };
}