import { decide, choiceOf } from "@/lib/llm/jev";
import type { DecisionTrace, Slots } from "@/lib/agent/types";

export type LevelVerdict = {
  level: number;
  ruleLevel: number;
  jevLevel: number | null;
  reasons: string[];
  trace: DecisionTrace[];
};

const SIGNALS: Array<{ level: number; patterns: RegExp[]; reason: string }> = [
  { level: 10, patterns: [/riset lengkap/i, /dossier/i, /semua aspek/i, /layak (gak|tidak|nggak)?\s*(buat|untuk)?\s*(investasi|beli|jangka panjang)/i, /keputusan (investasi|beli)/i, /analisis menyeluruh/i, /sebelum (beli|investasi)/i], reason: "permintaan riset keputusan menyeluruh" },
  { level: 9, patterns: [/valuasi/i, /murah|mahal/i, /wajar/i, /value trap/i, /skenario/i, /target harga/i, /intrinsic/i, /overvalue|undervalue/i, /harga pantas/i, /pbv|per\b/i, /proyeksi|prospek|forecast|rating analis|konsensus/i], reason: "valuasi, proyeksi & skenario" },
  { level: 8, patterns: [/bandarmo|bandar/i, /akumulasi|distribusi/i, /broker/i, /net (buy|sell)/i, /asing/i, /foreign/i, /smart money/i, /gorengan/i, /likuiditas/i], reason: "bandarmologi / aliran dana" },
  { level: 7, patterns: [/katanya|kabarnya|isunya/i, /benar (gak|ga|tidak|nggak|engga)/i, /hoax|hoaks/i, /rumor|rumour/i, /beneran/i, /cek fakta/i, /screenshot/i, /link/i, /viral/i, /di (twitter|x|telegram|tiktok)/i], reason: "verifikasi klaim/rumor" },
  { level: 6, patterns: [/margin|arus kas|payout|laba bersih/i, /fundamental/i, /sehat (gak|ga|tidak|nggak|engga)/i, /laporan keuangan|lk\b/i, /kinerja keuangan/i, /hutang|utang/i, /profit|laba/i, /pendapatan|revenue/i, /ekuitas/i, /roe|roa|der/i, /dividen.*(aman|sehat)/i], reason: "fundamental menyeluruh" },
  { level: 5, patterns: [/vs\b|versus/i, /banding/i, /dibanding/i, /mana yang (lebih )?baik/i, /pilih mana/i, /sebanding/i, /pemain utama|pemain terbesar|pangsa pasar/i], reason: "perbandingan sejajar" },
  { level: 4, patterns: [/tren|trend/i, /perkembangan/i, /sebulan|3 bulan|6 bulan|1 tahun|setahun/i, /sejarah|historis/i, /pertumbuhan/i, /cagr/i, /naiknya dari/i], reason: "tren & turunan" },
  { level: 3, patterns: [/berita|news|sentimen/i, /ringkas/i, /rangkum/i, /update/i, /kabar terbaru/i, /jadwal|kalender|agenda/i, /dividen.*(kapan|jadwal|ex)/i, /ipo/i, /rups/i, /suspensi|disuspen/i], reason: "ringkasan terarah" },
  { level: 2, patterns: [/kenapa|mengapa|kok/i, /artinya|maksudnya|apa maksud/i, /dampak|pengaruh/i, /bagus (gak|ga|tidak|nggak)?\??$/i, /gimana|bagaimana/i, /apakah.*(bagus|berdampak)/i], reason: "fakta + makna" },
  { level: 1, patterns: [/berapa|harga|price|close/i, /kapitalisasi|market cap/i, /volume/i, /per\b|pe\b|pbv/i, /dividen.*(berapa|nominal|nilai)/i, /siapa/i, /kapan/i], reason: "fakta tunggal" },
];

