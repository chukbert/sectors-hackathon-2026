import { ENDPOINT_BY_ID, estimateCost } from "@/lib/sectors/registry";
import { chatJson } from "@/lib/llm/openrouter";
import { window } from "@/lib/util/time";
import type { Domain } from "@/lib/config";
import type { Plan, PlanStep, Slots } from "@/lib/agent/types";
import { deterministicCapabilities, expandCapability } from "@/lib/agent/tools";

function step(endpoint: string, args: Record<string, unknown>, purpose: string, phase: 1 | 2 | 3, optional = false): PlanStep {
  const def = ENDPOINT_BY_ID.get(endpoint);
  if (!def) throw new Error(`unknown endpoint in plan: ${endpoint}`);
  return { id: `${endpoint}:${JSON.stringify(args)}`, endpoint, args, purpose, estCostKr: estimateCost(def, args), phase, optional };
}

export function domainFor(level: number, slots: Slots): Domain {
  if (slots.commodity) return "komoditas";
  if (slots.isRumor) return "klaim";
  if (level >= 8) return "bandarmologi";
  if (level === 7) return "klaim";
  if (level >= 4) return "fundamental";
  if (slots.indexCode) return "sektor";
  if (slots.sectorText && slots.symbols.length === 0) return "screening";
  return "harga";
}

