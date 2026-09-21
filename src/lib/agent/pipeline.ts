import { extractSlots, looksFinancial, rememberSymbol } from "@/lib/agent/slots";
import { classifyByRules, composeLevel, detectIntents, domainLabel, type IntentHit } from "@/lib/agent/classifier";
import { buildDigest } from "@/lib/agent/digest";
import { domainFor } from "@/lib/agent/planner";
import { LEVEL_CAPS_KR } from "@/lib/config";
import { runIntentAgent, type IntentAgentResult } from "@/lib/agent/agent";
import { verifyNarration, codeComplianceCheck } from "@/lib/agent/verify";
import type { NarratorOutput } from "@/lib/agent/narrator";
import { chatJson } from "@/lib/llm/openrouter";
import { answerDocSchema, type AnswerDoc, type Block, type Evidence, type Section } from "@/lib/output/answerdoc";
import { buildHero } from "@/lib/output/report";
import { appendTurn, latestAnswedoc, ledgerLines, memoryDigest, nextSeq, putMemory, updateSessionLevelMax } from "@/lib/db/session-store";
import { getProfile, getLatestGraph, portfolioOneLiner } from "@/lib/db/portfolio-store";
import { langMode } from "@/lib/util/format";
import { shortId, stableStringify } from "@/lib/util/ids";
import { getMode, spentToday } from "@/lib/db/api-hit-store";
import { todayJakarta } from "@/lib/util/time";
import type { AgentTurnInput, DecisionTrace, PlanStep } from "@/lib/agent/types";
import { INTENT_BY_ID } from "@/lib/agent/intents";

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

const DOMAIN_TO_INTENT: Record<string, string> = {
  harga: "harga",
  fundamental: "fundamental",
  valuasi: "valuasi",
  dividen: "dividen",
  bandarmologi: "bandarmologi",
  asing: "aliran_asing",
  screening: "screening",
  komoditas: "komoditas",
  ipo: "ipo",
  kalender: "aksi_korporasi",
  sektor: "sektor_indeks",
  klaim: "berita",
  tag: "tag",
};

function intentFromDomain(domain: string): IntentHit {
  const id = DOMAIN_TO_INTENT[domain] ?? "pasar_umum";
  const def = INTENT_BY_ID.get(id) ?? INTENT_BY_ID.get("pasar_umum");
  const intent = def ?? { id: "pasar_umum", domain: "sektor" as const, label: "ringkasan pasar umum", section: "Ringkasan pasar" };
  return { id: intent.id, label: intent.label, domain: intent.domain, section: intent.section, probability: 0.3 };
}