export function classifyByRules(question: string, slots: Slots): { level: number; reasons: string[] } {
  let level = 1;
  const reasons: string[] = [];
  for (const signal of SIGNALS) {
    if (signal.patterns.some((p) => p.test(question))) {
      if (signal.level > level) level = signal.level;
      reasons.push(signal.reason);
    }
  }
  if (slots.isRumor && level < 7) {
    level = 7;
    reasons.push("indikasi klaim/rumor");
  }
  if (slots.wantsAdvice && level < 7) {
    level = 7;
    reasons.push("permintaan rekomendasi → diperlakukan sebagai verifikasi");
  }
  if (slots.isComparison && level < 5) {
    level = 5;
    reasons.push("perbandingan multi-emiten");
  }
  if (slots.symbols.length >= 3 && level < 5) {
    level = 5;
    reasons.push("≥3 emiten");
  }
  if (question.trim().length < 25 && slots.symbols.length === 1 && level < 3) {
    reasons.push("pertanyaan singkat 1 emiten");
  }
  const screeningIntent = /carikan|screening|filter|daftar saham|saham dengan|saham apa|top gainer|top loser|paling (naik|turun|ramai|aktif)/i.test(question);
  const flowIntent = /broker|bandar|akumulasi|distribusi|asing|foreign|net (buy|sell)|aliran dana/i.test(question);
  if (screeningIntent && !flowIntent && !slots.isRumor && !slots.wantsAdvice) {
    if (level > 4) {
      level = 4;
      reasons.push("niat screener → kedalaman dibatasi L4");
    } else if (level < 3) {
      level = 3;
      reasons.push("niat screener → minimal L3");
    }
  }
  return { level, reasons };
}

export function appliedScreenerCap(question: string): boolean {
  const screening = /carikan|screening|filter|daftar saham|saham dengan|saham apa|top gainer|top loser|paling (naik|turun|ramai|aktif)/i.test(question);
  const flow = /broker|bandar|akumulasi|distribusi|asing|foreign|net (buy|sell)|aliran dana/i.test(question);
  return screening && !flow;
}

export async function classifyLevel(
  question: string,
  slots: Slots,
  ledgerSummary: string,
  meta: { sessionId: string; turnId: string },
): Promise<LevelVerdict> {
  const rules = classifyByRules(question, slots);
  const traces: DecisionTrace[] = [];
  let jevLevel: number | null = null;
  const state: Record<string, unknown> = {
    question,
    entities: slots.symbols,
    comparison: slots.isComparison,
    rumor_like: slots.isRumor,
    wants_recommendation: slots.wantsAdvice,
    session_ledger: ledgerSummary.slice(-1200),
    level_definitions: {
      L1: "single fact lookup (price, market cap, one ratio)",
      L2: "one fact plus meaning/why",
      L3: "directed summary (news, calendar, sentiment)",
      L4: "derived trend / growth over time",
      L5: "side-by-side comparison of companies",
      L6: "comprehensive fundamental health",
      L7: "claim/rumor verification with evidence",
      L8: "bandarmologi: broker & foreign flow",
      L9: "valuation & scenario analysis",
      L10: "full decision research dossier",
    },
  };
  try {
    const res = await decide(
      state,
      {
        level: {
          type: "choice",
          instructions: "Pick the single analysis depth level required by `question`, given `level_definitions`. Multi-part or decision-grade questions need a higher level. Use session_ledger only to resolve follow-up references.",
          criteria: {
            L1: "One concrete data point, no interpretation requested",
            L2: "One data point plus explanation of meaning/cause",
            L3: "Summary of news/calendar/events for one entity",
            L4: "Trend/changes over a period",
            L5: "Comparison between two or more entities",
            L6: "Full fundamental picture (financial statements health)",
            L7: "User carries a claim/rumor/advice request that must be checked against data",
            L8: "Ownership/flow analysis (brokers, foreign, accumulation)",
            L9: "Is it cheap/expensive, fair value, scenarios",
            L10: "Decision-grade dossier covering multiple dimensions",
          },
        },
      },
      { position: "level_classifier", sessionId: meta.sessionId, turnId: meta.turnId },
    );
    const picked = choiceOf(res.answers.level, "L1");
    const parsed = Number(picked.value.replace(/[^0-9]/g, ""));
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 10 && picked.confidence >= 0.55) jevLevel = parsed;
    traces.push({ position: "level_classifier", model: res.model, outcome: `${picked.value} (conf ${picked.confidence.toFixed(2)})`, confidence: picked.confidence, costUsd: res.costUsd });
  } catch (err) {
    traces.push({ position: "level_classifier", model: "fallback", outcome: `gagal: ${err instanceof Error ? err.message.slice(0, 80) : "error"}`, confidence: 0, costUsd: 0 });
  }
  const level = Math.max(rules.level, jevLevel ?? 0);
  return { level, ruleLevel: rules.level, jevLevel, reasons: rules.reasons, trace: traces };
}