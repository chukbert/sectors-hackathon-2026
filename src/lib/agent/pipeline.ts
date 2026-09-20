import { decide, choiceOf, noulOf, type JevQuestion } from "@/lib/llm/jev";
import { extractSlots, looksFinancial, rememberSymbol } from "@/lib/agent/slots";
import { appliedScreenerCap, classifyByRules } from "@/lib/agent/classifier";
import { buildDigest } from "@/lib/agent/digest";
import { planTurn } from "@/lib/agent/planner";
import { govern } from "@/lib/agent/tools";
import { resolveEndpoint, SectorsError, type ResolveResult } from "@/lib/sectors/client";
import { buildSections, toFactRef } from "@/lib/agent/compiler";
import { narrate } from "@/lib/agent/narrator";
import { verifyNarration, codeComplianceCheck } from "@/lib/agent/verify";
import { answerDocSchema, type Block, type AnswerDoc, type Evidence } from "@/lib/output/answerdoc";
import { appendTurn, latestAnswedoc, ledgerLines, memoryDigest, nextSeq, putMemory, updateSessionLevelMax } from "@/lib/db/session-store";
import { langMode } from "@/lib/util/format";
import { shortId } from "@/lib/util/ids";
import { spentToday } from "@/lib/db/api-hit-store";
import { getMode } from "@/lib/db/api-hit-store";
import { todayJakarta } from "@/lib/util/time";
import type { AgentTurnInput, DecisionTrace, PlanStep } from "@/lib/agent/types";

export type TurnResult = {
  doc: AnswerDoc;
  events: Array<{ phase: string; message: string; detail?: string }>;
};

function ledgerSummary(sessionId: string, beforeSeq: number): string {
  const lines = ledgerLines(sessionId, beforeSeq);
  if (!lines.length) return "";
  return lines
    .map((l) => `#${l.seq} [L${l.level ?? "?"}] Q: ${l.question.slice(0, 160)} → ${l.conclusion.slice(0, 160)}${l.corrections ? ` (koreksi: ${l.corrections})` : ""} | fakta: ${l.facts.slice(0, 6).join(", ")}`)
    .join("\n");
}

function conclusionSummary(doc: AnswerDoc): string {
  return doc.conclusion.menengah.replace(/\{\{f:[^}]+\}\}/g, "").slice(0, 240);
}

