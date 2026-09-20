import path from "node:path";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing env ${name}`);
  }
  return v;
}

export type RunMode = "replay" | "hybrid" | "live";

export const config = {
  sectors: {
    baseUrl: env("SECTORS_BASE_URL", "https://api.sectors.app")
      .replace(/\/+$/, "")
      .replace(/\/v2$/, ""),
    apiKey: process.env.SECTORS_API_KEY ?? "",
    timeoutMs: Number(env("SECTORS_TIMEOUT_MS", "45000")),
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: env("OPENROUTER_MODEL", "google/gemini-2.5-flash"),
    reasoningEffort: process.env.OPENROUTER_REASONING_EFFORT ?? "low",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    decisionsUrl: "https://openrouter.ai/api/alpha/decisions",
    jevModel: env("JEV_MODEL", "typesafe/jev-1.13"),
  },
  app: {
    url: env("APP_URL", "http://localhost:3000"),
    port: Number(env("PORT", "3000")),
  },
  paths: {
    dataDir: path.join(process.cwd(), "data"),
    dbFile: path.join(process.cwd(), "data", "investigraph.sqlite"),
    blobsDir: path.join(process.cwd(), "data", "blobs"),
    exportsDir: path.join(process.cwd(), "exports"),
  },
  run: {
    mode: (process.env.INVESTIGRAPH_MODE ?? "hybrid") as RunMode,
    dailyBudgetKr: Number(env("SECTORS_DAILY_BUDGET", "60")),
    confirmAboveKr: Number(env("SECTORS_CONFIRM_ABOVE", "6")),
  },
} as const;

export const LEVEL_CAPS_KR: Record<number, number> = {
  1: 2,
  2: 2,
  3: 8,
  4: 8,
  5: 16,
  6: 16,
  7: 24,
  8: 24,
  9: 40,
  10: 70,
};

export const DOMAINS = [
  "harga",
  "fundamental",
  "valuasi",
  "dividen",
  "bandarmologi",
  "asing",
  "screening",
  "komoditas",
  "ipo",
  "kalender",
  "sektor",
  "klaim",
  "tag",
] as const;

export type Domain = (typeof DOMAINS)[number];

export function assertRuntimeKeys(): string[] {
  const missing: string[] = [];
  if (!config.sectors.apiKey) missing.push("SECTORS_API_KEY");
  if (!config.openrouter.apiKey) missing.push("OPENROUTER_API_KEY");
  return missing;
}