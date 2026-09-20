import { config } from "@/lib/config";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
};

export class LlmError extends Error {}

async function post(messages: ChatMessage[], json: boolean, temperature: number, maxTokens: number, effort?: string): Promise<ChatResult> {
  if (!config.openrouter.apiKey) throw new LlmError("OPENROUTER_API_KEY belum diisi");
  const body: Record<string, unknown> = {
    model: config.openrouter.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    reasoning: { effort: effort ?? config.openrouter.reasoningEffort },
  };
  if (json) body.response_format = { type: "json_object" };
  const res = await fetch(config.openrouter.chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new LlmError(`OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new LlmError("OpenRouter mengembalikan konten kosong");
  return {
    text,
    model: data.model ?? config.openrouter.model,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    costUsd: data.usage?.cost ?? 0,
  };
}

export async function chat(system: string, user: string, opts: { temperature?: number; maxTokens?: number; effort?: string } = {}): Promise<ChatResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await post(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        false,
        opts.temperature ?? 0.4,
        opts.maxTokens ?? 2000,
        opts.effort,
      );
    } catch (err) {
      lastError = err;
      const retriable = err instanceof LlmError && /HTTP (429|5\d\d)/.test(err.message);
      if (retriable && attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError instanceof Error ? lastError : new LlmError(String(lastError));
}

export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  const from = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  const endObj = candidate.lastIndexOf("}");
  const endArr = candidate.lastIndexOf("]");
  const to = Math.max(endObj, endArr);
  if (from === -1 || to === -1) throw new LlmError("JSON tidak ditemukan pada output LLM");
  return JSON.parse(candidate.slice(from, to + 1)) as T;
}

export async function chatJson<T>(system: string, user: string, opts: { temperature?: number; maxTokens?: number; effort?: string } = {}): Promise<{ data: T; result: ChatResult }> {
  const result = await chat(system, user, opts);
  return { data: parseJsonLoose<T>(result.text), result };
}