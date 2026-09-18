// eval/run.ts — uji JUJUR & offline: SEED=1, tanpa SECTORS_API_KEY, tanpa OPENROUTER_API_KEY.
// Setiap kasus punya assertion yang BISA gagal (ticker, verdict, grup, tanggal) — bukan sekadar cek substring "verdict".
import fs from "node:fs";
import path from "node:path";

process.env.SEED = "1";
process.env.ARUS_CACHE = path.join(process.cwd(), ".cache", "eval");
delete process.env.SECTORS_API_KEY;
delete process.env.OPENROUTER_API_KEY;
fs.rmSync(process.env.ARUS_CACHE, { recursive: true, force: true });

const { chat } = await import("../lib/orchestrator.js");
const { CreditSession } = await import("../lib/credit.js");
const { computeBarang } = await import("../lib/barang.js");
const { detectCluster } = await import("../lib/kuasa.js");
const { fingerprintBroker } = await import("../lib/dna.js");
const { validateCompiled } = await import("../lib/compiler.js");
const { screenFromCompiled } = await import("../lib/screener.js");

interface Run { k: Awaited<ReturnType<typeof chat>>; spent: number }
async function ask(text: string): Promise<Run> {
  const s = new CreditSession("eval");
  const k = await chat(text, s);
  return { k, spent: s.spent };
}
const json = (r: Run) => JSON.stringify(r.k);

interface Case { name: string; run: () => Promise<unknown> | unknown; expect: (out: unknown) => boolean }
const cases: Case[] = [];
const add = (name: string, run: () => Promise<unknown> | unknown, expect: (out: unknown) => boolean) => cases.push({ name, run, expect });

// — resolusi subjek (regresi SMAR) —
add("smar/subjek-benar", () => ask("gimana kabar SMAR?"), (o) => {
  const r = o as Run;
  return !!r.k.subjek?.includes("SMAR") && json(r).includes("SMAR") && !/ANTM/.test(json(r));
});
add("smar/huruf-kecil", () => ask("kenapa smar naik?"), (o) => {
  const r = o as Run;
  return !!r.k.subjek?.includes("SMAR") && !/ANTM/.test(json(r));
});
add("smar/ticker-asing", () => ask("kenapa ZZZZ naik?"), (o) => {
  const r = o as Run;
  return !!r.k.subjek?.includes("ZZZZ") && !/ANTM/.test(json(r));
});
add("smar/tanpa-ticker-klarifikasi", () => ask("yield aman?"), (o) => {
  const r = o as Run;
  return r.k.verdict === "data-kurang" && r.k.subjek === undefined && json(r).includes("tidak menebak");
});

// — multi-intent (LLM planner + fallback heuristik dua-duanya boleh) —
add("multi/gerak+kalender", () => ask("kenapa ANTM naik dan ex-date kapan?"), (o) => {
  const r = o as Run;
  const intents = r.k.audit?.intents ?? [];
  return intents.length >= 2 && intents.includes("kalender") && json(r).includes("ANTM")
    && r.k.sitasi.some((s) => s.includes("corporate-actions")) && r.k.sitasi.some((s) => s.includes("daily/ANTM"));
});
add("multi/dividen+likuiditas", () => ask("yield SMAR aman dan likuid nggak?"), (o) => {
  const r = o as Run;
  const intents = r.k.audit?.intents ?? [];
  return intents.length >= 2 && intents.includes("dividen") && intents.includes("likuiditas") && !/ANTM/.test(json(r));
});
add("disiplin/direksi-bukan-kuasa", () => ask("siapa direksi ASII?"), (o) => {
  const r = o as Run;
  const intents = r.k.audit?.intents ?? [];
  return intents.length === 1 && intents[0] === "fundamental" && !json(r).includes("cluster insider");
});

