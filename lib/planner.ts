// lib/planner.ts — v7: SATU otak bahasa.
//   (1) compiler LLM (compiler.ts) = primer: 1 call → JSON tervalidasi. Saat hasil valid, heuristik TIDAK
//       menempelkan intent tambahan (regresi v6: "siapa direksi ASII?" kena bocoran kuasa).
//   (2) heuristik keyword v6 = jaring pengaman: hidup hanya bila LLM absen/invalid/keluar enum (0 kredit).
import { parseRanking, route, type Intent } from "./router.js";
import { brokerCodes, plausibleTickers } from "./resolve.js";
import { compileQuery, type CompiledEntity, type CompiledHop, type CompiledRanking, type CompiledScreen, type CompileOpts } from "./compiler.js";
import type { FundMode } from "./fundamental.js";

const MAX_INTENTS = 3;

export interface Plan {
  intents: Intent[];
  tickers: string[];
  brokerCode?: string;
  commodity?: { word: string; slugCandidates: string[] };
  ranking?: CompiledRanking;
  entities?: CompiledEntity[];
  fundamentalMode?: FundMode;
  screen?: CompiledScreen;
  hops?: CompiledHop[];
  source: "llm" | "llm+verifikasi" | "heuristik";
  note?: string;
}

const INTENT_PATTERNS: Record<Exclude<Intent, "kenapa-gerak" | "obrolan" | "entitas" | "rantai">, RegExp> = {
  rumor: /pompom|mau ke|katanya|betul\?|diserok|bakal terbang|terbang/,
  risiko: /risiko|panik|anjlok|nyangkut|merah|takut|drawdown/,
  dividen: /yield|dividen|dividend|trap|payout/,
  kalender: /ex-?date|ex date|agm|rups|stock split|warrant/,
  likuiditas: /likuid|free float|volume/,
  banding: /banding|bandingkan|dibanding|komparasi|\bvs\b/,
  autopsi: /autopsi|bedah|portofolio|porto|diversif|sebaran/,
  barang: /coal|batubara|batu bara|nikel|nickel|tambang|komoditas|mining|smelter/,
  dna: /broker|bandar/,
  kuasa: /insider|cluster|rights issue|right issue|rights|direksi (jual|beli|lepas)|komisaris (jual|beli|lepas)/,
  pagi: /scan pagi|anomali|brief|pagi ini|sebelum buka/,
  pasar: /pasar|ihsg|market|indeks|index/,
  screener: /screener|saring|daftar saham|saham apa/,
  fundamental: /fundamental|valuasi|valuation|\bpe\b|\bpb\b|\broe\b|\bder\b|\beps\b|\bmurah\b|\bmahal\b|margin|laba|pendapatan|revenue|ekuitas|\butang\b|kinerja|kuartal|\bsegmen\b|segmentasi|prospek|\banalis\b|\bmanajemen\b|\bpeer\b|pesaing|tahunan|historis|profil/,
};

/** Jaring pengaman deterministik v6. Bisa mengembalikan >1 intent dengan urutan prioritas. */
export function heuristicPlan(q: string, ctx: { portfolio?: string[]; watchlist?: string[] } = {}): Plan {
  const s = q.toLowerCase();
  const tickers = plausibleTickers(q);
  const primary = route(q, tickers);
  const intents: Intent[] = [primary];
  if (tickers.length && /kenapa|naik|turun|gerak|melemah|menguat|anjlok/.test(s) && primary !== "kenapa-gerak") intents.push("kenapa-gerak");
  for (const [name, re] of Object.entries(INTENT_PATTERNS) as [Intent, RegExp][]) {
    if (primary === "screener") break; // screener sudah final: pertanyaan "saham apa yang …" tidak perlu intent ticker
    if (intents.length >= MAX_INTENTS) break;
    if (name === primary) continue;
    if (re.test(s)) intents.push(name);
  }
  return {
    intents, tickers,
    brokerCode: brokerCodes(q)[0],
    commodity: /nikel|nickel/i.test(s) ? { word: "nickel", slugCandidates: [] } : /coal|batubara|batu bara|tambang/i.test(s) ? { word: "coal", slugCandidates: [] } : undefined,
    ranking: primary === "pasar" ? parseRanking(q) ?? undefined : undefined,
    source: "heuristik",
  };
}

/** LLM primer → validasi; fallback heuristik utuh bila LLM absen/invalid. Ticker deterministik pesan selalu digabung. */
export async function planQuery(
  q: string,
  ctx: { portfolio?: string[]; watchlist?: string[] } = {},
  opts: CompileOpts = {},
): Promise<Plan> {
  const h = heuristicPlan(q, ctx);
  const known = [...(ctx.portfolio ?? []), ...(ctx.watchlist ?? [])];
  const c = await compileQuery(q, { known }, opts);
  if (!c) return h;
  const tickers = [...new Set([...c.tickers, ...plausibleTickers(q)])];
  return {
    intents: c.intents,
    tickers,
    brokerCode: c.brokerCode ?? (c.intents.includes("dna") ? brokerCodes(q)[0] : undefined),
    commodity: c.commodity ?? (c.intents.includes("barang") ? h.commodity : undefined),
    ranking: c.ranking ?? (c.intents.includes("pasar") ? h.ranking : undefined),
    entities: c.entities.length ? c.entities : undefined,
    fundamentalMode: c.fundamentalMode,
    screen: c.screen,
    hops: c.hops.length ? c.hops : undefined,
    source: c.verified?.length ? "llm+verifikasi" : "llm",
    note: [c.note, ...(c.verified ?? [])].filter(Boolean).join(" · ") || undefined,
  };
}