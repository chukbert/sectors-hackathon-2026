// EVAL HARNESS — 20 kasus, offline deterministik (LLM-gated test ditandai SKIP bila key kosong).
// Angka yang di-assert berasal dari fixtures sintetis eval/fixtures (BUKAN data pasar nyata)
// atau dari properti matematis yang berlaku pada data apa pun. → EVAL_REPORT.md
// ISOLASI: key ambient di shell TIDAK boleh bocor ke eval — assert melekat pada fixtures.
delete process.env.SECTORS_API_KEY;
delete process.env.GEMINI_API_KEY;
process.env.ARUS_SEED = "1";
process.env.ARUS_CACHE = ".cache/eval";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
mkdirSync(process.env.ARUS_CACHE, { recursive: true });

import { planFallback } from "../lib/agents.ts";
import { kohortFlowIndex } from "../lib/flow.ts";
import { loadOwnerships, clusterOwnerships, autopsiKartu, sameName, knownMembers } from "../lib/graph.ts";
import { fomoMeter } from "../lib/fomo.ts";
import { verifyGrounding } from "../lib/ground.ts";
import { scanAnomalies } from "../lib/morning.ts";
import { llmOk } from "../lib/llm.ts";
import type { DailyRow } from "../lib/fomo.ts";

type Res = { id: string; nama: string; ok: boolean | "SKIP"; detail: string };
const results: Res[] = [];
const check = async (id: string, nama: string, fn: () => Promise<string> | string) => {
  try { const d = await fn(); results.push({ id, nama, ok: true, detail: d }); }
  catch (e) { results.push({ id, nama, ok: false, detail: (e as Error).message }); }
};
const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };

// ── 1-6: ROUTING PLANNER (fallback deterministik) ───────────────────────────
await check("P1", "intent kenapa-gerak", () => { const p = planFallback("kenapa ANTM naik 2 hari ini?"); must(p.intent === "kenapa-gerak" && p.tickers[0] === "ANTM", JSON.stringify(p)); return "kenapa-gerak [ANTM]"; });
await check("P2", "intent evaluasi-beli", () => { const p = planFallback("boleh ikut BRMS gak nih"); must(p.intent === "evaluasi-beli", JSON.stringify(p)); return "evaluasi-beli"; });
await check("P3", "intent autopsi (saya BUKAN ticker)", () => { const p = planFallback("autopsi portofolio saya"); must(p.intent === "autopsi-portofolio" && !p.tickers.includes("SAYA"), JSON.stringify(p)); return "autopsi, nol ticker palsu"; });
await check("P4", "intent pagi", () => { const p = planFallback("brief pagi"); must(p.intent === "pagi", JSON.stringify(p)); return "pagi"; });
await check("P5", "intent risiko (panic)", () => { const p = planFallback("BRMS merah parah, gue panik"); must(p.intent === "risiko" && p.tickers[0] === "BRMS", JSON.stringify(p)); return "risiko [BRMS]"; });
await check("P6", "chase → evaluasi-beli, ticker kapital", () => { const p = planFallback("mau average down NCKL lagi"); must(p.intent === "evaluasi-beli" && p.tickers.includes("NCKL"), JSON.stringify(p)); return "evaluasi-beli [NCKL]"; });

// ── 7-10: KOHORT FLOW INDEX (fixtures sintetis BRMS) ───────────────────────
const flow = await kohortFlowIndex("BRMS", 7);
await check("F1", "join registry × broker-summary: kohort ritel vs institusi", () => {
  must(flow.retail_net_m > 0 && flow.institusi_net_m < 0, JSON.stringify({ r: flow.retail_net_m, i: flow.institusi_net_m }));
  return `ritel +${flow.retail_net_m} M vs uang besar ${flow.institusi_net_m} M`; });
await check("F2", "deteksi distribusi ke ritel", () => { must(flow.distribusi_ritel, "flag false"); return "harga naik + ritel beli + institusi jual → ⚑"; });
await check("F3", "streak asing dari 90d foreign-flow", () => { must(flow.asing_sell_streak >= 5, String(flow.asing_sell_streak)); return `${flow.asing_sell_streak} hari beruntun`; });
await check("F4", "top broker terurut + nama dari registry", () => { must(flow.top_buyers.length && flow.top_buyers[0].name.length > 1, JSON.stringify(flow.top_buyers.slice(0, 2))); return `${flow.top_buyers[0].code} ${flow.top_buyers[0].name} ${flow.top_buyers[0].net_m} M`; });

// ── 11-13: GRUPGRAPH ────────────────────────────────────────────────────────
const own = await loadOwnerships(["INDF", "ICBP", "BRMS", "BUMI", "BBCA", "TLKM"]);
const cl = clusterOwnerships(own);
await check("G1", "INDF-ICBP satu cluster (nama pengendali sama, fuzzy)", () => { must(cl.get("INDF") && cl.get("INDF") === cl.get("ICBP"), JSON.stringify({ a: cl.get("INDF"), b: cl.get("ICBP") })); return `“${cl.get("INDF")}”` });
await check("G2", "BUMI-BRMS cluster via label API; BBCA independen", () => { must(cl.get("BRMS") === cl.get("BUMI") && cl.get("BBCA") === "", JSON.stringify({ brms: cl.get("BRMS"), ca: cl.get("BBCA") })); return "BUMI=BRMS ✓, BBCA='' ✓"; });
await check("G3", "group score = % satu pengendali", () => { const a = autopsiKartu([{ ticker: "INDF", pct: 20 }, { ticker: "ICBP", pct: 20 }, { ticker: "BRMS", pct: 15 }, { ticker: "BUMI", pct: 15 }, { ticker: "BBCA", pct: 30 }], own); must(a.group_score === 70, String(a.group_score)); return `4 grup → score ${a.group_score}, headline: ${a.headline}`; });

