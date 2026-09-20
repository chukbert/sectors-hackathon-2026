import { describe, expect, it } from "vitest";
import { formatIdr, formatNumber, formatPer, formatPercent } from "@/lib/util/format";
import { canonicalKey, stableStringify } from "@/lib/util/ids";
import { parseJsonLoose } from "@/lib/llm/openrouter";
import { ENDPOINT_BY_ID, buildUrl, estimateCost, normalizeArgs, repairScreenerWhere } from "@/lib/sectors/registry";
import { govern } from "@/lib/agent/tools";
import { codeCitationCheck, codeComplianceCheck } from "@/lib/agent/verify";
import { classifyByRules } from "@/lib/agent/classifier";
import { extractWithRules } from "@/lib/agent/slots";
import { applySectorTermFilter } from "@/lib/agent/planner";
import type { Plan } from "@/lib/agent/types";
import type { Fact } from "@/lib/facts";
import type { NarratorOutput } from "@/lib/agent/narrator";

const slots = {
  symbols: ["BRMS"],
  unresolved: [],
  symbolsFromMemory: false,
  indexCode: null,
  sectorText: null,
  periodDays: null,
  isRumor: false,
  wantsAdvice: false,
  isComparison: false,
  commodity: null,
};

describe("format", () => {
  it("memformat IDR ringkas dan konsisten", () => {
    expect(formatIdr(1_035_023_494_467_400, "menengah")).toContain("T");
    expect(formatIdr(-2_500_000_000, "pemula")).toContain("-");
    expect(formatIdr(0, "advanced")).toContain("Rp");
  });
  it("membedakan presisi antar mode", () => {
    const pemula = formatNumber(1234.567, "pemula");
    const advanced = formatNumber(1234.567, "advanced");
    expect(pemula).not.toBe(advanced);
  });
  it("menangani persen dan kelipatan", () => {
    expect(formatPercent(0.1234, "menengah")).toBe("12,34%");
    expect(formatPercent(12.34, "menengah")).toBe("12,34%");
    expect(formatPer(2.5, "menengah")).toBe("2,5×");
  });
});

describe("ids", () => {
  it("stableStringify deterministik untuk urutan key berbeda", () => {
    expect(stableStringify({ a: 1, b: [1, 2] })).toBe(stableStringify({ b: [1, 2], a: 1 }));
  });
  it("canonicalKey mengubah payload", () => {
    expect(canonicalKey({ a: 1 })).not.toBe(canonicalKey({ a: 2 }));
    expect(canonicalKey({ a: 1 })).toBe(canonicalKey({ a: 1 }));
  });
});

describe("parseJsonLoose", () => {
  it("mengurai JSON dengan code fence", () => {
    expect(parseJsonLoose<{ a: number }>("```json\n{\"a\":1}\n```").a).toBe(1);
  });
  it("mengurai JSON dengan teks pembuka", () => {
    expect(parseJsonLoose<{ a: number }>("Berikut hasilnya: {\"a\":2} semoga membantu").a).toBe(2);
  });
  it("melempar error untuk output tanpa JSON", () => {
    expect(() => parseJsonLoose("tidak ada json")).toThrow();
  });
});

describe("registry", () => {
  it("buildUrl menyusun path + query", () => {
    const def = ENDPOINT_BY_ID.get("daily")!;
    const url = buildUrl(def, { symbol: "BRMS", start: "2026-09-01", end: "2026-09-18" });
    expect(url).toBe("/v2/daily/BRMS/?start=2026-09-01&end=2026-09-18");
  });
  it("buildUrl mengulang array query", () => {
    const def = ENDPOINT_BY_ID.get("report")!;
    const url = buildUrl(def, { symbol: "BRMS", sections: ["valuation", "financials"] });
    expect(url).toContain("sections=valuation&sections=financials");
  });
  it("normalizeArgs screener melipat desc ke prefix minus order_by", () => {
    const def = ENDPOINT_BY_ID.get("screener")!;
    const a = normalizeArgs(def, { order_by: "market_cap", desc: true });
    expect(a.order_by).toBe("-market_cap");
    expect(a.desc).toBeUndefined();
    expect(normalizeArgs(def, { order_by: "market_cap", desc: false }).order_by).toBe("market_cap");
  });
  it("repairScreenerWhere memperbaiki field yang ditolak API", () => {
    const year = new Date().getUTCFullYear() - 1;
    expect(repairScreenerWhere("sub_sector = 'Banks' and market_cap > 10000000000000 and pe_ttm < 10 and roe > 0.15")).toBe(
      `sub_sector = 'Banks' and market_cap > 10000000000000 and pe_ttm < 10 and roe_ttm > 0.15`,
    );
    expect(repairScreenerWhere(`roe[2024] > 0.15 and der > 1 and revenue < 1000`)).toBe(
      `roe[2024] > 0.15 and der[${year}] > 1 and revenue[${year}] < 1000`,
    );
    expect(repairScreenerWhere("pb_mrq < 1.5 and yield_ttm > 0.05")).toBe("pb_mrq < 1.5 and yield_ttm > 0.05");
    expect(repairScreenerWhere("dividend_yield_ttm > 0.05")).toBe("yield_ttm > 0.05");
  });
  it("estimasi biaya per model", () => {
    expect(estimateCost(ENDPOINT_BY_ID.get("daily")!, {})).toBe(1);
    expect(estimateCost(ENDPOINT_BY_ID.get("report")!, { sections: ["a", "b", "c"] })).toBe(3);
    expect(estimateCost(ENDPOINT_BY_ID.get("quarterly")!, { n_quarters: 8 })).toBe(8);
    expect(estimateCost(ENDPOINT_BY_ID.get("most-traded")!, {})).toBe(2);
    expect(estimateCost(ENDPOINT_BY_ID.get("screener")!, { where: "pe_ttm > 0" })).toBe(1);
    expect(estimateCost(ENDPOINT_BY_ID.get("screener")!, { q: "bank murah" })).toBe(3);
    expect(estimateCost(ENDPOINT_BY_ID.get("top-changes")!, { classifications: ["top_gainers"], periods: ["1d"] })).toBe(1);
    expect(estimateCost(ENDPOINT_BY_ID.get("top-changes")!, { classifications: ["top_gainers", "top_losers"], periods: ["1d", "7d"] })).toBe(4);
  });
});