async function composeConclusion(
  question: string,
  agents: IntentAgentResult[],
  factSample: Array<{ id: string; label: string }>,
): Promise<{ title: string; conclusion: NarratorOutput["conclusion"]; assumptions: string[]; risks: string[] }> {
  const summaries = agents
    .filter((a) => a.narration)
    .map((a) => `- ${a.intent.label}: ${a.narration?.conclusion.menengah ?? ""}`)
    .join("\n");
  const facts = factSample.map((f) => `- ${f.id}: ${f.label}`).join("\n");
  try {
    const { data } = await chatJson<{ title: string; conclusion: { pemula: string; menengah: string; advanced: string }; assumptions: string[]; risks: string[] }>(
      [
        "You write the final answer of INVESTIGRAPH, an Indonesian IDX stock research assistant.",
        "Merge the per-topic summaries into one conclusion in 3 styles (pemula/menengah/advanced), max 50 words each.",
        "Any number MUST be written as {{f:FACTID|format}} using the provided fact ids. Never write raw digits.",
        "Never give buy/sell advice, price targets or promises. Reply JSON only.",
      ].join("\n"),
      `Question: ${question}\n\nPer-topic summaries:\n${summaries}\n\nTop facts:\n${facts}\n\nJSON: {"title": string, "conclusion": {"pemula": string, "menengah": string, "advanced": string}, "assumptions": string[], "risks": string[]}`,
      { temperature: 0.3, maxTokens: 900, effort: "low" },
    );
    if (data.conclusion?.menengah) {
      return {
        title: data.title || question.slice(0, 90),
        conclusion: data.conclusion,
        assumptions: data.assumptions ?? [],
        risks: data.risks ?? [],
      };
    }
    throw new Error("empty conclusion");
  } catch {
    const joined = agents
      .filter((a) => a.narration?.conclusion.menengah)
      .map((a) => a.narration?.conclusion.menengah ?? "")
      .join(" ");
    const text = joined || "Data sudah terkumpul; ringkasan otomatis tidak tersedia, lihat bagian-bagian di bawah.";
    return {
      title: agents[0]?.narration?.title || question.slice(0, 90),
      conclusion: { pemula: text, menengah: text, advanced: text },
      assumptions: [],
      risks: [],
    };
  }
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
  memoryDigest();
  const langDefault = langMode(input.langMode);

  emit("guard", "Memeriksa pertanyaan & menyusun intent (Jev)");
  const slots = await extractSlots(input.question);
  const verdict = await detectIntents(input.question, ledger, { sessionId: input.sessionId, turnId });
  if (verdict.rumor && !slots.isRumor) slots.isRumor = true;
  if (verdict.wantsRecommendation && !slots.wantsAdvice) slots.wantsAdvice = true;

  const explicitEntity = slots.symbols.length > 0 && !slots.symbolsFromMemory;
  const financeScope =
    looksFinancial(input.question) || explicitEntity || slots.indexCode !== null || slots.commodity !== null || verdict.inScope === true;
  const scoped = financeScope && (looksFinancial(input.question) || explicitEntity || slots.indexCode !== null || slots.commodity !== null || verdict.failed);

  let intents = verdict.intents;
  let level: number;
  if (verdict.failed) {
    const rules = classifyByRules(input.question, slots);
    level = Math.max(rules.level, slots.isRumor || slots.wantsAdvice ? 7 : 0);
    intents = [intentFromDomain(domainFor(level, slots))];
    emit("level", `Fallback aturan: L${level}`, `Jev gagal; 1 agent (${intents[0].label})`);
  } else {
    level = composeLevel(intents, verdict.depth, slots.isRumor, slots.wantsAdvice);
    emit("level", `L${level} · ${intents.length} intent: ${intents.map((i) => `${i.label} (${i.probability.toFixed(2)})`).join(" + ")}`, slots.symbols.length ? `Emiten: ${slots.symbols.join(", ")}` : undefined);
  }

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
      jev: { traces: verdict.traces },
      meta: { conclusion: conclusionSummary(doc), corrections: "" },
      creditsKr: 0,
    });
    return { doc, events };
  }

  const digest = buildDigest(slots);
  const portfolio = getProfile();
  const portfolioGraph = portfolio ? getLatestGraph() : null;
  if (portfolio) {
    const clusters = portfolioGraph?.graph?.clusters ?? [];
    const clusterLines = clusters
      .filter((c) => c.nodeIds.some((id) => portfolio.items.some((i) => i.symbol === id)))
      .slice(0, 6)
      .map((c) => {
        const members = c.nodeIds.map((id) => portfolioGraph?.graph?.nodes.find((n) => n.id === id)).filter(Boolean);
        return `- ${c.label}: ${members.map((m) => (m?.kind === "entity" ? m.name : m?.symbol ?? "")).filter(Boolean).join(" ↔ ")}`;
      });
    digest.text += `\nPORTOFOLIO USER (wajib dijadikan konteks, bukan dasar rekomendasi):\n- ${portfolioOneLiner(portfolio)}\n${clusterLines.join("\n")}`;
  }
  const totalCap = LEVEL_CAPS_KR[Math.min(10, Math.max(1, level))] ?? 8;
  const capKr = Math.max(2, Math.floor(totalCap / Math.max(1, intents.length)));
  emit("plan", `Orkestrasi ${intents.length} agent · cap total L${level} ${totalCap} kr (per agent ${capKr} kr)`);

  const queue = [...intents];
  const agentResults: IntentAgentResult[] = [];
  const spendAtStart = spentToday();
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const intent = queue.shift();
      if (!intent) break;
      const result = await runIntentAgent({
        intent,
        slots,
        question: input.question,
        level,
        sessionId: input.sessionId,
        turnId,
        ledger,
        digest: digest.text,
        mode,
        capKr,
        concurrentAgents: intents.length,
        spendTodayKr: spendAtStart,
        emit: (event) => emit(event.phase, event.message, event.detail),
      });
      agentResults.push(result);
    }
  });
  await Promise.all(workers);
  agentResults.sort((a, b) => intents.findIndex((i) => i.id === a.intent.id) - intents.findIndex((i) => i.id === b.intent.id));

  const failures: string[] = agentResults.flatMap((a) => a.failures);
  const notes: string[] = [...agentResults.flatMap((a) => a.notes)];
  if (portfolio) notes.push(`Jawaban dikaitkan dengan portofolio Anda (${portfolio.items.length} emiten, profil ${portfolio.risk}).`);
  const skipped = agentResults.reduce((acc, a) => acc + a.skipped, 0);
  const attempted = [...new Set(agentResults.flatMap((a) => a.plan.steps.map((s) => s.endpoint)))].join(", ");
  const authFailure = failures.some((f) => /HTTP 40[13]/.test(f));
  if (failures.length) notes.push(...failures.map((f) => `Data tidak tersedia — ${f}.`));
  if (skipped) notes.push(`${skipped} langkah dilewati karena cap kredit per level.`);
  if (slots.wantsAdvice) notes.push("Pertanyaan meminta anjuran beli/jual; jawaban disajikan sebagai bukti data + risiko, bukan rekomendasi.");
  if (slots.symbolsFromMemory && slots.symbols.length) notes.push(`Emiten diasumsikan dari memori sesi: ${slots.symbols.join(", ")}.`);
  if (slots.unresolved.length) notes.push(`Nama berikut belum terpetakan ke emiten IDX: ${slots.unresolved.join(", ")} — bisa jadi perusahaan privat/induk usaha yang tidak tercatat di bursa.`);

  const evidence: Evidence[] = [];
  const seenEvidence = new Set<string>();
  for (const agent of agentResults) {
    for (const e of agent.evidence) {
      const key = `${e.endpoint}:${stableStringify(e.args)}`;
      if (seenEvidence.has(key)) continue;
      seenEvidence.add(key);
      evidence.push(e);
    }
  }

  const sections: Section[] = [];
  const sectionIndex = new Map<string, number>();
  for (const agent of agentResults) {
    for (const section of agent.sections) {
      const existing = sectionIndex.get(section.id);
      if (existing === undefined) {
        sectionIndex.set(section.id, sections.length);
        sections.push(section);
      } else {
        const current = sections[existing];
        const known = new Set(current.blocks.map((b) => JSON.stringify(b)));
        const extra = section.blocks.filter((b) => !known.has(JSON.stringify(b)));
        if (extra.length) sections[existing] = { ...current, blocks: [...current.blocks, ...extra] };
      }
    }
  }

  const facts = agentResults.flatMap((a) => a.compiled.facts);
  const factById = new Map(facts.map((f) => [f.id, f]));
  const mergedFacts = [...factById.values()];
  const factRefs = agentResults.flatMap((a) => a.compiled.factRefs);
  const seenRef = new Set<string>();
  const uniqueRefs = factRefs.filter((r) => (seenRef.has(r.id) ? false : (seenRef.add(r.id), true)));

  const heroBlock = buildHero(mergedFacts, slots.symbols[0]);

  const sectionFactsResolved = sections.map((s) => {
    for (const agent of agentResults) {
      const group = agent.compiled.bySection.get(s.id);
      if (group && group.facts.length) return { id: s.id, facts: group.facts };
    }
    return { id: s.id, facts: mergedFacts.filter(() => false) };
  });

  const traces: DecisionTrace[] = [...verdict.traces];
  let title = input.question.slice(0, 90);
  let conclusion = { pemula: "", menengah: "", advanced: "" };
  let verified = { citations: true, compliance: true, degraded: false };
  let finalSections: AnswerDoc["sections"] = sections;

  if (mergedFacts.length === 0) {
    notes.push("Tidak ada fakta yang berhasil dikumpulkan; jawaban dibatasi pada penjelasan status data.");
    finalSections = [
      { id: "limit", title: "Status data", blocks: [{ kind: "note", tone: "limit", text: `Data untuk pertanyaan ini belum tersedia: ${notes.slice(-3).join(" ")}` }] },
    ];
    conclusion = mode === "replay"
      ? {
          pemula: `Saya tidak menemukan data siap-pakai untuk pertanyaan ini di mode replay (0 kr). Endpoint dicoba: ${attempted}. Coba emiten yang sudah tercache, atau ubah mode ke hybrid/live.`,
          menengah: `Tidak ada data di cache untuk pertanyaan ini (mode replay, 0 kr). Endpoint dicoba: ${attempted}. Opsi: ganti ke hybrid/live atau pilih emiten yang sudah tercache.`,
          advanced: `Cache-only mode returned no facts for: ${attempted}. Switch to hybrid/live or use a cached symbol.`,
        }
      : authFailure
        ? {
            pemula: `Autentikasi Sectors gagal (401/403, 0 kr). Isi SECTORS_API_KEY di .env lalu coba lagi.${slots.unresolved.length ? ` Catatan: ${slots.unresolved.join(", ")} juga belum terpetakan ke emiten IDX.` : ""}`,
            menengah: `Autentikasi Sectors gagal (401/403, 0 kr). Periksa SECTORS_API_KEY lalu ulangi. Endpoint dicoba: ${attempted}.${slots.unresolved.length ? ` Nama belum terpetakan: ${slots.unresolved.join(", ")}.` : ""}`,
            advanced: `Sectors auth failed (401/403, free). Set SECTORS_API_KEY and retry. Attempted: ${attempted}.`,
          }
        : {
            pemula: `Data belum tersedia dari Sectors (gagal/kosong). Endpoint dicoba: ${attempted}. Sebutkan kode emiten yang valid atau coba lagi nanti.`,
            menengah: `Pengambilan data gagal/kosong. Endpoint dicoba: ${attempted}. Periksa kode emiten atau tanggal, lalu ulangi.`,
            advanced: `No facts retrieved from: ${attempted}. Verify symbol/date or retry with smaller windows.`,
          };
  } else {
    emit("verify", "Menggabungkan narasi agent & verifikasi berlapis (Jev)");
    const agentNarrations = agentResults.map((a) => a.narration).filter((n): n is NarratorOutput => n !== null);
    const mergedNarrationSections = agentNarrations.flatMap((n) => n.sections);
    const seenNarrative = new Set<string>();
    const narrativeSections = mergedNarrationSections.filter((s) => (seenNarrative.has(s.id) ? false : (seenNarrative.add(s.id), true)));
    const composed = await composeConclusion(input.question, agentResults, uniqueRefs.slice(0, 8).map((f) => ({ id: f.id, label: f.label })));
    const mergedNarration: NarratorOutput = {
      title: composed.title,
      conclusion: composed.conclusion,
      sections: narrativeSections,
      assumptions: [...agentNarrations.flatMap((n) => n.assumptions), ...composed.assumptions],
      risks: [...agentNarrations.flatMap((n) => n.risks), ...composed.risks],
      degraded: agentNarrations.some((n) => n.degraded),
    };
    title = mergedNarration.title;

    const verification = await verifyNarration(
      { question: input.question, level, narration: mergedNarration, facts: mergedFacts, meta: { sessionId: input.sessionId, turnId } },
      sectionFactsResolved,
    );
    traces.push(...verification.traces);
    verified = { citations: verification.citationsOk, compliance: verification.complianceOk, degraded: verification.degraded || mergedNarration.degraded };

    const narrativeById = new Map(verification.narration.sections.map((s) => [s.id, s]));
    finalSections = sections.map((s) => {
      const n = narrativeById.get(s.id);
      const blocks: Block[] = [...s.blocks];
      if (n && (n.variants.pemula || n.variants.menengah || n.variants.advanced)) {
        blocks.unshift({ kind: "narrative", variants: n.variants, cites: n.cites });
      }
      return { ...s, blocks };
    });

    if (level <= 2 && slots.symbols.length) {
      finalSections = [
        {
          id: "dasar",
          title: "Dasar",
          blocks: [
            {
              kind: "definition",
              term: "Harga & kapitalisasi pasar",
              plain: "Harga penutupan adalah harga terakhir saat bursa tutup hari itu. Kapitalisasi pasar = harga × jumlah saham beredar, yaitu 'harga total' sebuah perusahaan di bursa.",
              technical: "Close price = last traded price at session close; market cap = close × shares outstanding.",
            },
          ],
        },
        ...finalSections,
      ];
    }
    conclusion = verification.narration.conclusion;
    const caveatItems = [
      ...verification.narration.assumptions.map((a) => ({ tone: "asumsi" as const, text: a })),
      ...verification.narration.risks.map((r) => ({ tone: "risiko" as const, text: r })),
    ];
    if (caveatItems.length) finalSections = [...finalSections, { id: "catatan", title: "Asumsi & risiko", blocks: [{ kind: "caveats", title: "Asumsi & Risiko", items: caveatItems }] }];
  }

  if (heroBlock) finalSections = [{ id: "hero", title: "Ringkasan", blocks: [heroBlock] }, ...finalSections];

  const creditsByEndpoint: Record<string, number> = {};
  for (const e of evidence) creditsByEndpoint[e.endpoint] = (creditsByEndpoint[e.endpoint] ?? 0) + e.chargedKr;
  const totalCredits = agentResults.reduce((acc, a) => acc + a.creditsKr, 0);

  let doc = answerDocSchema.parse({
    id: shortId("doc"),
    sessionId: input.sessionId,
    turnId,
    question: input.question,
    title,
    level,
    domain: domainLabel(intents),
    modeDefault: langDefault,
    conclusion,
    sections: finalSections,
    factIndex: uniqueRefs,
    evidence,
    traces,
    notes,
    agents: agentResults.map((a) => ({
      id: a.intent.id,
      label: a.intent.label,
      status: a.status,
      creditsKr: a.creditsKr,
      facts: a.compiled.facts.length,
      sections: a.sections.length,
    })),
    credits: { total: totalCredits, byEndpoint: creditsByEndpoint },
    verified,
    generatedAt: new Date().toISOString(),
  });

  const finalCompliance = codeComplianceCheck({ title: doc.title, conclusion: doc.conclusion, sections: [], assumptions: [], risks: [], degraded: false });
  if (!finalCompliance.ok) {
    verified = { ...verified, compliance: false };
    doc = { ...doc, verified, conclusion: { pemula: "Kesimpulan ditahan oleh pemeriksaan otomatis. Fakta tetap bisa dibaca pada visual.", menengah: "Kesimpulan ditahan oleh pemeriksaan otomatis. Fakta tetap bisa dibaca pada visual.", advanced: "Conclusion withheld by automated compliance check." } };
    emit("compliance", "Frasa terlarang terdeteksi di kesimpulan; diganti versi aman");
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
    meta: { conclusion: summary, corrections: failures.slice(0, 4).join("; ").slice(0, 200) },
    creditsKr: doc.credits.total,
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
    void 0;
  }

  emit("done", `Jawaban siap · L${level} · ${intents.length} agent · ${doc.sections.length} bagian · ${doc.credits.total.toFixed(0)} kr`, `mode ${mode} · ${todayJakarta()}`);
  return { doc, events };
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
    agents: [],
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
