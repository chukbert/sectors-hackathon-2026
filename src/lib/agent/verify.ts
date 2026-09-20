import { decide, noulOf, scoreOf, type JevQuestion } from "@/lib/llm/jev";
import { chatJson } from "@/lib/llm/openrouter";
import type { DecisionTrace } from "@/lib/agent/types";
import type { Fact } from "@/lib/facts";
import type { NarratorOutput } from "@/lib/agent/narrator";

const BANNED = [/harus beli/i, /harus jual/i, /wajib beli/i, /wajib jual/i, /saya rekomendasikan/i, /rekomendasi saya/i, /pasti (naik|cuan|untung)/i, /dijamin (naik|untung)/i, /target harga (\d|rp)/i, /auto cuan/i];

export type VerifyInput = {
  question: string;
  level: number;
  narration: NarratorOutput;
  facts: Fact[];
  meta: { sessionId: string; turnId: string };
};

export type VerifyResult = {
  narration: NarratorOutput;
  traces: DecisionTrace[];
  citationsOk: boolean;
  complianceOk: boolean;
  repairedSections: string[];
  degraded: boolean;
};

type SectionFacts = { id: string; facts: Fact[] };

function factsJson(facts: Fact[]): string {
  return facts
    .slice(0, 14)
    .map((f) => `${f.id} | ${f.label} | ${f.valueNum ?? f.valueText ?? ""} ${f.unit ?? ""} | ${f.asOf}`)
    .join("\n");
}

const FORMAT_FOR_UNIT: Record<string, string[]> = {
  IDR: ["idr"],
  "%": ["percent"],
  x: ["per"],
  price: ["number", "idr"],
  date: ["date", "text"],
  text: ["text", "number", "date"],
  volume: ["number"],
  count: ["number"],
  ratio: ["number", "percent"],
};

export function codeCitationCheck(narration: NarratorOutput, facts: Fact[]): { ok: boolean; bad: string[] } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const ids = new Set(facts.map((f) => f.id));
  const bad: string[] = [];
  const texts = [narration.conclusion.pemula, narration.conclusion.menengah, narration.conclusion.advanced, ...narration.sections.flatMap((s) => [s.variants.pemula, s.variants.menengah, s.variants.advanced])];
  for (const text of texts) {
    for (const match of text.matchAll(/\{\{f:([a-z0-9]+)\|(number|idr|percent|per|signed|text|date)\}\}/gi)) {
      const id = match[1];
      const fmt = match[2].toLowerCase();
      if (!ids.has(id)) {
        bad.push(id);
        continue;
      }
      const unit = byId.get(id)?.unit ?? "count";
      const allowed = FORMAT_FOR_UNIT[unit] ?? ["number"];
      if (!allowed.includes(fmt)) bad.push(`${id}:${fmt}!=>${unit}`);
    }
  }
  const inlineNumbers = texts.filter((t) => {
    const withoutPlaceholders = t.replace(/\{\{[^}]+\}\}/g, " ");
    const withoutYears = withoutPlaceholders.replace(/\b(19|20)\d{2}\b/g, " ");
    return /\d+[.,]\d+|\d{1,3}\s?%|\b\d{3,}\b/.test(withoutYears);
  });
  return { ok: bad.length === 0 && inlineNumbers.length === 0, bad: [...bad, ...inlineNumbers.map(() => "angka-mentah")] };
}

export function codeComplianceCheck(narration: NarratorOutput): { ok: boolean; hits: string[] } {
  const texts = [narration.conclusion.pemula, narration.conclusion.menengah, narration.conclusion.advanced, ...narration.sections.flatMap((s) => [s.variants.pemula, s.variants.menengah, s.variants.advanced])];
  const hits: string[] = [];
  for (const banned of BANNED) {
    for (const t of texts) if (banned.test(t)) hits.push(banned.source);
  }
  return { ok: hits.length === 0, hits };
}

export async function repairSection(sectionId: string, sectionFacts: Fact[], question: string): Promise<NarratorOutput["sections"][number] | null> {
  try {
    const { data } = await chatJson<{ variations: { pemula: string; menengah: string; advanced: string } }>(
      [
        "Rewrite the analysis section USING ONLY the provided facts.",
        "Every number MUST be {{f:FACTID|format}} placeholders. Never write raw digits.",
        "No buy/sell recommendation, no price target, no promises.",
        "Three variants: pemula (no jargon), menengah (standard terms), advanced (technical detail, data limitations).",
        "Reply JSON only.",
      ].join("\n"),
      `Question: ${question}\nSection: ${sectionId}\nFacts:\n${factsJson(sectionFacts)}\n\nJSON: {"variations": {"pemula": string, "menengah": string, "advanced": string}}`,
      { temperature: 0.2, maxTokens: 1200 },
    );
    return { id: sectionId, variants: data.variations, cites: sectionFacts.slice(0, 6).map((f) => f.id) };
  } catch {
    return null;
  }
}