describe("slots", () => {
  it("tidak menganggap kata perintah sebagai nama belum terpetakan", () => {
    expect(extractWithRules("Carikan saham bank dengan PER di bawah 10 dan ROE tinggi").unresolved).toEqual([]);
    expect(extractWithRules("Bandingkan BBCA vs BBRI").symbols.sort()).toEqual(["BBCA", "BBRI"]);
  });
  it("kata sektor perkebunan → predicate slug yang benar", () => {
    expect(applySectorTermFilter("ada saham apa saja di perkebunan?", "industry like '%Plantation%' or sub_sector like '%Plantation%'")).toBe("industry = 'agricultural-products'");
    expect(applySectorTermFilter("saham sawit murah", "pe_ttm < 10")).toBe("industry = 'agricultural-products' and pe_ttm < 10");
    expect(applySectorTermFilter("harga BRMS", "pe_ttm < 10")).toBe("pe_ttm < 10");
    expect(extractWithRules("ada saham apa saja di perkebunan?").sectorText).toBe("perkebunan");
  });
});

describe("governor", () => {
  const plan: Plan = {
    level: 6,
    domain: "fundamental",
    goal: "test",
    notes: [],
    estCostKr: 0,
    steps: Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      endpoint: "daily",
      args: { symbol: "BRMS" },
      purpose: "test",
      estCostKr: 1,
      phase: (i < 5 ? 1 : i < 12 ? 2 : 3) as 1 | 2 | 3,
      optional: i >= 12,
    })),
  };
  it("membatasi sesuai cap level", () => {
    const g = govern(plan, { level: 6, allowLive: true, spendTodayKr: 0 });
    expect(g.estCostKr).toBeLessThanOrEqual(16);
    expect(g.skipped.length).toBeGreaterThan(0);
  });
  it("mendahulukan fase murah dan non-opsional", () => {
    const g = govern(plan, { level: 6, allowLive: true, spendTodayKr: 0 });
    expect(g.executable[0].phase).toBe(1);
  });
  it("replay tidak menghabiskan budget", () => {
    const g = govern(plan, { level: 1, allowLive: false, spendTodayKr: 0 });
    expect(g.executable).toHaveLength(20);
    expect(g.skipped).toHaveLength(0);
  });
});

describe("classifier", () => {
  it("klasifikasi fakta tunggal", () => {
    expect(classifyByRules("Berapa harga BRMS sekarang?", slots).level).toBeLessThanOrEqual(2);
  });
  it("klasifikasi bandarmologi", () => {
    expect(classifyByRules("Cek bandarmologi PTBA, siapa akumulasi?", slots).level).toBeGreaterThanOrEqual(8);
  });
  it("permintaan rekomendasi naik ke verifikasi", () => {
    expect(classifyByRules("Kasih rekomendasi beli dong", { ...slots, wantsAdvice: true }).level).toBeGreaterThanOrEqual(7);
  });
  it("perbandingan minimal L5", () => {
    expect(classifyByRules("Bandingkan BBCA vs BBRI", slots).level).toBeGreaterThanOrEqual(5);
  });
});

const fact = (id: string, unit: Fact["unit"], valueNum = 1): Fact => ({
  id,
  label: `fakta ${id}`,
  key: id,
  valueNum,
  unit,
  asOf: "2026-09-18",
  endpoint: "daily",
  args: {},
});

const narration = (text: string): NarratorOutput => ({
  title: "t",
  conclusion: { pemula: text, menengah: text, advanced: text },
  sections: [],
  assumptions: [],
  risks: [],
  degraded: false,
});

describe("verifikasi kode", () => {
  it("menolak placeholder dengan id tidak dikenal", () => {
    const check = codeCitationCheck(narration("Harga {{f:nope|number}} naik"), [fact("a", "price")]);
    expect(check.ok).toBe(false);
  });
  it("menolak format tidak cocok unit", () => {
    const check = codeCitationCheck(narration("Yield {{f:a|idr}}"), [fact("a", "%")]);
    expect(check.ok).toBe(false);
  });
  it("menolak angka mentah di narasi", () => {
    const check = codeCitationCheck(narration("Harganya 730 rupiah"), [fact("a", "price", 730)]);
    expect(check.ok).toBe(false);
  });
  it("mengizinkan tahun tanpa placeholder", () => {
    const check = codeCitationCheck(narration("Data per penutupan 18 September 2026 menunjukkan harga {{f:a|number}}"), [fact("a", "price", 730)]);
    expect(check.ok).toBe(true);
  });
  it("menangkap persentase mentah", () => {
    const check = codeCitationCheck(narration("Yield-nya 7,5% tahun ini"), [fact("a", "%", 0.075)]);
    expect(check.ok).toBe(false);
  });
  it("menerima placeholder yang valid", () => {
    const check = codeCitationCheck(narration("Harga {{f:a|number}} dan yield {{f:b|percent}}"), [fact("a", "price", 730), fact("b", "%", 0.05)]);
    expect(check.ok).toBe(true);
  });
  it("menangkap frasa anjuran", () => {
    expect(codeComplianceCheck(narration("Sebaiknya kamu harus beli sekarang")).ok).toBe(false);
  });
});