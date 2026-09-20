import { config, assertRuntimeKeys } from "@/lib/config";
import { getMode, setMode } from "@/lib/db/api-hit-store";
import { resolveEndpoint, SectorsError } from "@/lib/sectors/client";
import { decide } from "@/lib/llm/jev";
import { createSession } from "@/lib/db/session-store";
import { runTurn } from "@/lib/agent/pipeline";
import { spentToday } from "@/lib/db/api-hit-store";

const live = process.argv.includes("--live");
const chat = process.argv.includes("--chat");
const startSpend = spentToday();

async function smokeLive(): Promise<number> {
  const wanted: Array<[string, Record<string, unknown>]> = [
    ["daily", { symbol: "BRMS", start: "2026-08-20", end: "2026-09-18" }],
    ["foreign-flow", { symbol: "BRMS", start: "2026-08-20", end: "2026-09-18" }],
    ["index-daily", { index_code: "ihsg", start: "2026-08-20", end: "2026-09-18" }],
    ["top-changes", { classifications: ["top_gainers"], periods: ["1d"], n_stock: 3 }],
    ["suspensions", { limit: 5 }],
  ];
  let kr = 0;
  setMode("live");
  for (const [endpoint, args] of wanted) {
    try {
      const res = await resolveEndpoint(endpoint, args, {});
      kr += res.chargedKr;
      console.log(`✓ live ${endpoint}: ${res.facts.length} fakta, ${res.chargedKr} kr, ${res.status}`);
    } catch (err) {
      console.log(`✗ live ${endpoint}: ${err instanceof SectorsError ? err.message : String(err)}`);
    }
  }
  return kr;
}

async function smokeReplay(): Promise<void> {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["daily", { symbol: "BRMS", start: "2026-06-19", end: "2026-09-16" }],
    ["foreign-flow", { symbol: "BRMS", start: "2026-06-19", end: "2026-09-16" }],
    ["daily", { symbol: "BBCA", start: "2026-06-19", end: "2026-09-16" }],
  ];
  setMode("replay");
  for (const [endpoint, args] of cases) {
    try {
      const res = await resolveEndpoint(endpoint, args, {});
      console.log(`✓ replay ${endpoint}: ${res.facts.length} fakta, ${res.source}, ${res.chargedKr} kr`);
    } catch (err) {
      console.log(`· replay ${endpoint}: ${err instanceof SectorsError ? err.message : String(err)}`);
    }
  }
}

async function smokeJev(): Promise<void> {
  const res = await decide(
    { question: "Berapa harga BRMS sekarang?", entities: ["BRMS"], level_definitions: { L1: "single fact" } },
    {
      level: {
        type: "choice",
        instructions: "Pick the analysis depth level for `question`.",
        criteria: { L1: "single fact lookup", L2: "fact plus meaning", L10: "decision dossier" },
      },
      in_scope: { type: "noul", instructions: "The question is about Indonesian equities." },
    },
    { position: "smoke" },
  );
  console.log(`✓ Jev ${res.model}: ${JSON.stringify(res.answers).slice(0, 200)} · $${res.costUsd.toFixed(6)}`);
}

async function main(): Promise<void> {
  const missing = assertRuntimeKeys();
  console.log(`mode env: ${getMode()} · key kurang: ${missing.length ? missing.join(", ") : "tidak ada"}`);
  await smokeReplay();
  if (live) {
    if (!config.sectors.apiKey) {
      console.log("skip live: SECTORS_API_KEY kosong");
    } else {
      const kr = await smokeLive();
      console.log(`live selesai: ${kr} kr (batas smoke ≤5 kr)`);
    }
  }
  if (config.openrouter.apiKey) {
    await smokeJev();
  }
  if (chat) {
    if (!config.sectors.apiKey) setMode("replay");
    const session = createSession("smoke chat", "menengah");
    const result = await runTurn({ sessionId: session.id, question: "Berapa harga dan kapitalisasi pasar BRMS sekarang?", langMode: "menengah" });
    console.log(`✓ runTurn L${result.doc.level}: ${result.doc.sections.length} bagian, ${result.doc.evidence.length} sumber, ${result.doc.credits.total} kr, verified=${JSON.stringify(result.doc.verified)}`);
    console.log(`  judul: ${result.doc.title}`);
    console.log(`  kesimpulan: ${result.doc.conclusion.menengah.slice(0, 200)}`);
  }
  console.log(`total kredit Sectors sesi smoke: ${(spentToday() - startSpend).toFixed(0)} kr (mode ${getMode()})`);
}

void main();