export async function runTurn(input: AgentTurnInput): Promise<TurnResult> {
  const events: TurnResult["events"] = [];
  const emit = (phase: string, message: string, detail?: string) => {
    const e = { phase, message, detail };
    events.push(e);
    input.emit?.(e);
  };
  const turnId = shortId("trn");
  const mode = getMode();
  const beforeSeq = nextSeq(input.sessionId);
  const ledger = ledgerSummary(input.sessionId, beforeSeq);
  const memory = memoryDigest();
  const langDefault = langMode(input.langMode);

  emit("guard", "Memeriksa pertanyaan & konteks sesi");
  let guardLevel = 0;
  const guardQuestions: Record<string, JevQuestion> = {
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
    wants_recommendation: { type: "noul", instructions: "The user asks for a buy/sell call, price target, or guaranteed profit." },
    rumor: { type: "noul", instructions: "The question quotes or implies a claim/rumor about a stock's future performance that needs verification." },
    in_scope: { type: "noul", instructions: "The question is about Indonesian equities, IDX market data, company fundamentals, or related financial data. Off-topic chat (weather, coding, personal advice) is NOT in scope." },
  };
  const guardState = {
    question: input.question,
    entities: [],
    session_ledger: ledger.slice(-1200),
    level_definitions: {
      L1: "single fact lookup",
      L2: "fact plus meaning",
      L3: "directed summary",
      L4: "derived trend",
      L5: "comparison",
      L6: "comprehensive fundamental",
      L7: "claim verification",
      L8: "bandarmologi",
      L9: "valuation & scenario",
      L10: "decision dossier",
    },
  };
  let wantsRecommendation = false;
  let rumor = false;
  let inScope = true;
  try {
    const guard = await decide(guardState, guardQuestions, { position: "input_guard", sessionId: input.sessionId, turnId });
    const lvl = choiceOf(guard.answers.level, "L1");
    const parsed = Number(lvl.value.replace(/[^0-9]/g, ""));
    if (Number.isFinite(parsed) && lvl.confidence >= 0.55) guardLevel = parsed;
    wantsRecommendation = noulOf(guard.answers.wants_recommendation, false).value;
    rumor = noulOf(guard.answers.rumor, false).value;
    inScope = noulOf(guard.answers.in_scope, true).value;
    emit("guard", `Guardrail: level L${guardLevel || 1}, rumor=${rumor ? "ya" : "tidak"}, minta anjuran=${wantsRecommendation ? "ya" : "tidak"}`);
  } catch (err) {
    emit("guard", `Guardrail Jev gagal (${err instanceof Error ? err.message.slice(0, 60) : "error"}); lanjut dengan aturan kode`);
  }

  const slots = await extractSlots(input.question);
  if (rumor && !slots.isRumor) slots.isRumor = true;
  if (wantsRecommendation && !slots.wantsAdvice) slots.wantsAdvice = true;
  const explicitEntity = slots.symbols.length > 0 && !slots.symbolsFromMemory;
  const financeScope = looksFinancial(input.question) || explicitEntity || slots.indexCode !== null || slots.commodity !== null;
  const scoped = financeScope;

  const ruleLevel = classifyByRules(input.question, slots).level;
  let level = Math.max(ruleLevel, guardLevel || 0, rumor ? 7 : 0, wantsRecommendation ? 7 : 0);
  if (appliedScreenerCap(input.question) && !rumor && !wantsRecommendation && level > 4) {
    level = 4;
  }
  emit("level", `Level L${level} (aturan L${ruleLevel}${guardLevel ? `, Jev L${guardLevel}` : ""})`, slots.symbols.length ? `Emiten: ${slots.symbols.join(", ")}` : undefined);

  if (!scoped) {
    const doc = emptyDoc({
      sessionId: input.sessionId,
      turnId,
      question: input.question,
      level,
      langDefault,
      title: "Di luar cakupan",
      text: "Pertanyaan ini di luar cakupan INVESTIGRAPH (data saham IDX, fundamental, aliran dana, dan sejenisnya). Saya tidak bisa membantu untuk topik lain. Coba tanyakan soal emiten, sektor, atau data pasar Indonesia.",
    });
    appendTurn({
      id: `${turnId}_u`,
      sessionId: input.sessionId,
      seq: beforeSeq,
      role: "user",
      content: input.question,
      level,
      answedoc: null,
      factRefs: [],
      jev: null,
      meta: null,
      creditsKr: 0,
    });
    appendTurn({
      id: turnId,
      sessionId: input.sessionId,
      seq: beforeSeq + 1,
      role: "assistant",
      content: conclusionSummary(doc),
      level,
      answedoc: doc,
      factRefs: [],
      jev: { guard: { wantsRecommendation, rumor, inScope } },
      meta: { conclusion: conclusionSummary(doc), corrections: "" },
      creditsKr: 0,
    });
    return { doc, events };
  }

  const digest = buildDigest(slots);
  const plan = await planTurn({ level, slots, question: input.question, memoryDigest: memory });
  const governed = govern(plan, { level, allowLive: mode !== "replay", spendTodayKr: spentToday() });
  emit("plan", `Rencana ${governed.executable.length} langkah · estimasi ${governed.estCostKr.toFixed(0)} kr (cap L${level} ${governed.capKr} kr)`, governed.skipped.length ? `${governed.skipped.length} langkah dilewati` : undefined);

  for (const stage of [1, 2, 3] as const) {
    const steps = governed.executable.filter((s) => s.phase === stage);
    if (!steps.length) continue;
    emit("fetch", `Mengambil data tahap ${stage}: ${steps.map((s) => s.endpoint).join(", ")}`);
  }

  const results: ResolveResult[] = [];
  const evidence: Evidence[] = [];
  const notes: string[] = [...plan.notes];
  const failures: Array<{ step: PlanStep; reason: string }> = [];

  for (const step of governed.executable) {
    try {
      const result = await resolveEndpoint(step.endpoint, step.args, { sessionId: input.sessionId, turnId });
      results.push(result);
      evidence.push({
        endpoint: result.endpoint,
        args: result.args,
        source: result.source,
        status: result.status,
        chargedKr: result.chargedKr,
        facts: result.facts.length,
        purpose: step.purpose,
      });
      emit("fetch", `${step.endpoint} → ${result.facts.length} fakta (${result.source}${result.chargedKr ? `, ${result.chargedKr} kr` : ", 0 kr"})`, step.purpose);
    } catch (err) {
      const reason = err instanceof SectorsError ? `${err.message}${err.status ? ` [HTTP ${err.status}]` : ""}` : err instanceof Error ? err.message : "error";
      failures.push({ step, reason });
      emit("fetch", `${step.endpoint} gagal: ${reason}`, step.purpose);
    }
  }

  if (failures.length) {
    notes.push(...failures.map((f) => `Data ${f.step.endpoint} tidak tersedia: ${f.reason}.`));
  }
  if (governed.skipped.length) {
    notes.push(...governed.skipped.map((s) => `${s.step.endpoint} dilewati (${s.reason}).`));
  }
  if (wantsRecommendation) {
    notes.push("Pertanyaan meminta anjuran beli/jual; jawaban disajikan sebagai bukti data + risiko, bukan rekomendasi.");
  }
  if (slots.symbolsFromMemory && slots.symbols.length) {
    notes.push(`Emiten diasumsikan dari memori sesi: ${slots.symbols.join(", ")}.`);
  }
  const authFailure = failures.some((f) => /HTTP 40[13]/.test(f.reason));
  if (slots.unresolved.length) {
    notes.push(
      `Nama berikut belum terpetakan ke emiten IDX: ${slots.unresolved.join(", ")} — bisa jadi perusahaan privat/induk usaha yang tidak tercatat di bursa.`,
    );
  }

  const compiled = buildSections(slots, results, level);
  const traces: DecisionTrace[] = [];

  let title = input.question.slice(0, 90);
  let conclusion = { pemula: "", menengah: "", advanced: "" };
  let sections: AnswerDoc["sections"] = compiled.sections;
  let verified = { citations: true, compliance: true, degraded: false };

  if (compiled.facts.length === 0) {
    notes.push("Tidak ada fakta yang berhasil dikumpulkan; jawaban dibatasi pada penjelasan status data.");
    const cacheMode = getMode() === "replay";
    const attempted = governed.executable.map((x) => x.endpoint).join(", ") || "-";
    sections = [
      {
        id: "limit",
        title: "Status data",
        blocks: [
          { kind: "note", tone: "limit", text: `Data untuk pertanyaan ini belum tersedia: ${notes.slice(-3).join(" ")}` },
        ],
      },
    ];
    conclusion = cacheMode
      ? {
          pemula: `Saya tidak menemukan data siap-pakai untuk pertanyaan ini di mode replay (hanya membaca cache; jadi tidak ada kredit yang terpakai). Endpoint yang dicoba: ${attempted}. Coba tanyakan emiten yang sudah ada di cache, atau ubah mode ke hybrid/live.`,
          menengah: `Tidak ada data di cache untuk pertanyaan ini (mode replay, 0 kr). Endpoint dicoba: ${attempted}. Opsi: ganti ke mode hybrid/live (butuh kredit Sectors), atau pilih emiten yang sudah tercache.`,
          advanced: `Cache-only mode returned no facts for: ${attempted}. Switch run mode to hybrid/live (Sectors credits required) or use a cached symbol.`,
        }
      : authFailure
        ? {
            pemula: `Saya belum bisa mengambil data dari Sectors karena autentikasi gagal — kunci API belum diisi atau tidak valid (401/403, tidak memakai kredit). Isi SECTORS_API_KEY di .env, lalu coba lagi.${slots.unresolved.length ? ` Catatan: ${slots.unresolved.join(", ")} juga belum terpetakan ke emiten IDX.` : ""}`,
            menengah: `Autentikasi Sectors gagal (401/403, 0 kr). Periksa SECTORS_API_KEY di .env lalu ulangi. Endpoint dicoba: ${attempted}.${slots.unresolved.length ? ` Nama belum terpetakan: ${slots.unresolved.join(", ")}.` : ""}`,
            advanced: `Sectors auth failed (401/403, free). Set SECTORS_API_KEY and retry. Attempted: ${attempted}.${slots.unresolved.length ? ` Unresolved names: ${slots.unresolved.join(", ")}.` : ""}`,
          }
        : {
          pemula: `Data untuk pertanyaan ini belum tersedia dari Sectors (gagal atau kosong). Endpoint yang dicoba: ${attempted}. Sebutkan kode emiten yang valid atau coba lagi nanti.`,
          menengah: `Pengambilan data gagal/kosong. Endpoint dicoba: ${attempted}. Periksa kode emiten atau tanggal, lalu ulangi.`,
          advanced: `No facts retrieved from: ${attempted}. Verify symbol/date or retry; consider smaller windows to stay within endpoint limits.`,
        };
  } else {
    emit("narrate", "Menyusun narasi 3 varian (pemula/menengah/advanced)");
    const sectionFacts = compiled.sections.map((s) => ({
      id: s.id,
      title: s.title,
      facts: compiled.bySection.get(s.id)?.facts ?? [],
    }));
    const narration = await narrate({
      question: input.question,
      level,
      langDefault,
      slots,
      sections: sectionFacts,
      ledgerSummary: ledger,
      digest: digest.text,
      notes,
    });
    title = narration.title;

    emit("verify", "Verifikasi sitasi, kritik narasi, dan compliance (Jev)");
    const verification = await verifyNarration(
      { question: input.question, level, narration, facts: compiled.facts, meta: { sessionId: input.sessionId, turnId } },
      sectionFacts.map((s) => ({ id: s.id, facts: s.facts })),
    );
    traces.push(...verification.traces);
    verified = { citations: verification.citationsOk, compliance: verification.complianceOk, degraded: verification.degraded || narration.degraded };

    const narrativeById = new Map(verification.narration.sections.map((s) => [s.id, s]));
    sections = compiled.sections.map((s) => {
      const n = narrativeById.get(s.id);
      const blocks: Block[] = [...s.blocks];
      if (n && (n.variants.pemula || n.variants.menengah || n.variants.advanced)) {
        blocks.unshift({ kind: "narrative", variants: n.variants, cites: n.cites });
      }
      return { ...s, blocks };
    });

    const definitionBlock: Block[] = level <= 2 && slots.symbols.length
      ? [{
          kind: "definition",
          term: "Harga & kapitalisasi pasar",
          plain: "Harga penutupan adalah harga terakhir saat bursa tutup hari itu. Kapitalisasi pasar = harga × jumlah saham beredar, yaitu 'harga total' sebuah perusahaan di bursa.",
          technical: "Close price = last traded price at session close; market cap = close × shares outstanding.",
        }]
      : [];
    if (definitionBlock.length) {
      sections = [{ id: "dasar", title: "Dasar", blocks: definitionBlock }, ...sections];
    }
    conclusion = verification.narration.conclusion;
    if (verification.narration.assumptions.length || verification.narration.risks.length) {
      const text = [
        ...verification.narration.assumptions.map((a) => `Asumsi: ${a}`),
        ...verification.narration.risks.map((r) => `Risiko: ${r}`),
      ].join(" ");
      if (text) sections = [...sections, { id: "catatan", title: "Asumsi & risiko", blocks: [{ kind: "note", tone: "warning", text }] }];
    }
  }

  const creditsByEndpoint: Record<string, number> = {};
  for (const e of evidence) creditsByEndpoint[e.endpoint] = (creditsByEndpoint[e.endpoint] ?? 0) + e.chargedKr;
  const totalCredits = Object.values(creditsByEndpoint).reduce((a, b) => a + b, 0);

  const doc = answerDocSchema.parse({
    id: shortId("doc"),
    sessionId: input.sessionId,
    turnId,
    question: input.question,
    title,
    level,
    domain: plan.domain,
    modeDefault: langDefault,
    conclusion,
    sections,
    factIndex: compiled.factRefs.length ? compiled.factRefs : [],
    evidence,
    traces,
    notes,
    credits: { total: totalCredits, byEndpoint: creditsByEndpoint },
    verified,
    generatedAt: new Date().toISOString(),
  });

  const finalCompliance = codeComplianceCheck({
    title: doc.title,
    conclusion: doc.conclusion,
    sections: [],
    assumptions: [],
    risks: [],
    degraded: false,
  });
  if (!finalCompliance.ok) {
    verified = { ...verified, compliance: false };
    emit("compliance", "Frasa terlarang terdeteksi di kesimpulan; diganti versi aman");
    doc.conclusion = {
      pemula: "Kesimpulan ditahan oleh pemeriksaan otomatis. Fakta tetap bisa dibaca pada visual.",
      menengah: "Kesimpulan ditahan oleh pemeriksaan otomatis. Fakta tetap bisa dibaca pada visual.",
      advanced: "Conclusion withheld by automated compliance check.",
    };
  }

  const summary = conclusionSummary(doc);
  appendTurn({
    id: `${turnId}_u`,
    sessionId: input.sessionId,
    seq: beforeSeq,
    role: "user",
    content: input.question,
    level,
    answedoc: null,
    factRefs: [],
    jev: null,
    meta: null,
    creditsKr: 0,
  });
  appendTurn({
    id: turnId,
    sessionId: input.sessionId,
    seq: beforeSeq + 1,
    role: "assistant",
    content: summary,
    level,
    answedoc: doc,
    factRefs: doc.factIndex.map((f) => f.id).slice(0, 40),
    jev: { traces },
    meta: { conclusion: summary, corrections: failures.length ? failures.map((f) => f.reason).join("; ").slice(0, 200) : "" },
    creditsKr: totalCredits,
  });
  updateSessionLevelMax(input.sessionId, level);

  try {
    for (const s of slots.symbols.slice(0, 3)) rememberSymbol(s, `turn:${turnId}`);
    putMemory({
      scope: "global",
      kind: "conclusion",
      entity: slots.symbols[0] ?? null,
      key: "ringkasan",
      value: summary,
      provenance: `turn:${turnId}`,
      confidence: 0.7,
      expiresAt: null,
    });
  } catch {
    // memory ops best-effort
  }

  emit("done", `Jawaban siap · L${level} · ${sectionCount(sections)} bagian · ${totalCredits.toFixed(0)} kr`, `mode ${mode} · ${todayJakarta()}`);
  return { doc, events };
}