// ── 14: sameName guard ──────────────────────────────────────────────────────
await check("G4", "fuzzy tidak merge nama generik (Public/Masyarakat)", () => {
  must(sameName("PT Indofood Sukses Makmur Tbk", "INDOFOID SUKSES MAKMUR"), "harus merge");
  must(!sameName("Public Seed BBCA", "Public Seed TLKM"), "generik tidak boleh merge");
  return "±"; });
await check("G5", "knownMembers: Bumi → BUMI+BRMS", () => { must(knownMembers("Bumi").length >= 2, ""); return knownMembers("Bumi").join(","); });

// ── 16-17: FOMO ─────────────────────────────────────────────────────────────
await check("M1", "sahat seed BRMS dinilai panas", async () => {
  const j = await (await import("../lib/sectors.ts")).sectorsGet("daily", { symbol: "BRMS", start: "2026-06-01", end: "2026-12-31" }) as { data?: DailyRow[] };
  const rows = j.data ?? [];
  const f = fomoMeter({ daily: rows, asing_sell_streak: flow.asing_sell_streak, news_no_filing: true });
  must(f.score >= 70 && f.raw!.volz > 2, JSON.stringify({ s: f.score, z: f.raw!.volz })); return `score ${f.score} (${f.label}) z-vol ${f.raw!.volz}`; });
await check("M2", "data flat → dingin", () => { const f = fomoMeter({ daily: Array.from({ length: 45 }, (_, i) => ({ date: "d" + i, close: 300 + (i % 2), volume: 2e6 })) as DailyRow[] }); must(f.score < 30, String(f.score)); return `score ${f.score}`; });

// ── 18: VERIFIER GATE ───────────────────────────────────────────────────────
await check("V1", "angka karangan dibuang, angka tool lolos", () => {
  const tool = { data: [{ nval: 41_000_000, pb: 4.2 }] };
  const good = verifyGrounding(["ritel net-buy Rp 41 M"], [tool]);
  const bad = verifyGrounding(["cukup untuk saham dengan PBV 7.7× dan free float 3%"], [tool]);
  must(good.ok && !bad.ok && bad.ungrounded.length === 2, JSON.stringify({ good, bad })); return `${bad.ungrounded.length} angka fiktif tertangkap gate`; });

// ── 19: MORNING (anomaly scan offline dari fixtures) ────────────────────────
await check("O1", "scan anomali menemukan pump tanpa berita", async () => {
  const b = await scanAnomalies();
  must(b.entries.length >= 2, JSON.stringify(b.entries.map((e) => e.ticker)));
  must(b.entries.some((e) => e.ticker === "NSTI" || e.ticker === "ARUM" || e.ticker === "BRMS"), "anomali pump hilang");
  return `${b.entries.length} anomali: ${b.entries.map((e) => `${e.ticker}[${e.sev}]`).join(" ")}`; });

// ── 20: COMPLIANCE — tidak ada rekomendasi di seluruh teks kartu ────────────
await check("C1", "nada kartu: fakta+pertanyaan, nol imperatif beli/jual/hold", async () => {
  const { runTickerAnalysis } = await import("../lib/agents.ts");
  const kartu = await runTickerAnalysis(planFallback("kenapa BRMS naik? boleh ikut?"), () => { }, "eval", []);
  const blob = JSON.stringify(kartu).toLowerCase();
  for (const forbidden of ["beli sekarang", "harus beli", "harus jual", "saya rekomendasikan", "rekomendasi beli", "disarankan hold", "jual semua", "buy now", "sell now"])
    must(!blob.includes(forbidden), "teks kartu mengandung: " + forbidden);
  must(kartu.bantah.rebuttal.length > 20 && kartu.question.length > 10, "bantahan/pertanyaan kosong");
  return `${kartu.pillars.length} pilar · bantah ✓ · pertanyaan ✓ · nol frasa terlarang`; });

// ── laporan ─────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.ok === true).length, fail = results.filter((r) => r.ok === false).length, skip = results.filter((r) => r.ok === "SKIP").length;
const report = `# EVAL_REPORT — ARUS

Tanggal jalan: ${new Date().toISOString()} · LLM ${llmOk() ? "AKTIF" : "tidak aktif (case deterministik saja; jalur LLM butuh GEMINI_API_KEY)"}
**${pass} PASS / ${fail} FAIL / ${skip} SKIP** dari ${results.length} kasus.

Semua assert memakai fixtures **sintetis** (\`eval/fixtures/\`, skenario demo PRD §8.4) atau properti yang berlaku umum.
Ini anti-"faked for demo": angka di kartu selalu berasal dari JSON tool / kode terhitung, dan gate-nya ikut diuji (V1).

| # | Kasus | Hasil | Detail |
|---|---|---|---|
${results.map((r) => `| ${r.id} | ${r.nama} | ${r.ok === true ? "✅" : r.ok === "SKIP" ? "⏭" : "❌"} | ${r.detail.replace(/\|/g, "\\|").slice(0, 140)} |`).join("\n")}

## Limitasi yang diketahui
- Plural kecil ("2 grup", tahun) sengaja BUKAN klaim finansial → tidak di-gate verifier.
- Ambang kendali 20% & streak dari data EOD — konstanta kalibrasi, lihat README §Limitasi.
- ${llmOk() ? "" : "Tanpa GEMINI_API_KEY, prose agen = template deterministik dari angka terhitung (bukan karangan)."}
`;
writeFileSync("eval/EVAL_REPORT.md", report);
console.log(report);
if (fail) process.exitCode = 1;