function levelPlan(level: number, slots: Slots, question: string): PlanStep[] {
  const wantsDeep = /fundamental|valuasi|kinerja|sehat|banding|vs\b|per\b|pbv|roe|margin|dividen|laba|revenue|tumbuh|tren|likuid|risiko/i.test(question);
  const sym = slots.symbols[0];
  const symbols = slots.symbols;
  const days = slots.periodDays ?? (level >= 4 ? 90 : 30);
  const daysStr = { start: window(days).start, end: window(days).end };
  const steps: PlanStep[] = [];

  if (slots.indexCode) {
    steps.push(step("index-daily", { index_code: slots.indexCode, ...daysStr }, `Level & pergerakan ${slots.indexCode.toUpperCase()}`, 1));
    if (level >= 4) steps.push(step("idx-total", { ...daysStr }, "Kapitalisasi pasar total IDX sebagai konteks", 1));
    steps.push(step("foreign-flow", { symbol: "IHSG", ...daysStr }, "Aliran dana asing di pasar", 2));
    if (level >= 5) steps.push(step("subsector-report", { sub_sector: "banks", sections: ["statistics"] }, "Konteks subsektor pembanding", 3, true));
    return steps;
  }

  if (!sym) {
    if (slots.commodity) {
      steps.push(step("mining-commodities", {}, "Daftar komoditas tersedia", 1));
      steps.push(step("mining-price", { commodity_name: slots.commodity, start_year: new Date().getUTCFullYear() - 2, end_year: new Date().getUTCFullYear() }, `Harga ${slots.commodity}`, 1));
      if (level >= 5) steps.push(step("mining-total-production", { commodity_type: slots.commodity === "coal" ? "Coal" : slots.commodity === "nickel" ? "Nickel" : slots.commodity === "gold" ? "Gold" : slots.commodity === "copper" ? "Copper" : "Coal" }, "Produksi nasional", 2, true));
      return steps;
    }
    steps.push(step("most-traded", { ...window(7), n_stock: 5 }, "Saham paling ramai sepekan", 1));
    steps.push(step("top-changes", { classifications: ["top_gainers"], periods: ["1d"], n_stock: 5 }, "Top gainers harian", 2));
    if (level >= 3) steps.push(step("corporate-actions", { ...window(14), type: ["dividend"] }, "Agenda dividen terdekat", 2, true));
    return steps;
  }

  switch (Math.min(10, Math.max(1, level))) {
    case 1:
      steps.push(step("daily", { symbol: sym, ...daysStr }, `Harga & volume ${sym}`, 1));
      break;
    case 2:
      steps.push(step("daily", { symbol: sym, ...daysStr }, `Harga ${sym}`, 1));
      steps.push(step("foreign-flow", { symbol: sym, ...daysStr }, `Aliran asing ${sym}`, 1));
      steps.push(step("news", { symbols: sym, ...window(14), limit: 5 }, `Berita terbaru ${sym}`, 2));
      break;
    case 3:
      steps.push(step("news", { symbols: sym, ...window(14), limit: 8 }, `Berita terbaru ${sym}`, 1));
      steps.push(step("corporate-actions-symbol", { symbol: sym }, `Aksi korporasi ${sym}`, 1));
      steps.push(step("suspensions", { symbol: sym }, `Riwayat suspensi ${sym}`, 1));
      steps.push(step("report", { symbol: sym, sections: ["overview"] }, `Profil & tag ${sym}`, 2));
      break;
    case 4:
      steps.push(step("daily", { symbol: sym, ...daysStr }, `Tren harga ${sym}`, 1));
      steps.push(step("quarterly", { symbol: sym, n_quarters: 4 }, `Tren kinerja kuartalan ${sym}`, 1));
      steps.push(step("idx-total", { ...daysStr }, "Konteks pasar IDX", 2));
      if (slots.commodity) steps.push(step("mining-price", { commodity_name: slots.commodity, start_year: new Date().getUTCFullYear() - 2, end_year: new Date().getUTCFullYear() }, `Harga komoditas ${slots.commodity}`, 2));
      break;
    case 5: {
      for (const s of symbols.slice(0, 4)) {
        steps.push(step("daily", { symbol: s, ...daysStr }, `Harga & market cap ${s}`, 1));
      }
      if (wantsDeep || symbols.length <= 2) {
        for (const s of symbols.slice(0, 4)) {
          steps.push(step("report", { symbol: s, sections: wantsDeep ? ["valuation", "financials"] : ["valuation"] }, `Valuasi ${s}`, 2));
        }
      }
      if (wantsDeep) {
        for (const s of symbols.slice(0, 4)) steps.push(step("quarterly", { symbol: s, n_quarters: 4 }, `Kinerja kuartalan ${s}`, 3, true));
      }
      break;
    }
    case 6:
      steps.push(step("report", { symbol: sym, sections: ["overview", "valuation", "financials", "dividend", "ownership"] }, `Fundamental menyeluruh ${sym}`, 1));
      steps.push(step("quarterly", { symbol: sym, n_quarters: 8 }, `Kinerja kuartalan ${sym}`, 2));
      steps.push(step("free-float", {}, "Free float & likuiditas", 2, true));
      steps.push(step("segments", { symbol: sym }, `Segmen pendapatan ${sym}`, 3, true));
      if (slots.commodity) steps.push(step("mining-company-performance", { slug: "pt-alamtri-resources-indonesia-tbk" }, "Produksi & cadangan tambang", 3, true));
      break;
    case 7:
      steps.push(step("news", { symbols: sym, ...window(30), limit: 8 }, `Berita pendukung/penyanggah klaim ${sym}`, 1));
      steps.push(step("filings", { symbol: sym, ...window(30), limit: 10 }, `Filings insider ${sym}`, 1));
      steps.push(step("suspensions", { symbol: sym }, `Riwayat suspensi ${sym}`, 1));
      steps.push(step("report", { symbol: sym, sections: ["valuation", "financials"] }, `Valuasi & fundamental ${sym}`, 2));
      steps.push(step("daily", { symbol: sym, ...daysStr }, `Harga ${sym}`, 2));
      steps.push(step("broker-summary-top", { symbol: sym, ...window(30) }, `Siapa yang akumulasi/distribusi ${sym}`, 3, true));
      steps.push(step("foreign-flow", { symbol: sym, ...daysStr }, `Aliran asing ${sym}`, 3, true));
      break;
    case 8:
      steps.push(step("broker-summary-top", { symbol: sym, ...window(30) }, `Top buyer/seller ${sym}`, 1));
      steps.push(step("foreign-flow", { symbol: sym, ...daysStr }, `Aliran asing ${sym}`, 2));
      steps.push(step("daily", { symbol: sym, ...daysStr }, `Harga & volume ${sym}`, 2));
      steps.push(step("brokers", {}, "Registry broker (asing/domestik)", 2));
      steps.push(step("most-traded", { ...window(30), n_stock: 10 }, "Konteks likuiditas pasar", 3, true));
      break;
    case 9:
      steps.push(step("report", { symbol: sym, sections: ["valuation", "financials", "future", "peers"] }, `Valuasi, proyeksi & peers ${sym}`, 1));
      steps.push(step("quarterly", { symbol: sym, n_quarters: 8 }, `Kinerja kuartalan ${sym}`, 2));
      steps.push(step("daily", { symbol: sym, ...daysStr }, `Harga ${sym}`, 2));
      steps.push(step("index-daily", { index_code: "ihsg", ...daysStr }, "Konteks IHSG", 2));
      if (slots.commodity) steps.push(step("mining-price", { commodity_name: slots.commodity, start_year: new Date().getUTCFullYear() - 2, end_year: new Date().getUTCFullYear() }, `Harga komoditas ${slots.commodity}`, 3));
      break;
    default: {
      steps.push(step("report", { symbol: sym, sections: ["overview", "valuation", "financials", "dividend", "future", "ownership", "peers"] }, `Laporan lengkap ${sym}`, 1));
      steps.push(step("quarterly", { symbol: sym, n_quarters: 8 }, `Kinerja kuartalan ${sym}`, 1));
      steps.push(step("broker-summary-top", { symbol: sym, ...window(30) }, `Bandarmologi ${sym}`, 2));
      steps.push(step("foreign-flow", { symbol: sym, ...window(90) }, `Aliran asing ${sym}`, 2));
      steps.push(step("daily", { symbol: sym, ...window(90) }, `Tren harga ${sym}`, 2));
      steps.push(step("brokers", {}, "Registry broker", 2, true));
      steps.push(step("segments", { symbol: sym }, `Segmen pendapatan ${sym}`, 3, true));
      steps.push(step("free-float", {}, "Free float", 3, true));
      steps.push(step("news", { symbols: sym, ...window(30), limit: 8 }, `Berita terbaru ${sym}`, 3, true));
      steps.push(step("filings", { symbol: sym, ...window(30), limit: 10 }, `Filings insider ${sym}`, 3, true));
      steps.push(step("corporate-actions-symbol", { symbol: sym }, `Aksi korporasi & dividen ${sym}`, 3, true));
      if (slots.commodity) steps.push(step("mining-company-performance", { slug: "pt-alamtri-resources-indonesia-tbk" }, "Produksi & cadangan tambang", 3, true));
      break;
    }
  }
  return steps;
}

