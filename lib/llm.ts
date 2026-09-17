// Pembungkus Google GenAI SDK — model penalaran (§5: gemini-3.8-flash, effort medium).
// Semua agen memakai SATU jalur ini supaya effort/telemetry terpusat.
import { GoogleGenAI, Type } from "@google/genai";
import { TOOL_SPECS, type ToolName } from "./tools.ts";
import { sectorsGet, SectorsUnavailable } from "./sectors.ts";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const THINKING_BUDGET = Number(process.env.GEMINI_THINKING || 4096); // effort medium
let _ai: GoogleGenAI | null | undefined;
function ai(): GoogleGenAI | null {
  if (_ai === undefined) _ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
  return _ai;
}
export const llmOk = () => !!ai();

function textOf(r: { candidates?: { content?: { parts?: { text?: string }[] } }[] }): string {
  return (r.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

// 503 "high demand" / 429 dari Google bersifat sementara → exponential backoff, lalu biarkan
// pemanggil jatuh ke jalur deterministik (kartu tetap terbit, tanpa prose LLM).
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      const m = String((e as Error)?.message ?? e);
      if (i < tries && /(503|429|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|DEADLINE)/i.test(m)) {
        await new Promise((r) => setTimeout(r, 700 * 2 ** i));
        continue;
      }
      throw e;
    }
  }
}

export async function completeText(system: string, prompt: string, temperature = 0.4): Promise<string> {
  const a = ai(); if (!a) throw new Error("GEMINI_API_KEY kosong");
  const r = await withRetry(() => a.models.generateContent({ model: MODEL, contents: prompt,
    config: { systemInstruction: system, temperature, thinkingConfig: { thinkingBudget: THINKING_BUDGET } as never } }));
  return textOf(r);
}

export async function completeJson<T>(system: string, prompt: string, validate: (x: unknown) => x is T, tries = 2): Promise<T> {
  let last = "";
  for (let i = 0; i <= tries; i++) {
    const raw = await completeText(system + "\nJAWAB HANYA JSON VALID, tanpa penjelasan.", prompt + last, 0.2);
    try {
      const parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "").trim());
      if (validate(parsed)) return parsed;
      last = `\n(JSON tadi tidak lolos validasi. Perbaiki struktur sesuai instruksi.)`;
    } catch { last = `\n(JSON tadi tidak bisa diparse — output objek murni.)`; }
  }
  throw new Error("LLM tidak menghasilkan JSON valid");
}

function declarationsFor(names: ToolName[]) {
  return names.map((n) => {
    const s = TOOL_SPECS[n];
    return { name: n, description: s.desc,
      parameters: { type: Type.OBJECT,
        properties: Object.fromEntries(Object.entries(s.params).map(([k, p]) => [k, { type: Type.STRING, description: p.desc }])),
        required: Object.entries(s.params).filter(([, p]) => (p as { required?: boolean }).required).map(([k]) => k) } };
  });
}

/** loop tool-call agen spesialis: LLM minta tool → kita jalankan (cache-first) → balas → sampai jawaban JSON */
export async function toolLoop(args: {
  system: string; user: string; tools: ToolName[]; maxRounds?: number;
}): Promise<{ json: unknown; text: string; toolJsons: unknown[]; calls: { name: string; params: Record<string, string> }[] }> {
  const a = ai(); if (!a) throw new Error("GEMINI_API_KEY kosong");
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [{ role: "user", parts: [{ text: args.user }] }];
  const toolJsons: unknown[] = [];
  const calls: { name: string; params: Record<string, string> }[] = [];
  for (let round = 0; round < (args.maxRounds ?? 5); round++) {
    const r = await withRetry(() => a.models.generateContent({ model: MODEL, contents: contents as never,
      config: { systemInstruction: args.system, tools: [{ functionDeclarations: declarationsFor(args.tools) }] } }));
    const cand = r.candidates?.[0] as { content?: { parts?: { functionCall?: { id?: string; name: string; args?: Record<string, string> } }[] } } | undefined;
    const fcs = (cand?.content?.parts ?? []).filter((p) => p.functionCall).map((p) => p.functionCall!) ;
    if (!fcs.length) {
      const text = textOf(r as never);
      let json: unknown = null;
      try { json = JSON.parse(text.replace(/^```json?\s*|\s*```$/g, "").trim()); } catch { /* agen kembalikan teks */ }
      return { json, text, toolJsons, calls };
    }
    const results: { name: string; response: unknown }[] = [];
    for (const fc of fcs) {
      const name = fc.name as ToolName;
      if (!(name in TOOL_SPECS)) { results.push({ name, response: { error: "tool tidak ada" } }); continue; }
      try {
        const body = await sectorsGet(name, (fc.args ?? {}) as Record<string, string>);
        toolJsons.push(body); calls.push({ name, params: fc.args ?? {} });
        results.push({ name, response: body });
      } catch (e) {
        results.push({ name, response: { error: e instanceof SectorsUnavailable ? e.message : String(e) } });
      }
    }
    contents.push({ role: "model", parts: fcs.map((fc) => ({ functionCall: fc })) });
    contents.push({ role: "user", parts: results.map((r) => ({ functionResponse: { name: r.name, response: r.response } })) });
  }
  throw new Error("tool loop melebihi maxRounds");
}
