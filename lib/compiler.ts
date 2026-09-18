// lib/compiler.ts — query compiler v7: LLM memahami bahasa, kode memvalidasi.
// Satu panggilan → JSON; validator murni (enum intent, ticker pesan/portofolio, mode fundamental,
// metric screener, kata sektor, kandidat entitas, edge hop). Gagal / tanpa key → null;
// pemanggil memakai fallback heuristik v6 (0 kredit). LLM tidak pernah dieksekusi tanpa validasi.
import type { Intent } from "./router.js";
import { FUND_MODES, type FundMode } from "./fundamental.js";
import { SCREEN_METRICS, defaultDirection, knownSectorWord, type ScreenMetric } from "./screener.js";
import { askLLM } from "./synthesis.js";

export const COMPILER_INTENTS: Intent[] = [
  "kenapa-gerak", "rumor", "risiko", "dividen", "kalender", "likuiditas", "banding", "autopsi",
  "barang", "dna", "kuasa", "pagi", "pasar", "screener", "fundamental", "entitas", "rantai", "obrolan",
];
export const EDGES = ["ownership", "affiliate", "contractor", "buyer", "segment", "group"] as const;
export type Edge = (typeof EDGES)[number];

export const MAX_INTENTS = 3;
export const MAX_ENTITIES = 2;
export const MAX_CANDIDATES = 3;
export const MAX_HOPS = 3;

export interface CompiledEntity { name: string; candidates: string[]; relation?: string }
export interface CompiledScreen { metric: ScreenMetric; direction: "asc" | "desc"; criteria?: string; sectorWord?: string }
export interface CompiledHop { from: string; edge: Edge; to: string }
export interface CompiledCommodity { word: string; slugCandidates: string[] }
export interface Compiled {
  intents: Intent[];
  tickers: string[];
  entities: CompiledEntity[];
  fundamentalMode?: FundMode;
  screen?: CompiledScreen;
  commodity?: CompiledCommodity;
  hops: CompiledHop[];
  brokerCode?: string;
  note?: string;
  verified?: string[];
}

export interface Validation {
  plan: Compiled | null;
  rejected: string[];
  unverifiedTickers: string[];
}

const TICKER = /^[A-Z]{4}$/;
const slugLike = (x: string) => /^[a-z0-9-]{2,40}$/.test(x);
const asString = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const asArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

const SYSTEM = `Kamu ARUS Query Compiler: menerjemahkan pertanyaan investor ritel IDX menjadi JSON untuk dieksekusi kode.
Keluarkan HANYA JSON valid, tanpa penjelasan di luar JSON:
{"intents":[],"tickers":[],"entities":[],"fundamental_mode":"","broker_code":"","screen":null,"commodity":null,"hops":[],"alasan":""}

Aturan:
- intents: 1-3 dari daftar ini, urut prioritas: kenapa-gerak, rumor, risiko, dividen, kalender, likuiditas, banding, autopsi, barang, dna, kuasa, pagi, pasar, screener, fundamental, entitas, rantai, obrolan. Pertanyaan majemuk ("kenapa naik dan ex-date kapan?") → 2-3 intent.
  · entitas: user menyebut brand/nama perusahaan/anak usaha TANPA ticker (contoh: "saham Indomaret apa?") — kandidat emiten masuk ke entities, bukan tickers.
  · rantai: pertanyaan berlapis relasi grup/hulu-hilir/konglomerasi (contoh: "kalau coal jatuh, siapa di grup ADRO yang paling kena?").
  · fundamental: valuasi (PE/PB), laba/pendapatan, segmen, prospek, direksi, atau peer SATU emiten.
- tickers: HANYA ticker 4 huruf yang user benar-benar tulis (atau ada di portofolio tersimpan). JANGAN mengarang ticker.
- entities: maks 2. Tiap item {"name","candidates","relation"}; candidates = maks 3 ticker 4 huruf dari pengetahuanmu, urut paling yakin. ARUS akan memverifikasi kandidat ke Sectors — jangan menebak asal-asalan.
- fundamental_mode: salah satu valuasi|kinerja|tahunan|segmen|prospek|manajemen|peer|tentang (isi bila intent fundamental).
- screen: null bila tidak menyaring daftar. Bila ya: {"criteria","metric","direction","sector_word"}; metric salah satu pe_ttm|pb_mrq|yield_ttm|roe_ttm|der_mrq|market_cap|yoy_quarter_earnings_growth; direction "asc" (terendah/termurah) atau "desc" (tertinggi/termahal); sector_word hanya kata sektor umum (bank, tambang, semen, ritel, telekomunikasi, …) atau "".
- broker_code: 2 huruf kapital, hanya bila user menyebut kode broker/bandar (contoh YP).
- commodity: {"word","slug_candidates"} bila relevan (contoh {"word":"coal","slug_candidates":["coal"]}); selain itu null.
- hops: maks 3 item {"from","edge","to"}; edge salah satu ownership|affiliate|contractor|buyer|segment|group. Isi bila intent rantai.
- alasan: maks 120 karakter.`;

