import { govern, type GovernedPlan } from "@/lib/agent/tools";
import { intentPlanWithScreener, revisePlanWithLLM } from "@/lib/agent/planner";
import { judgeSufficiency, shouldJudge, formatObservations, MAX_REPLANS_PER_AGENT } from "@/lib/agent/sufficiency";
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
  // Rencana awal: proposal deterministik, direvisi LLM bila kompleks (L7+ / multi-intent / kosong).
  let plan = await intentPlanWithScreener(intent, slots, question, {
    level,
    intentCount: params.concurrentAgents ?? 1,
    sessionId,
    turnId,
  });
  const extraNotes: string[] = [];

  const results: ResolveResult[] = [];
  const evidence: Evidence[] = [];
  const failures: string[] = [];
  const traces: DecisionTrace[] = [];
  let creditsKr = 0;
  let skipped: GovernedPlan["skipped"] = [];
  let queue: PlanStep[] = [];

  const reGovern = (steps: PlanStep[], capLeftKr: number) => {
    const g = govern({ ...plan, steps }, {
      level,
      allowLive: mode !== "replay",
      spendTodayKr: params.spendTodayKr + creditsKr,
      capKr: Math.max(0, capLeftKr),
    });
    if ((params.concurrentAgents ?? 1) >= 3) {
      const kept = g.executable.filter((s) => !(s.optional && s.estCostKr > 3));
      const cut = g.executable.filter((s) => s.optional && s.estCostKr > 3);
      return {
        ...g,
        executable: kept,
        skipped: [...g.skipped, ...cut.map((s) => ({ step: s, reason: "konkurensi tinggi: langkah opsional mahal dipotong" }))],
      };
    }
    return g;
  };

  const g0 = reGovern(plan.steps, capKr);
  queue = [...g0.executable];
  skipped = [...g0.skipped];

  const runStep = async (step: PlanStep) => {
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
  };

  // Loop agen: eksekusi per fase → judge kecukupan → stop/lanjut/replan/eskalasi.
  // Replan boleh berkali-kali (keputusan user), dibatasi MAX_REPLANS_PER_AGENT anti-loop.
  let judges = 0;
  let replans = 0;
  let iterations = 0;
  while (queue.length && iterations < 8) {
    iterations += 1;
    const phase = Math.min(...queue.map((s) => s.phase));
    const batch = queue.filter((s) => s.phase === phase);
    queue = queue.filter((s) => s.phase !== phase);
    for (const step of batch) await runStep(step);

    const remainingCost = queue.reduce((a, s) => a + s.estCostKr, 0);
    const compiledSoFar = buildSections(slots, results, level, question);
    if (!shouldJudge(compiledSoFar.facts.length, failures.length, remainingCost, judges)) continue;
    judges += 1;
    const verdict = await judgeSufficiency({
      question,
      intentLabel: intent.label,
      level,
      facts: compiledSoFar.facts,
      failures,
      remaining: queue,
      meta: { sessionId, turnId },
    });
    traces.push(verdict.trace);
    emit(`Judge: ${verdict.trace.outcome}`, `${judges}x judge · ${replans}x replan`);
    if (verdict.action === "stop") {
      skipped.push(...queue.map((s) => ({ step: s, reason: "judge: bukti cukup, hemat kredit" })));
      queue = [];
      break;
    }
    if (verdict.action === "escalate") {
      extraNotes.push(`[${intent.label}] data kunci tidak tersedia; bagian disajikan apa adanya dengan batasan dinyatakan.`);
      skipped.push(...queue.map((s) => ({ step: s, reason: "judge: eskalasi, hentikan" })));
      queue = [];
      break;
    }
    if (verdict.action === "replan") {
      if (replans >= MAX_REPLANS_PER_AGENT) {
        extraNotes.push(`[${intent.label}] batas replan tercapai; lanjutkan sisa rencana.`);
        continue;
      }
      replans += 1;
      const observations = formatObservations(compiledSoFar.facts, failures, queue);
      const revised = await revisePlanWithLLM({ ...plan, steps: queue }, slots, question, {
        level,
        observations,
        sessionId,
        turnId,
      });
      extraNotes.push(...revised.notes.map((n) => `[${intent.label}] ${n}`));
      emit(`Replan #${replans}`, revised.revised ? "rencana diubah LLM" : "revisi gagal; pakai sisa rencana");
      plan = revised.plan;
      const g = reGovern(revised.plan.steps, capKr - creditsKr);
      queue = [...g.executable];
      skipped.push(...g.skipped);
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
    notes: [...extraNotes, ...notes, ...plan.notes],
    traces,
    creditsKr,
    skipped: skipped.length,
    failures,
    status,
  };
}

export function describeAgentStep(step: PlanStep): string {
  return `${step.endpoint} (${step.estCostKr} kr)`;
}