// — query compiler v7: validator murni (tanpa LLM) + fallback heuristik 0 kredit —
add("unit/compiler-valid", () => {
  const v = validateCompiled({
    intents: ["rantai", "fundamental"],
    tickers: ["ADRO"],
    entities: [{ name: "Indomaret", candidates: ["AMRT", "DNET"], relation: "pemilik jaringan" }],
    fundamental_mode: "kinerja",
    screen: { criteria: "murah", metric: "pe_ttm", direction: "asc", sector_word: "bank" },
    commodity: { word: "coal", slug_candidates: ["coal"] },
    hops: [{ from: "ADRO", edge: "ownership", to: "grup" }],
    alasan: "uji",
  }, "kenapa ADRO dan labanya gimana?");
  const p = v.plan;
  return !!p && p.intents.join(",") === "rantai,fundamental" && p.tickers.includes("ADRO")
    && p.entities.length === 1 && p.entities[0]!.candidates.includes("AMRT")
    && p.fundamentalMode === "kinerja" && p.screen?.metric === "pe_ttm" && p.screen?.sectorWord === "bank"
    && p.commodity?.word === "coal" && p.commodity?.slugCandidates.includes("coal")
    && p.hops.length === 1 && v.rejected.length === 0;
}, (o) => o === true);
add("unit/compiler-screen-map", () => {
  const asc = screenFromCompiled({ metric: "pe_ttm", direction: "asc" });
  const desc = screenFromCompiled({ metric: "yield_ttm", direction: "desc" });
  const def = screenFromCompiled({ metric: "pe_ttm" });
  return [asc.orderBy, asc.label, asc.where, desc.orderBy, desc.label, def.orderBy].join("|");
}, (o) => o === "pe_ttm|PE terendah|pe_ttm > 0|-yield_ttm|yield TTM tertinggi|pe_ttm");
add("unit/compiler-out-of-enum", () => {
  const v = validateCompiled({
    intents: ["terbang", "screener", "screener", "kenapa-gerak", "dividen", "kalender", "obrolan"],
    screen: { metric: "harga_naik", direction: "asc", sector_word: "kripto" },
    hops: [{ from: "A", edge: "teleport", to: "B" }],
  }, "saham apa yang murah?");
  const p = v.plan;
  return !!p && p.intents.length === 3 && p.intents[0] === "screener" && p.screen === undefined && p.hops.length === 0
    && v.rejected.some((r) => r.includes("intent:terbang")) && v.rejected.some((r) => r.includes("screen.metric"))
    && v.rejected.some((r) => r.includes("hop.edge"));
}, (o) => o === true);
add("unit/compiler-ticker-liar", () => {
  const v = validateCompiled({ intents: ["fundamental"], tickers: ["ADRO", "ZZZZ"] }, "PE ADRO berapa?");
  return !!v.plan && v.plan.tickers.join(",") === "ADRO" && v.unverifiedTickers.includes("ZZZZ")
    && !v.plan.tickers.includes("ZZZZ");
}, (o) => o === true);
add("unit/compiler-tanpa-intent", () => validateCompiled({ intents: ["terbang"], tickers: ["ADRO"] }, "ADRO"), (o) => (o as { plan: unknown }).plan === null);
add("llm/compiler-fallback-offline", () => ask("saham bank yang paling murah?"), (o) => {
  const r = o as Run;
  return r.k.audit?.router === "heuristik" && !!r.k.audit?.intents?.includes("screener") && r.spent <= 2;
});

// — entity resolver v7: verifikasi Sectors wajib; kandidat halusinasi tidak pernah lolos —
add("unit/entity-verify", async () => {
  const { resolveEntity } = await import("../lib/entity.js");
  const get = async (ep: string) => {
    const sym = ep.match(/company\/report\/([A-Z]+)\?/)?.[1] ?? "";
    if (sym === "ZZZZ") throw new Error("Sectors 404");
    return { data: { symbol: `${sym}.JK`, company_name: `PT ${sym}`, overview: { sector: "retail", sub_sector: "retail-trade", market_cap: 5e13, listing_date: "2010-01-01" } }, seed: true };
  };
  const r = await resolveEntity(get as never, { name: "Indomaret", candidates: ["DNET", "ZZZZ"], relation: "jaringan toko" }, 2);
  return { hits: r.hits.map((h) => h.symbol), misses: r.misses.map((m) => m.symbol), ok: r.ok };
}, (o) => {
  const x = o as { hits: string[]; misses: string[]; ok: boolean };
  return x.hits.join(",") === "DNET" && x.misses.join(",") === "ZZZZ" && x.ok === true;
});
add("unit/entity-halusinasi", async () => {
  const { resolveEntity } = await import("../lib/entity.js");
  const get = async () => { throw new Error("Sectors 404"); };
  const r = await resolveEntity(get as never, { name: "BrandPalsu", candidates: ["ZZZZ", "YYYY"] }, 2);
  return { hits: r.hits.length, ok: r.ok };
}, (o) => {
  const x = o as { hits: number; ok: boolean };
  return x.hits === 0 && x.ok === false;
});
add("fitur/entitas-pemilik", () => ask("siapa induk ADRO?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { entitas?: { rows?: unknown[] } } | undefined;
  return !!r.k.audit?.intents?.includes("entitas") && json(r).includes("Alamtri") && json(r).includes("ownership")
    && (v?.entitas?.rows ?? []).length >= 1 && r.spent <= 1 && r.k.seed === true;
});
add("fitur/entitas-offline-jujur", () => ask("saham Indomaret apa?"), (o) => {
  const r = o as Run;
  return r.k.verdict === "data-kurang" && /tidak menebak|butuh LLM/i.test(json(r)) && !/AMRT|DNET/.test(json(r));
});