export async function verifyNarration(input: VerifyInput, sections: SectionFacts[]): Promise<VerifyResult> {
  const traces: DecisionTrace[] = [];
  let narration: NarratorOutput = { ...input.narration, sections: input.narration.sections.map((s) => ({ ...s })) };
  const citations = codeCitationCheck(narration, input.facts);
  const compliance = codeComplianceCheck(narration);

  const questions: Record<string, JevQuestion> = {};
  for (const section of sections) {
    const narrativeSection = narration.sections.find((s) => s.id === section.id);
    if (!narrativeSection) continue;
    questions[`supports_${section.id}`] = {
      type: "noul",
      instructions: `The narrative claim in \`claim\` is supported by (or at least not contradicted by) the data in \`facts\`. Ignore style. Only judge factual support of every material statement.`,
    };
  }
  for (const mode of ["pemula", "menengah", "advanced"] as const) {
    questions[`distortion_${mode}`] = {
      type: "score",
      instructions: `How much does the \`narration_${mode}\` distort or oversimplify the underlying \`facts\`? 0 = faithful, 1 = minor simplification without changing meaning, 2 = meaningful distortion or omitted material caveat.`,
      criteria: ["Faithful", "Minor simplification", "Material distortion"],
    };
  }
  questions.says_recommendation = { type: "noul", instructions: "The text tells the reader what to buy or sell, gives a price target, or promises profit (any variant)." };
  questions.severity_if_followed = {
    type: "score",
    instructions: "If a retail investor acted on this text, how harmful could it be? 0 = none, 1 = mild, 2 = serious, 3 = severe.",
    criteria: ["None", "Mild", "Serious", "Severe"],
  };

  const state: Record<string, unknown> = {
    claim: sections.map((s) => {
      const n = narration.sections.find((x) => x.id === s.id);
      return { id: s.id, text: [n?.variants.menengah, n?.variants.advanced].filter(Boolean).join(" ").slice(0, 700) };
    }),
    facts: sections.map((s) => ({ id: s.id, data: factsJson(s.facts).slice(0, 1200) })),
    narration_pemula: narration.conclusion.pemula.slice(0, 500),
    narration_menengah: narration.conclusion.menengah.slice(0, 500),
    narration_advanced: narration.conclusion.advanced.slice(0, 500),
  };

  try {
    const res = await decide(state, questions, { position: "verifier", sessionId: input.meta.sessionId, turnId: input.meta.turnId });
    const unsupported: string[] = [];
    for (const section of sections) {
      const verdict = noulOf(res.answers[`supports_${section.id}`], true);
      if (!verdict.value && verdict.confidence >= 0.55) unsupported.push(section.id);
      traces.push({
        position: `citation_check:${section.id}`,
        model: res.model,
        outcome: verdict.value ? "didukung" : "TIDAK didukung",
        confidence: verdict.confidence,
        costUsd: 0,
      });
    }
    const distortion = (["pemula", "menengah", "advanced"] as const).map((m) => ({ mode: m, ...scoreOf(res.answers[`distortion_${m}`], 0) }));
    for (const d of distortion) {
      traces.push({ position: `narrative_critique:${d.mode}`, model: res.model, outcome: `distorsi ${d.value}`, confidence: d.confidence, costUsd: 0 });
    }
    const recommendation = noulOf(res.answers.says_recommendation, false);
    const severity = scoreOf(res.answers.severity_if_followed, 0);
    traces.push({ position: "compliance", model: res.model, outcome: recommendation.value ? `anjuran terdeteksi (sev ${severity.value})` : "lolos", confidence: recommendation.confidence, costUsd: res.costUsd });

    const repairedSections: string[] = [];
    for (const sectionId of unsupported) {
      const sectionFacts = sections.find((s) => s.id === sectionId)?.facts ?? [];
      const repaired = await repairSection(sectionId, sectionFacts, input.question);
      if (repaired) {
        narration.sections = narration.sections.map((s) => (s.id === sectionId ? repaired : s));
        repairedSections.push(sectionId);
        traces.push({ position: `repair:${sectionId}`, model: "llm", outcome: "section ditulis ulang dari fakta", confidence: 0.7, costUsd: 0 });
      }
    }

    const complianceOk = !recommendation.value && severity.value < 2 && compliance.ok;
    if (!complianceOk) {
      const safe = (mode: string) =>
        mode === "advanced"
          ? `Narasi otomatis ditahan oleh compliance check. Fakta dan visual pada kartu di bawah tetap valid; baca angka langsung dari visual.`
          : `Kalimat kesimpulan otomatis saya tahan karena berpotensi terdengar seperti anjuran. Silakan lihat fakta di visual bawah ini.`;
      narration = { ...narration, conclusion: { pemula: safe("pemula"), menengah: safe("menengah"), advanced: safe("advanced") }, degraded: true };
      traces.push({ position: "compliance_failclosed", model: res.model, outcome: "narasi kesimpulan diganti versi aman", confidence: recommendation.confidence, costUsd: 0 });
    }

    const recheck = codeCitationCheck(narration, input.facts);
    return {
      narration,
      traces,
      citationsOk: recheck.ok,
      complianceOk: complianceOk && compliance.ok,
      repairedSections,
      degraded: narration.degraded || !recheck.ok,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 120) : "error";
    traces.push({ position: "verifier", model: "fallback", outcome: `gagal: ${message}`, confidence: 0, costUsd: 0 });
    const complianceOk = compliance.ok;
    let safeNarration = narration;
    if (!complianceOk) {
      narration = {
        ...narration,
        conclusion: { pemula: "Kesimpulan ditahan oleh pemeriksaan otomatis.", menengah: "Kesimpulan ditahan oleh pemeriksaan otomatis.", advanced: "Conclusion withheld by automated compliance check." },
        degraded: true,
      };
      safeNarration = narration;
    } else {
      safeNarration = {
        ...narration,
        assumptions: [...narration.assumptions, `Verifikasi semantik Jev tidak tersedia pada turn ini (${message}); cek sitasi berbasis kode tetap dijalankan.`],
      };
    }
    return {
      narration: safeNarration,
      traces,
      citationsOk: citations.ok,
      complianceOk,
      repairedSections: [],
      degraded: safeNarration.degraded,
    };
  }
}