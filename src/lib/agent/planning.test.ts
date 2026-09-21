import { describe, expect, it } from "vitest";
import { composeLevel, type IntentHit } from "@/lib/agent/classifier";
import { isDiscoveryQuestion, isValidSectorPredicate } from "@/lib/agent/slots";
import {
  applySectorTermFilter,
  sanitizeRevisedPlan,
  shouldRevisePlan,
  subsectorFromPredicate,
} from "@/lib/agent/planner";
import { shouldJudge } from "@/lib/agent/sufficiency";
import type { Plan } from "@/lib/agent/types";

const hit = (id: string): IntentHit => ({ id, label: id, domain: "harga", section: id, probability: 0.9 });

const proposal: Plan = {
  level: 0,
  domain: "harga",
  goal: "q",
  estCostKr: 2,
  notes: [],
  steps: [
    { id: "daily:1", endpoint: "daily", args: { symbol: "BBCA" }, purpose: "harga", estCostKr: 1, phase: 1, optional: false },
    { id: "news:1", endpoint: "news", args: { symbols: "BBCA" }, purpose: "berita", estCostKr: 1, phase: 2, optional: true },
  ],
};

describe("composeLevel", () => {
  it("intent tunggal non-deep menghormati depth L1", () => {
    expect(composeLevel([hit("harga")], 1, false, false)).toBe(1);
  });
  it("multi-intent tetap lompat minimum", () => {
    expect(composeLevel([hit("harga"), hit("berita")], 1, false, false)).toBe(4);
  });
  it("deep intent tunggal minimal L6", () => {
    expect(composeLevel([hit("valuasi")], 2, false, false)).toBe(6);
  });
});

describe("discovery guard", () => {
  it("mendeteksi pertanyaan discovery", () => {
    expect(isDiscoveryQuestion("Cari saham yang CEO-nya resign. Siapa mereka?")).toBe(true);
    expect(isDiscoveryQuestion("daftar saham perbankan")).toBe(true);
    expect(isDiscoveryQuestion("Berapa harga BRMS sekarang?")).toBe(false);
  });
});

describe("sector predicate", () => {
  it("validasi bentuk predikat", () => {
    expect(isValidSectorPredicate("sub_sector = 'banks'")).toBe(true);
    expect(isValidSectorPredicate("industry = 'agricultural-products'")).toBe(true);
    expect(isValidSectorPredicate("sub_sector = 'banks'; DROP")).toBe(false);
    expect(isValidSectorPredicate(null)).toBe(false);
    expect(isValidSectorPredicate("banks")).toBe(false);
  });
  it("predikat LLM mengalahkan regex", () => {
    expect(applySectorTermFilter("saham bank murah", "pe_ttm < 10", "industry = 'agricultural-products'")).toBe(
      "industry = 'agricultural-products' and pe_ttm < 10",
    );
  });
  it("regex tetap fallback bila predikat null", () => {
    expect(applySectorTermFilter("saham bank murah", "pe_ttm < 10", null)).toBe("sub_sector = 'banks' and pe_ttm < 10");
  });
  it("ekstrak subsektor dari predikat", () => {
    expect(subsectorFromPredicate("sub_sector = 'banks'")).toBe("banks");
    expect(subsectorFromPredicate("industry = 'agricultural-products'")).toBeNull();
  });
});

describe("plan revision", () => {
  it("revisi hanya bila kompleks/kosong", () => {
    expect(shouldRevisePlan(2, 1, 3)).toBe(false);
    expect(shouldRevisePlan(7, 1, 3)).toBe(true);
    expect(shouldRevisePlan(4, 3, 3)).toBe(true);
    expect(shouldRevisePlan(2, 1, 0)).toBe(true);
  });
  it("sanitize membuang endpoint tak dikenal & param kurang", () => {
    const { plan, notes } = sanitizeRevisedPlan(proposal, {
      keep: [],
      drop: ["news:1"],
      add: [
        { endpoint: "tidak-ada", args_json: "{}", purpose: "x", phase: 1, optional: false },
        { endpoint: "daily", args_json: "{}", purpose: "tanpa simbol", phase: 1, optional: false },
        { endpoint: "daily", args_json: '{"symbol":"BBRI"}', purpose: "harga BBRI", phase: 1, optional: false },
      ],
      reason: "uji",
    });
    expect(plan.steps.map((s) => s.endpoint)).toEqual(["daily", "daily"]);
    expect(plan.steps[1].args).toEqual({ symbol: "BBRI" });
    expect(notes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("sufficiency gating", () => {
  it("lewati judge bila tak ada sisa biaya / tak ada observasi", () => {
    expect(shouldJudge(0, 0, 5, 0)).toBe(false);
    expect(shouldJudge(3, 0, 0, 0)).toBe(false);
    expect(shouldJudge(3, 0, 5, 0)).toBe(true);
    expect(shouldJudge(0, 2, 5, 0)).toBe(true);
    expect(shouldJudge(3, 0, 5, 3)).toBe(false);
  });
});
