import { govern } from "@/lib/agent/tools";
import { intentPlanWithScreener } from "@/lib/agent/planner";
import { buildSections, type Compiled } from "@/lib/agent/compiler";
import { narrate, type NarratorOutput } from "@/lib/agent/narrator";
import { resolveEndpoint, SectorsError, type ResolveResult } from "@/lib/sectors/client";
import type { IntentHit } from "@/lib/agent/classifier";
import type { Plan, PlanStep, Slots, DecisionTrace, TurnProgress } from "@/lib/agent/types";
import type { Evidence, Section, Block } from "@/lib/output/answerdoc";
import type { RunMode } from "@/lib/config";

export type IntentAgentResult = {
  intent: IntentHit;
  plan: Plan;
  results: ResolveResult[];
  compiled: Compiled;
  narration: NarratorOutput | null;
  sections: Section[];
  evidence: Evidence[];
  notes: string[];
  traces: DecisionTrace[];
  creditsKr: number;
  skipped: number;
  failures: string[];
  status: "ok" | "partial" | "failed";
};

export async function runIntentAgent(params: {
  intent: IntentHit;
  slots: Slots;
  question: string;
  level: number;
  sessionId: string;
  turnId: string;
  ledger: string;
  digest: string;
  mode: RunMode;
  capKr: number;
  concurrentAgents?: number;
  spendTodayKr: number;
  emit?: (event: TurnProgress) => void;
}): Promise<IntentAgentResult> {
  const { intent, slots, question, level, sessionId, turnId, mode, capKr } = params;
  const emit = (message: string, detail?: string) => params.emit?.({ phase: `agent:${intent.id}`, message, detail });

  emit(`Agent ${intent.label} mulai`, `probabilitas ${intent.probability.toFixed(2)}`);
  const plan = await intentPlanWithScreener(intent, slots, question);
  const governed = govern(plan, { level, allowLive: mode !== "replay", spendTodayKr: params.spendTodayKr, capKr });
  if ((params.concurrentAgents ?? 1) >= 3) {
    governed.executable = governed.executable.filter((s) => !(s.optional && s.estCostKr > 3));
  }

  const results: ResolveResult[] = [];
  const evidence: Evidence[] = [];
  const failures: string[] = [];
  let creditsKr = 0;

  for (const step of governed.executable) {
    try {
      const result = await resolveEndpoint(step.endpoint, step.args, { sessionId, turnId });
      results.push(result);
      creditsKr += result.chargedKr;
      evidence.push({
        endpoint: result.endpoint,
        args: result.args,
        source: result.source,
        status: result.status,
        chargedKr: result.chargedKr,
        facts: result.facts.length,
        purpose: `[${intent.label}] ${step.purpose}`,
      });
      emit(`${step.endpoint} → ${result.facts.length} fakta`, `${result.source}${result.chargedKr ? ` · ${result.chargedKr} kr` : " · 0 kr"}`);
    } catch (err) {
      const reason = err instanceof SectorsError ? `${err.message}${err.status ? ` [HTTP ${err.status}]` : ""}` : err instanceof Error ? err.message : "error";
      failures.push(`${step.endpoint}: ${reason}`);
      emit(`${step.endpoint} gagal`, reason.slice(0, 120));
    }
  }

  const compiled = buildSections(slots, results, level, question);
  const sectionFacts = compiled.sections.map((s) => ({ id: s.id, title: s.title, facts: (compiled.bySection.get(s.id)?.facts ?? []).filter((f) => !f.key.endsWith("_pt")) }));

  let narration: NarratorOutput | null = null;
  const notes: string[] = [];
  if (compiled.facts.length === 0) {
    notes.push(`[${intent.label}] tidak ada fakta yang berhasil dikumpulkan.`);
  } else {
    narration = await narrate({
      question: `${question}\n\nFOKUS BAGIAN INI: ${intent.label} — ${intent.section}.`,
      level,
      langDefault: "menengah",
      slots,
      sections: sectionFacts,
      ledgerSummary: params.ledger,
      digest: params.digest,
      notes,
    });
  }

  const narrativeById = new Map((narration?.sections ?? []).map((s) => [s.id, s]));
  const sections: Section[] = compiled.sections.map((s) => {
    const n = narrativeById.get(s.id);
    const blocks: Block[] = [...s.blocks];
    if (n && (n.variants.pemula || n.variants.menengah || n.variants.advanced)) {
      blocks.unshift({ kind: "narrative", variants: n.variants, cites: n.cites });
    }
    return { ...s, blocks };
  });

  const status: IntentAgentResult["status"] = compiled.facts.length === 0 ? "failed" : failures.length ? "partial" : "ok";
  return {
    intent,
    plan,
    results,
    compiled,
    narration,
    sections,
    evidence,
    notes: [...notes, ...plan.notes],
    traces: [],
    creditsKr,
    skipped: governed.skipped.length,
    failures,
    status,
  };
}

export function describeAgentStep(step: PlanStep): string {
  return `${step.endpoint} (${step.estCostKr} kr)`;
}