import { chatJson } from "@/lib/llm/openrouter";
import type { NarrativeVariants } from "@/lib/agent/types";
import type { Fact, FactUnit } from "@/lib/facts";
import { formatForUnit } from "@/lib/agent/compiler";
import type { Slots } from "@/lib/agent/types";

export type NarratorInput = {
  question: string;
  level: number;
  langDefault: string;
  slots: Slots;
  sections: Array<{ id: string; title: string; facts: Fact[] }>;
  ledgerSummary: string;
  digest: string;
  notes: string[];
};

export type NarratorOutput = {
  title: string;
  conclusion: NarrativeVariants;
  sections: Array<{ id: string; variants: NarrativeVariants; cites: string[] }>;
  assumptions: string[];
  risks: string[];
  degraded: boolean;
};

const PLACEHOLDER = /\{\{f:([a-z0-9]+)\|(number|idr|percent|per|signed|text|date)\}\}/gi;

function factsBlock(facts: Fact[]): string {
  return facts
    .map((f) => {
      const fmt = formatForUnit(f.unit);
      return `- ${f.id}: ${f.label}${f.valueNum !== undefined ? ` = ${f.valueNum}` : f.valueText ? ` = "${f.valueText}"` : ""}${f.unit ? ` [${f.unit}]` : ""} (as of ${f.asOf}) → gunakan {{f:${f.id}|${fmt}}}`;
    })
    .join("\n");
}