// — fitur generik untuk ticker apa pun —
add("fitur/autopsi-grup", () => ask("portofolio saya: BUMI 30 BRMS 30 ANTM 20 PTBA 20"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { groups?: { name: string; pct: number }[]; groupScore?: number } | undefined;
  const names = (v?.groups ?? []).map((g) => g.name).join("|");
  return (v?.groupScore ?? 0) > 0 && /Bumi/.test(names) && /MIND ID/.test(names);
});
add("fitur/banding", () => ask("banding ADRO vs PTBA"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { compare?: { ticker: string }[] } | undefined;
  return (v?.compare ?? []).length === 2 && json(r).includes("ADRO") && json(r).includes("PTBA") && !/ANTM/.test(json(r));
});
add("fitur/kalender-exdate", () => ask("ex-date BMRI kapan?"), (o) => {
  const r = o as Run;
  return json(r).includes("BMRI") && /Dividen\/ex-date|ex-date/.test(json(r)) && r.k.seed === true;
});
add("fitur/dividen", () => ask("yield SMAR aman?"), (o) => {
  const r = o as Run;
  return /sehat|waspada|indikasi-trap/.test(r.k.verdict) && json(r).includes("Yield terakhir") && !/ANTM/.test(json(r));
});
add("fitur/rumor-fomo", () => ask("SMAR mau ke 500?"), (o) => {
  const r = o as Run;
  return json(r).includes("FOMO") && json(r).includes("SMAR") && !/ANTM/.test(json(r));
});
add("fitur/dna-broker", () => ask("broker YP aman?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { radar?: { broker?: string } } | undefined;
  return v?.radar?.broker === "YP" && r.k.sitasi.some((s) => s.includes("broker-activity/YP"));
});
add("fitur/barang-divergence", () => ask("coal naik kok ADRO turun?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { sankey?: { nodes?: string[] } } | undefined;
  return (v?.sankey?.nodes ?? []).includes("commodity") && json(r).includes("ADRO") && !/ANTM/.test(json(r));
});
add("fitur/ihsg-bukan-ticker", () => ask("IHSG turun?"), (o) => {
  const r = o as Run;
  return !!r.k.audit?.intents?.includes("pasar") && !r.k.audit?.intents?.includes("kenapa-gerak") && r.k.subjek === undefined && r.k.verdict !== "data-kurang";
});
add("fitur/pasar-ihsg", () => ask("pasar lagi gimana?"), (o) => {
  const r = o as Run;
  return json(r).includes("IHSG") && !!r.k.audit?.intents?.includes("pasar");
});

// — disiplin: budget, grounding, determinisme, label SEED —
add("disiplin/budget≤6", async () => {
  const runs = await Promise.all([ask("kenapa BRMS naik?"), ask("broker YP aman?"), ask("coal naik kok ADRO turun?")]);
  return runs.map((r) => r.spent);
}, (o) => (o as number[]).every((n) => n <= 6));
add("disiplin/grounding-nol-karangan", () => ask("kenapa SMAR naik?"), (o) => {
  const r = o as Run;
  return r.k.audit?.grounded === true && r.k.narrator.includes("deterministik");
});
add("disiplin/sweep-grounding", async () => {
  const qs = [
    "kenapa SMAR naik?", "yield SMAR aman?", "ex-date BUMI kapan?", "broker YP aman?",
    "coal naik kok ADRO turun?", "nikel ANTM gimana?", "likuiditas BRMS gimana?", "risiko BUMI apa?",
    "SMAR mau ke 500?", "banding ADRO vs PTBA", "scan pagi", "kenapa ZZZZ naik?",
    "PE ANTM berapa?", "laba SMAR gimana?", "saham bank yang paling murah?",
  ];
  const out: { q: string; grounded: boolean; ungrounded: string[] }[] = [];
  for (const q of qs) {
    const r = await ask(q);
    out.push({ q, grounded: !!r.k.audit?.grounded, ungrounded: r.k.audit?.ungrounded ?? [] });
  }
  return out;
}, (o) => {
  const rows = o as { q: string; grounded: boolean; ungrounded: string[] }[];
  const bad = rows.filter((r) => !r.grounded);
  if (bad.length) console.error("sweep gagal:", JSON.stringify(bad));
  return bad.length === 0;
});
add("disiplin/seed-dilabeli", () => ask("kenapa BBCA turun?"), (o) => {
  const r = o as Run;
  return r.k.seed === true && r.k.kredit === "⚡ 0 kredit";
});