export async function planTurn(params: {
  level: number;
  slots: Slots;
  question: string;
  memoryDigest: string;
}): Promise<Plan> {
  const { level, slots, question } = params;
  const notes: string[] = [];
  const domain = domainFor(level, slots);
  let steps = levelPlan(level, slots, question);

  if (steps.length === 0) {
    try {
      const caps = deterministicCapabilities();
      const { data } = await chatJson<{ capabilities: string[]; reason: string }>(
        "You route Indonesian retail investor questions to data capabilities. Reply JSON only.",
        `Question: "${question}"\nAvailable capabilities:\n${caps.map((c) => `- ${c.name}: ${c.desc} (${c.costHint})`).join("\n")}\n\nJSON: {"capabilities": string[], "reason": string}`,
        { temperature: 0, maxTokens: 300 },
      );
      const chosen = data.capabilities.filter((c) => caps.some((x) => x.name === c));
      steps = chosen.flatMap((c) => expandCapability(c, slots));
      notes.push(`rute capability: ${chosen.join(", ")} (${data.reason.slice(0, 120)})`);
    } catch {
      notes.push("rute capability gagal; fallback ke topik pasar");
      steps = levelPlan(3, slots, question);
    }
  }

  const estCostKr = steps.reduce((a, s) => a + s.estCostKr, 0);
  if (level >= 9) notes.push("level tinggi: bukti dikumpulkan berlapis, biaya dikunci Credit Governor");
  return { level, domain, goal: question, steps, estCostKr, notes };
}