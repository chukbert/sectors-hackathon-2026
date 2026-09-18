// lib/planner.ts — DUA router, satu keputusan:
//   (1) heuristik keyword (selalu jalan, 0 biaya, dasar fallback), (2) LLM planner via OpenRouter (multi-intent).
// LLM TIDAK boleh mengarang ticker: hasilnya divalidasi — ticker harus muncul di pesan atau di portofolio tersimpan.
// Tanpa OPENROUTER_API_KEY → heuristik saja (deterministik, eval aman).
import { route, type Intent } from "./router.js";
import { brokerCodes, plausibleTickers } from "./resolve.js";

export const ALLOWED: Intent[] = ["kenapa-gerak", "rumor", "risiko", "dividen", "kalender", "likuiditas", "banding", "autopsi", "barang", "dna", "kuasa", "pagi", "pasar", "screener", "fundamental", "obrolan"];
const MAX_INTENTS = 3;
const EFFORT = process.env.OPENROUTER_REASONING_EFFORT ?? "xhigh";

export interface Plan {
  intents: Intent[];
  tickers: string[];
  brokerCode?: string;
  commodity?: "coal" | "nickel";
  source: "llm+heuristik" | "heuristik";
  note?: string;
}

const INTENT_PATTERNS: Record<Exclude<Intent, "kenapa-gerak" | "obrolan">, RegExp> = {
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

/** Router 1: heuristik. Bisa mengembalikan >1 intent (multi-intent) dengan urutan prioritas. */
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
    commodity: /nikel|nickel/i.test(s) ? "nickel" : /coal|batubara|batu bara|tambang/i.test(s) ? "coal" : undefined,
    source: "heuristik",
  };
}

const SYSTEM = `Kamu router ARUS, asisten riset saham IDX. Klasifikasi pertanyaan user Bahasa Indonesia.
Keluarkan HANYA JSON: {"intents":["..."],"tickers":["..."],"broker_code":"","commodity":"","alasan":"..."}
Aturan:
- intents: 1-3 dari daftar ini, urut prioritas: ${ALLOWED.join(", ")}. Pertanyaan majemuk ("kenapa naik dan ex-date kapan?") → 2-3 intent.
- tickers: HANYA ticker 4 huruf yang benar-benar tertulis user (huruf besar), jangan mengarang.
- broker_code: kode broker 2 huruf bila user menyebut broker/bandar (mis. YP). Kosongkan bila tidak ada.
- commodity: "coal"|"nickel" bila relevan.
- "fundamental" bila user menanyakan valuasi (PE/PB), laba/pendapatan, segmen, prospek analis, direksi, atau peer satu emiten (butuh ticker).
- "autopsi" bila user minta bedah portofolio; "banding" bila membandingkan ≥2 saham; "obrolan" bila sapaan/pertanyaan umum tanpa data.`;

async function llmPlan(q: string, ctx: { known: string[] }): Promise<Plan | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const model = process.env.OPENROUTER_MODEL ?? "meta/muse-spark-1.2";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "ARUS planner" },
      body: JSON.stringify({
        model, temperature: 0,
        reasoning: { effort: EFFORT },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Konteks portofolio tersimpan: ${JSON.stringify(ctx.known.slice(0, 10))}\nPesan: "${q}"` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "").trim()) as { intents?: unknown; tickers?: unknown; broker_code?: unknown; commodity?: unknown; alasan?: unknown };
    const inMsg = (t: string) => new RegExp(`\\b${t}\\b`, "i").test(q);
    const intents = (Array.isArray(parsed.intents) ? parsed.intents : [])
      .map((x) => String(x) as Intent)
      .filter((x) => (ALLOWED as string[]).includes(x))
      .slice(0, MAX_INTENTS);
    const tickers = (Array.isArray(parsed.tickers) ? parsed.tickers : [])
      .map((x) => String(x).toUpperCase())
      .filter((t) => /^[A-Z]{4}$/.test(t))
      .filter((t) => inMsg(t) || ctx.known.map((k) => k.toUpperCase()).includes(t));
    if (!intents.length) return null;
    return {
      intents, tickers,
      brokerCode: typeof parsed.broker_code === "string" && /^[A-Za-z]{2}$/.test(parsed.broker_code) ? parsed.broker_code.toUpperCase() : undefined,
      commodity: parsed.commodity === "coal" || parsed.commodity === "nickel" ? parsed.commodity : undefined,
      source: "llm+heuristik",
      note: typeof parsed.alasan === "string" ? parsed.alasan.slice(0, 120) : undefined,
    };
  } catch {
    return null;
  }
}

/** Ensemble: heuristik selalu dihitung; LLM menambah/mengurutkan; ticker divalidasi ulang. */
export async function planQuery(q: string, ctx: { portfolio?: string[]; watchlist?: string[] } = {}): Promise<Plan> {
  const h = heuristicPlan(q, ctx);
  const known = [...(ctx.portfolio ?? []), ...(ctx.watchlist ?? [])];
  const l = await llmPlan(q, { known });
  if (!l) return h;
  const intents = [...l.intents, ...h.intents.filter((i) => !l.intents.includes(i))].slice(0, MAX_INTENTS);
  const tickers = [...l.tickers.filter((t) => !h.tickers.includes(t)), ...h.tickers];
  return {
    intents, tickers,
    brokerCode: l.brokerCode ?? h.brokerCode,
    commodity: l.commodity ?? h.commodity,
    source: "llm+heuristik",
    note: l.note,
  };
}