export async function narrate(input: NarratorInput): Promise<NarratorOutput> {
  try {
    return await narrateOnce(input, { maxSections: 6, maxFacts: 10, maxTokens: 7000, compact: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[narrator] percobaan 1 gagal: ${message}`);
    try {
      return await narrateOnce(input, { maxSections: 3, maxFacts: 6, maxTokens: 4000, compact: true });
    } catch (err2) {
      const message2 = err2 instanceof Error ? err2.message : String(err2);
      console.warn(`[narrator] percobaan 2 gagal: ${message2}`);
      const fallbackText = () =>
        `Data berhasil diambil (${input.sections.map((s) => s.title).join(", ")}), tetapi narasi otomatis gagal dibuat (mode aman). Angka dapat dibaca pada visual di bawah; silakan minta ulang untuk mencoba lagi.`;
      return {
        title: input.question.slice(0, 80),
        conclusion: { pemula: fallbackText(), menengah: fallbackText(), advanced: `Narration failed: ${message2.slice(0, 120)}` },
        sections: input.sections.map((s) => ({ id: s.id, variants: { pemula: "", menengah: "", advanced: "" }, cites: [] })),
        assumptions: ["Narasi degraded karena kegagalan LLM; fakta & visual tetap valid."],
        risks: [],
        degraded: true,
      };
    }
  }
}

async function narrateOnce(
  input: NarratorInput,
  opts: { maxSections: number; maxFacts: number; maxTokens: number; compact: boolean },
): Promise<NarratorOutput> {
  const usedSections = input.sections.slice(0, opts.maxSections);
  const sectionSpec = usedSections
    .map((s) => `SECTION ${s.id} — ${s.title}\nFakta tersedia:\n${factsBlock(s.facts.slice(0, opts.maxFacts))}`)
    .join("\n\n");
  const system = [
    "Kamu adalah Narrator INVESTIGRAPH, penulis analisis saham IDX berbahasa Indonesia untuk investor ritel.",
    "ATURAN KERAS:",
    "1. JANGAN pernah menulis angka mentah. Setiap angka WAJIB ditulis sebagai placeholder {{f:FACTID|format}} dengan ID fakta yang diberikan. format ∈ number|idr|percent|per|signed|text|date.",
    "2. JANGAN memberi rekomendasi beli/jual, target harga, atau janji keuntungan. Boleh menjelaskan fakta, risiko, dan konteks.",
    "3. Tulis 3 varian dengan fakta identik, hanya gaya berbeda: pemula = tanpa jargon, analogi sederhana, kalimat pendek; menengah = istilah standar dijelaskan singkat; advanced = istilah teknis penuh, metodologi, limitasi data.",
    "4. Setiap section hanya boleh memakai fakta dari daftar section itu. cites = daftar factId yang benar-benar dipakai di varian mana pun.",
    "5. Jangan mengarang peristiwa yang tidak ada di fakta. Kalau data tidak cukup, tulis keterbatasannya.",
    "6. Ringkas: maksimum 55 kata per varian section, maksimum 40 kata per varian kesimpulan.",
    "7. Jawab HANYA JSON valid, tanpa penjelasan tambahan.",
  ].join("\n");
  const user = [
    `Pertanyaan user: ${input.question}`,
    `Level analisis: L${input.level}. Domain: harga/fundamental/valuasi/bandarmologi/klaim/komoditas/sektor.`,
    input.slots.symbols.length ? `Emiten: ${input.slots.symbols.join(", ")}` : "",
    input.slots.indexCode ? `Indeks: ${input.slots.indexCode}` : "",
    input.slots.commodity ? `Komoditas: ${input.slots.commodity}` : "",
    "",
    sectionSpec,
    "",
    !opts.compact && input.ledgerSummary ? `Riwayat sesi (untuk konteks lanjutan):\n${input.ledgerSummary.slice(0, 1200)}` : "",
    !opts.compact && input.digest ? `Catatan ketersediaan data:\n${input.digest.slice(0, 600)}` : "",
    "",
    'Skema JSON: {"title": string, "conclusion": {"pemula": string, "menengah": string, "advanced": string}, "sections": [{"id": string, "variants": {"pemula": string, "menengah": string, "advanced": string}, "cites": string[]}], "assumptions": string[], "risks": string[]}',
  ]
    .filter(Boolean)
    .join("\n");

  const { data } = await chatJson<Omit<NarratorOutput, "degraded">>(system, user, {
    temperature: opts.compact ? 0.2 : 0.35,
    maxTokens: opts.maxTokens,
    effort: "low",
  });
  const foundIn = (...texts: Array<string | undefined>): string[] => [...new Set(texts.flatMap((t) => (t ? [...t.matchAll(PLACEHOLDER)].map((m) => m[1]) : [])))];
  const sections = (data.sections ?? []).map((s) => {
    const valid = new Set(input.sections.find((x) => x.id === s.id)?.facts.map((f) => f.id) ?? []);
    const cites = new Set([...(s.cites ?? []), ...foundIn(s.variants?.pemula, s.variants?.menengah, s.variants?.advanced)].filter((c) => valid.has(c)));
    return { id: s.id, variants: s.variants, cites: [...cites] };
  });
  const conclusionCites = foundIn(data.conclusion?.pemula, data.conclusion?.menengah, data.conclusion?.advanced);
  const allValid = new Set(input.sections.flatMap((x) => x.facts.map((f) => f.id)));
  for (const c of conclusionCites) {
    if (!allValid.has(c)) continue;
    const target = sections.find((s) => s.cites.length === 0) ?? sections[0];
    if (target) target.cites = [...new Set([...target.cites, c])];
  }
  return {
    title: data.title || input.question.slice(0, 80),
    conclusion: data.conclusion ?? { pemula: "", menengah: "", advanced: "" },
    sections,
    assumptions: data.assumptions ?? [],
    risks: data.risks ?? [],
    degraded: false,
  };
}

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

export function resolvePlaceholders(text: string, lookup: (id: string) => Fact | undefined, format: (fact: Fact, mode: "number" | "idr" | "percent" | "per" | "signed" | "text" | "date") => string): string {
  return text.replace(PLACEHOLDER, (_m, id: string, fmt: string) => {
    const fact = lookup(id);
    if (!fact) return "[data tidak ditemukan]";
    return format(fact, fmt as "number");
  });
}

export function unitHint(fact: Fact): FactUnit | undefined {
  return fact.unit;
}