// — bagian awam (output 2 lapis: data faktual + penjelasan pelan-pelan) —
const BAD_ADVICE = /beli sekarang|jual semua|all in|pasti cuan|dijamin naik|wajib beli|harus beli|sebaiknya beli|sebaiknya jual/i;
const NADA = new Set(["baik", "hati", "netral"]);
const awamOk = (k: Awaited<ReturnType<typeof chat>>) => {
  const a = k.awam;
  if (!a?.bagian?.length || !a.pembuka || !a.penutup || !a.intisari) return false;
  return a.bagian.every((b) => b.istilah.trim() && b.arti.trim() && b.analogi.trim() && b.kondisi.trim() && NADA.has(b.nada)) && !BAD_ADVICE.test(JSON.stringify(a));
};
add("awam/dua-bagian-gerak", () => ask("kenapa SMAR naik?"), (o) => {
  const r = o as Run;
  const ist = (r.k.awam?.bagian ?? []).map((b) => b.istilah).join("|");
  return awamOk(r.k) && /Verdict/.test(ist) && /Kohort/.test(ist) && /FOMO/.test(ist) && r.k.bukti.length > 0 && r.k.sitasi.length > 0;
});
add("awam/banding", () => ask("banding ADRO vs PTBA"), (o) => {
  const r = o as Run;
  return awamOk(r.k) && (r.k.awam?.bagian ?? []).some((b) => b.istilah === "Banding dua saham");
});
add("awam/dividen+likuiditas", () => ask("yield SMAR aman dan likuid nggak?"), (o) => {
  const r = o as Run;
  const ist = (r.k.awam?.bagian ?? []).map((b) => b.istilah).join("|");
  return awamOk(r.k) && /Dividen & yield/.test(ist) && /Likuiditas/.test(ist) && !/ANTM/.test(json(r));
});
add("awam/bebas-nasihat-sweep", async () => {
  const qs = ["kenapa SMAR naik?", "yield SMAR aman?", "broker YP aman?", "coal naik kok ADRO turun?", "SMAR mau ke 500?", "risiko BUMI apa?", "scan pagi", "banding ADRO vs PTBA", "PE ANTM berapa?", "laba SMAR gimana?"];
  const out: { q: string; ok: boolean; bagian: number }[] = [];
  for (const q of qs) {
    const r = await ask(q);
    out.push({ q, ok: awamOk(r.k), bagian: r.k.awam?.bagian.length ?? 0 });
  }
  return out;
}, (o) => {
  const rows = o as { q: string; ok: boolean; bagian: number }[];
  const bad = rows.filter((r) => !r.ok || r.bagian < 2);
  if (bad.length) console.error("awam sweep gagal:", JSON.stringify(bad));
  return bad.length === 0;
});

add("disiplin/komoditas-luar-scope", () => ask("komoditas CPO gimana?"), (o) => {
  const r = o as Run;
  return r.k.verdict === "data-kurang" && /belum mengimplementasikan/i.test(json(r)) && !/mining\/commodities\/coal/.test(json(r)) && r.spent === 0;
});
add("llm/fallback-offline", () => ask("kenapa SMAR naik?"), (o) => {
  const r = o as Run;
  return (r.k.lanjutan?.length ?? 0) >= 2
    && /deterministik/.test(r.k.awamVia ?? "") && /deterministik/.test(r.k.counterVia ?? "")
    && r.k.audit?.grounded === true && !!r.k.counter;
});