export function validateCompiled(raw: unknown, q: string, ctx: { known?: string[] } = {}): Validation {
  const rejected: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const intentsRaw = asArray(o.intents).map(asString).filter(Boolean);
  const intents = [...new Set(intentsRaw.filter((x) => (COMPILER_INTENTS as string[]).includes(x)))]
    .slice(0, MAX_INTENTS) as Intent[];
  for (const x of intentsRaw) if (!(COMPILER_INTENTS as string[]).includes(x)) rejected.push(`intent:${x}`);
  if (!intents.length) return { plan: null, rejected, unverifiedTickers: [] };

  const known = new Set((ctx.known ?? []).map((t) => t.toUpperCase()));
  const tickers: string[] = [];
  const unverifiedTickers: string[] = [];
  for (const x of asArray(o.tickers)) {
    const t = asString(x).toUpperCase();
    if (!TICKER.test(t) || tickers.includes(t)) { if (t) rejected.push(`ticker:${t}`); continue; }
    if (new RegExp(`\\b${t}\\b`, "i").test(q) || known.has(t)) tickers.push(t);
    else { unverifiedTickers.push(t); rejected.push(`ticker-tak-terverifikasi:${t}`); }
  }

  const entities: CompiledEntity[] = [];
  for (const x of asArray(o.entities).slice(0, MAX_ENTITIES)) {
    if (!x || typeof x !== "object") { rejected.push("entity:bukan-objek"); continue; }
    const e = x as Record<string, unknown>;
    const name = asString(e.name).slice(0, 60);
    const candidates = [...new Set(asArray(e.candidates).map((c) => asString(c).toUpperCase()).filter((c) => TICKER.test(c)))]
      .slice(0, MAX_CANDIDATES);
    if (!name || !candidates.length) { rejected.push(`entity:${name || "tanpa-nama"}`); continue; }
    const relation = asString(e.relation).slice(0, 80) || undefined;
    entities.push({ name, candidates, relation });
  }

  const fm = asString(o.fundamental_mode);
  const fundamentalMode = (FUND_MODES as string[]).includes(fm) ? (fm as FundMode) : undefined;
  if (fm && !fundamentalMode) rejected.push(`fundamental_mode:${fm}`);

  let screen: CompiledScreen | undefined;
  if (o.screen && typeof o.screen === "object") {
    const s = o.screen as Record<string, unknown>;
    const metric = asString(s.metric) as ScreenMetric;
    if ((SCREEN_METRICS as string[]).includes(metric)) {
      const direction = s.direction === "asc" || s.direction === "desc" ? s.direction : defaultDirection(metric);
      const swRaw = asString(s.sector_word);
      const sectorWord = swRaw ? knownSectorWord(swRaw) : null;
      if (swRaw && !sectorWord) rejected.push(`sector_word:${swRaw.slice(0, 24)}`);
      screen = { metric, direction, criteria: asString(s.criteria).slice(0, 90) || undefined, sectorWord: sectorWord ?? undefined };
    } else if (metric) rejected.push(`screen.metric:${metric}`);
  }

  let commodity: CompiledCommodity | undefined;
  if (o.commodity && typeof o.commodity === "object") {
    const c = o.commodity as Record<string, unknown>;
    const word = asString(c.word).toLowerCase().slice(0, 24);
    if (word) {
      const slugCandidates = [...new Set(asArray(c.slug_candidates).map((x) => asString(x).toLowerCase()).filter(slugLike))].slice(0, 4);
      commodity = { word, slugCandidates };
    }
  } else if (asString(o.commodity)) {
    commodity = { word: asString(o.commodity).toLowerCase().slice(0, 24), slugCandidates: [] };
  }

  const hops: CompiledHop[] = [];
  for (const x of asArray(o.hops).slice(0, MAX_HOPS)) {
    if (!x || typeof x !== "object") { rejected.push("hop:bukan-objek"); continue; }
    const h = x as Record<string, unknown>;
    const from = asString(h.from).slice(0, 40);
    const to = asString(h.to).slice(0, 40);
    const edge = asString(h.edge) as Edge;
    if (!from || !to) { rejected.push("hop:tidak-lengkap"); continue; }
    if (!(EDGES as readonly string[]).includes(edge)) { rejected.push(`hop.edge:${edge}`); continue; }
    hops.push({ from, edge, to });
  }

  const broker = asString(o.broker_code).toUpperCase();
  const brokerCode = /^[A-Z]{2}$/.test(broker) ? broker : undefined;
  const note = asString(o.alasan).slice(0, 120) || undefined;

  return {
    plan: { intents, tickers, entities, fundamentalMode, screen, commodity, hops, brokerCode, note: note || undefined },
    rejected,
    unverifiedTickers,
  };
}

export interface CompileOpts { verifyTicker?: (t: string) => Promise<string | null> }

/** LLM primer: 1 call → JSON → validator. Null = pemanggil pakai fallback heuristik (0 kredit). */
export async function compileQuery(q: string, ctx: { known?: string[] } = {}, opts: CompileOpts = {}): Promise<Compiled | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const user = `Konteks portofolio tersimpan: ${JSON.stringify((ctx.known ?? []).slice(0, 10))}\nPesan: "${q}"`;
  const raw = await askLLM(SYSTEM, user, 20_000);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  const v = validateCompiled(parsed, q, ctx);
  if (!v.plan) return null;
  if (opts.verifyTicker && v.unverifiedTickers.length) {
    const t = v.unverifiedTickers[0]!;
    const note = await opts.verifyTicker(t).catch(() => null);
    if (note) {
      v.plan.tickers.push(t);
      (v.plan.verified ??= []).push(note);
    }
  }
  return v.plan;
}