function sectionCount(sections: AnswerDoc["sections"]): number {
  return sections.length;
}

function emptyDoc(params: {
  sessionId: string;
  turnId: string;
  question: string;
  level: number;
  langDefault: "pemula" | "menengah" | "advanced";
  title: string;
  text: string;
}): AnswerDoc {
  return answerDocSchema.parse({
    id: shortId("doc"),
    sessionId: params.sessionId,
    turnId: params.turnId,
    question: params.question,
    title: params.title,
    level: Math.max(1, params.level),
    domain: "klaim",
    modeDefault: params.langDefault,
    conclusion: { pemula: params.text, menengah: params.text, advanced: params.text },
    sections: [{ id: "scope", title: "Cakupan", blocks: [{ kind: "note", tone: "limit", text: params.text }] }],
    factIndex: [],
    evidence: [],
    traces: [],
    notes: [],
    credits: { total: 0, byEndpoint: {} },
    verified: { citations: true, compliance: true, degraded: false },
    generatedAt: new Date().toISOString(),
  });
}

export function describeStep(step: PlanStep): string {
  return `${step.endpoint} (${step.estCostKr} kr): ${step.purpose}`;
}

export function lastDoc(sessionId: string): unknown | null {
  return latestAnswedoc(sessionId);
}

export { toFactRef };