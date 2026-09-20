import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string };

export type JevAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; legend?: Record<string, string>; probabilities: Record<string, number>; confidence: number }
  | { type: "noul"; noul: number; confidence?: number; probabilities?: Record<string, number> };

export type JevResult = {
  model: string;
  answers: Record<string, JevAnswer>;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  id: string;
};

export class JevError extends Error {}

function logCall(entry: Record<string, unknown>): void {
  try {
    fs.mkdirSync(config.paths.dataDir, { recursive: true });
    fs.appendFileSync(path.join(config.paths.dataDir, "jev-log.jsonl"), `${JSON.stringify(entry)}\n`);
  } catch {
    // logging best-effort
  }
}

export async function decide(
  state: unknown,
  questions: Record<string, JevQuestion>,
  meta: { position: string; sessionId?: string; turnId?: string },
): Promise<JevResult> {
  if (!config.openrouter.apiKey) throw new JevError("OPENROUTER_API_KEY belum diisi");
  const started = Date.now();
  const res = await fetch(config.openrouter.decisionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.openrouter.jevModel, state, questions }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    logCall({ ts: new Date().toISOString(), position: meta.position, ok: false, status: res.status, body, latencyMs: Date.now() - started, sessionId: meta.sessionId, turnId: meta.turnId });
    if ((res.status === 429 || res.status >= 500) && !(meta as { retried?: boolean }).retried) {
      await new Promise((resolve) => setTimeout(resolve, 1600));
      return decide(state, questions, { ...meta, retried: true } as typeof meta);
    }
    throw new JevError(`Jev HTTP ${res.status}: ${body}`);
  }
  const data = (await res.json()) as {
    model?: string;
    answers?: Record<string, JevAnswer>;
    usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
    id?: string;
  };
  const result: JevResult = {
    model: data.model ?? config.openrouter.jevModel,
    answers: data.answers ?? {},
    costUsd: data.usage?.cost ?? 0,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    id: data.id ?? "",
  };
  logCall({
    ts: new Date().toISOString(),
    position: meta.position,
    ok: true,
    model: result.model,
    costUsd: result.costUsd,
    latencyMs: Date.now() - started,
    questions: Object.keys(questions),
    sessionId: meta.sessionId,
    turnId: meta.turnId,
  });
  return result;
}

export function choiceOf(answer: JevAnswer | undefined, fallback: string): { value: string; confidence: number } {
  if (answer && answer.type === "choice") return { value: answer.choice, confidence: answer.confidence };
  return { value: fallback, confidence: 0 };
}

export function noulOf(answer: JevAnswer | undefined, fallback: boolean): { value: boolean; confidence: number } {
  if (answer && answer.type === "noul" && typeof answer.noul === "number") {
    return {
      value: answer.noul >= 0.5,
      confidence: answer.confidence ?? Math.min(1, Math.abs(answer.noul - 0.5) * 2),
    };
  }
  return { value: fallback, confidence: 0 };
}

export function scoreOf(answer: JevAnswer | undefined, fallback: number): { value: number; confidence: number } {
  if (answer && answer.type === "score") return { value: answer.score, confidence: answer.confidence };
  return { value: fallback, confidence: 0 };
}