add("fitur/screener-murah", () => ask("saham apa yang paling murah?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { screen?: { metric?: string; rows?: { symbol: string; disp?: string }[] } } | undefined;
  return !!r.k.audit?.intents?.includes("screener") && v?.screen?.metric === "pe_ttm" && (v.screen.rows ?? []).length >= 3
    && json(r).includes("PE (TTM)") && r.k.seed === true && r.spent <= 1;
});
add("fitur/screener-yield", () => ask("saham dengan dividen tertinggi?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { screen?: { orderBy?: string; label?: string; rows?: { symbol: string }[] } } | undefined;
  return v?.screen?.orderBy === "-yield_ttm" && v?.screen?.label === "yield TTM tertinggi" && (v.screen.rows ?? []).length >= 3 && r.k.audit?.intents?.length === 1;
});
add("fitur/screener-sektor", () => ask("saham bank yang paling murah?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { screen?: { where?: string; metric?: string; sector?: { field?: string; slug?: string }; rows?: unknown[] } } | undefined;
  return !!r.k.audit?.intents?.includes("screener") && v?.screen?.metric === "pe_ttm"
    && /sub_sector = 'banks'/.test(v?.screen?.where ?? "") && v?.screen?.sector?.slug === "banks"
    && (v.screen.rows ?? []).length >= 3 && r.spent <= 2 && r.k.seed === true;
});

// — fundamental: valuasi / kinerja kuartalan / segmen (report & financials dari Sectors) —
add("fitur/fundamental-valuasi", () => ask("PE ANTM berapa?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { fund?: { mode?: string; rows?: unknown[] } } | undefined;
  return !!r.k.audit?.intents?.includes("fundamental") && v?.fund?.mode === "valuasi"
    && (v.fund.rows ?? []).length >= 3 && json(r).includes("forward PE") && json(r).includes("ANTM")
    && r.spent <= 1 && r.k.seed === true;
});
add("fitur/fundamental-kinerja", () => ask("laba SMAR gimana?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { fund?: { mode?: string; rows?: unknown[] } } | undefined;
  return v?.fund?.mode === "kinerja" && (v.fund.rows ?? []).length >= 4
    && json(r).includes("financials/quarterly/SMAR") && json(r).includes("Pendapatan") && r.spent <= 5 && r.k.seed === true;
});
add("fitur/fundamental-segmen", () => ask("segmen pendapatan TLKM gimana?"), (o) => {
  const r = o as Run;
  const v = r.k.visual as { fund?: { mode?: string; rows?: unknown[] } } | undefined;
  return v?.fund?.mode === "segmen" && (v.fund.rows ?? []).length >= 3
    && json(r).includes("company/get-segments/TLKM") && json(r).includes("TLKM") && r.spent <= 1 && r.k.seed === true;
});

// — unit compute (murni) —
add("unit/divergence", () => JSON.stringify(computeBarang({ commodityPct12m: 12, volumePct: -20, topCountryShare: 0.68 })), (o) => /Divergence/.test(o as string) && /Exposure/.test(o as string) && /campuran|tak-didukung/.test(o as string));
add("unit/cluster-4sell", () => JSON.stringify(detectCluster([1, 2, 3, 5].map((d) => ({ sector: "bank", symbol: "A" + d, side: "sell" as const, atDaysAgo: d })))), (o) => /insider-cluster/.test(o as string));
add("unit/dna-repeat", () => JSON.stringify(fingerprintBroker("YP", [{ broker: "YP", symbol: "A", netBuy: -5, days: 10 }, { broker: "YP", symbol: "B", netBuy: -4, days: 20 }, { broker: "YP", symbol: "C", netBuy: 2, days: 30 }], { historyRepeat: 3 })), (o) => /distribusi/.test(o as string));

let pass = 0;
const fails: string[] = [];
for (const c of cases) {
  try {
    const out = await c.run();
    if (c.expect(out)) pass++;
    else fails.push(c.name + " (expect gagal)");
  } catch (e) {
    fails.push(c.name + " (exception: " + String((e as Error).message ?? e) + ")");
  }
}
const report = `# EVAL_REPORT.md — ARUS v7\n\n- Total: ${cases.length}\n- PASS: ${pass}\n- FAIL: ${fails.length}\n- Mode: SEED=1, tanpa SECTORS_API_KEY, tanpa OPENROUTER_API_KEY (offline, 0 kredit)\n- Assertion menguji subjek/ticker, multi-intent, visual, budget, grounding, label SEED, validator compiler — bukan substring kosong\n\n## FAIL\n${fails.length ? fails.map((f) => `- ${f}`).join("\n") : "- (tidak ada)"}\n`;
fs.writeFileSync("EVAL_REPORT.md", report);
console.log(report);
if (fails.length) process.exit(1);