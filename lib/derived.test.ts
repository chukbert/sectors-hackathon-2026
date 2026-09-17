// Satu check runnable untuk seluruh lapisan deterministik (ponytail: node --test, nol framework).
// `npm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ── fomo ────────────────────────────────────────────────────────────────────
import { fomoMeter, type DailyRow } from "./fomo.ts";
const rising: DailyRow[] = [];
for (let i = 0; i < 40; i++) rising.push({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, close: 200 + (i > 30 ? (i - 30) * 7 : 0) + (i % 3), volume: i < 39 ? 1_000_000 : 8_000_000 });
test("fomo: gorengan naik + vol meledak → panas; datar → dingin", () => {
  const hot = fomoMeter({ daily: rising, asing_sell_streak: 6, news_no_filing: true });
  assert.ok(hot.score >= 65, `skor ${hot.score} harus panas`);
  assert.equal(hot.label, "sangat panas");
  const calm = fomoMeter({ daily: Array.from({ length: 40 }, (_, i) => ({ date: "x", close: 200 + (i % 2), volume: 1e6 })) });
  assert.ok(calm.score < 30, `skor ${calm.score} harus dingin`);
  assert.ok(hot.components.length === 5);
});

// ── graph ───────────────────────────────────────────────────────────────────
import { clusterOwnerships, sameName, normalizeName, egoGraph, autopsiKartu, type Ownership } from "./graph.ts";
test("normalisasi + fuzzy nama pemegang", () => {
  assert.ok(sameName("PT Indofood Sukses Makmur Tbk", " Indofood Sukses Makmur"));
  assert.ok(sameName("PT Barito Pacific,Tbk", "Barito Pacific Tbk"));
  assert.ok(!sameName("Budi Santoso", "Andi Wijaya"));
  assert.equal(normalizeName("PT A (Persero) Tbk"), "a");
});
const own: Ownership[] = [
  { ticker: "INDF", holders: [{ name: "PT Indofood Sukses Makmur Tbk", share_percentage: 35 }] },
  { ticker: "ICBP", holders: [{ name: "INDOFOID SUKSES MAKMUR", share_percentage: 40 }] }, // typo sengaja → fuzzy
  { ticker: "BRMS", group: "Bumi", holders: [] },
  { ticker: "BUMI", group: "Bumi", holders: [] },
  { ticker: "BBCA", holders: [{ name: "Djarum Foundation", share_percentage: 20 }] },
];
test("clusterOwnerships: induk sama (via nama) & label API sama → satu grup; BBCA sendiri", () => {
  const c = clusterOwnerships(own);
  assert.equal(c.get("INDF"), c.get("ICBP"));
  assert.ok((c.get("INDF") ?? "").length > 0);
  assert.equal(c.get("BRMS"), c.get("BUMI"));
  assert.equal(c.get("BBCA"), "");
});
test("egoGraph: hub + anggota, flag di ticker tanya", () => {
  const g = egoGraph("BRMS", clusterOwnerships(own), own);
  assert.ok(g.nodes.some((n) => n.hub === 1));
  assert.ok(g.nodes.some((n) => n.id === "BRMS" && n.flag === 1));
  assert.ok(g.links.length >= 2);
});
test("autopsiKartu: % grup = group_score; headline jujur", () => {
  const a = autopsiKartu([
    { ticker: "INDF", pct: 20 }, { ticker: "ICBP", pct: 23 }, { ticker: "BRMS", pct: 19 }, { ticker: "BUMI", pct: 12 }, { ticker: "BBCA", pct: 26 },
  ], own);
  assert.equal(a.group_score, 74); // 20+23+19+12
  assert.match(a.headline, /74% nilaimu dipegang 2 grup/);
  assert.ok(a.graph.nodes.filter((n) => !n.hub).length >= 4);
});

// ── grounding verifier ─────────────────────────────────────────────────────
import { verifyGrounding, numbersInJson } from "./ground.ts";
test("verifier: angka terlacak lolos, angka karangan dibuang", () => {
  const toolJson = { data: [{ nval: 41_000_000, pb: 4.2, vol: 3400000 }] };
  const pool = numbersInJson(toolJson);
  assert.ok(pool.length >= 3);
  const ok = verifyGrounding(["broker ritel net-buy Rp 41 M · PBV 4.2× · z 3.4 (2 grup, 2023)"], [toolJson, { x: 3.4, y: 2 }]);
  assert.ok(ok.ok, JSON.stringify(ok.ungrounded)); // 41M ✓ 4.2 ✓ 3.4 ✓ — "2 grup"/"2023" bukan klaim finansial → tidak di-gate
  const bad = verifyGrounding(["PBV 9.9× lebih murah"], [toolJson]);
  assert.equal(bad.ungrounded.length, 1);
  assert.match(bad.ungrounded[0], /9\.9/);
});

// ── flow index end-to-end dengan fetch stub ─────────────────────────────────
process.env.SECTORS_API_KEY = "test-key";
process.env.ARUS_CACHE = mkdtempSync(path.join(tmpdir(), "arus-"));
const { kohortFlowIndex } = await import("./flow.ts");
const iso = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10) };
const days7 = [...Array(7)].map((_, i) => iso(7 - i));
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  const json = (b: unknown) => new Response(JSON.stringify(b));
  if (u.includes("/brokers/")) return json([
    { code: "R1", name: "Broker Ritel Satu", is_foreign: false, cohort: "retail" },
    { code: "IG", name: "Insti Global", is_foreign: true, cohort: "institutional" },
    { code: "MX", name: "Mixed", is_foreign: false, cohort: "mixed" },
  ]);
  if (u.includes("/broker-summary/")) return json({ symbol: "GORENG.JK", data: days7.map((d) => ({
    date: d, summary: [{ broker_code: "R1", nval: 6e9 }, { broker_code: "IG", nval: -9e9 }, { broker_code: "MX", nval: 1e9 }] })) });
  if (u.includes("/foreign-flow/")) return json({ data: days7.map((d) => ({ date: d, net_foreign_inflow: -9e9 })) });
  if (u.includes("/filings/")) return json({ results: [{ transaction_type: "sell" }] });
  if (u.includes("/daily/")) return json({ data: days7.map((d, i) => ({ date: d, close: 200 + i * 3, volume: 1e6 })) });
  return json({});
}) as typeof fetch;
test("Kohort Flow Index: ritel +42 M vs uang besar −63 M, distribusi terdeteksi, streak 7", async () => {
  const f = await kohortFlowIndex("GORENG", 7);
  assert.equal(f.retail_net_m, 42000);   // 7 hari × 6 miliar Rp = Rp 42.000 juta
  assert.equal(f.institusi_net_m, -63000);
  assert.ok(f.distribusi_ritel);
  assert.equal(f.retail_streak, 7);
  assert.equal(f.insider_sold, true);
  assert.equal(f.top_buyers[0].code, "R1");
  assert.equal(f.days.length, 7);
  globalThis.fetch = realFetch;
  rmSync(process.env.ARUS_CACHE!, { recursive: true, force: true });
});
