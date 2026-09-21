import { decide, choiceOf, noulOf } from "@/lib/llm/jev";
import type { DecisionTrace, PlanStep } from "@/lib/agent/types";
import type { Fact } from "@/lib/facts";

export type SufficiencyAction = "stop" | "continue_plan" | "replan" | "escalate";

export const MAX_JUDGES_PER_AGENT = 3;
export const MAX_REPLANS_PER_AGENT = 3;

export function shouldJudge(facts: number, failures: number, remainingCostKr: number, judgesUsed: number): boolean {
  if (judgesUsed >= MAX_JUDGES_PER_AGENT) return false;
  if (remainingCostKr <= 0) return false;
  return facts > 0 || failures > 0;
}

export function formatObservations(facts: Fact[], failures: string[], remaining: PlanStep[]): string {
  const factLines = facts
    .slice(0, 12)
    .map((f) => `- ${f.label}: ${f.valueNum ?? f.valueText ?? ""} ${f.unit ?? ""} (${f.asOf})`)
    .join("\n");
  const failLines = failures.slice(0, 5).join("; ");
  const remainingLines = remaining.map((s) => `- ${s.endpoint} (~${s.estCostKr} kr, fase ${s.phase}${s.optional ? ", opsional" : ""})`).join("\n");
  return [`Fakta terkumpul (${facts.length}):\n${factLines || "-"}`, `Gagal: ${failLines || "-"}`, `Sisa rencana:\n${remainingLines || "-"}`].join("\n");
}

export async function judgeSufficiency(input: {
  question: string;
  intentLabel: string;
  level: number;
  facts: Fact[];
  failures: string[];
  remaining: PlanStep[];
  meta: { sessionId: string; turnId: string };
}): Promise<{ action: SufficiencyAction; missing: string; trace: DecisionTrace }> {
  const trace = (model: string, outcome: string, confidence: number, costUsd = 0): DecisionTrace => ({
    position: "sufficiency_judge",
    model,
    outcome,
    confidence,
    costUsd,
  });
  // Pre-check kode: belum ada hasil sama sekali → lanjutkan tanpa bakar panggilan Jev.
  if (input.facts.length === 0 && input.failures.length === 0) {
    return { action: "continue_plan", missing: "", trace: trace("code", "belum ada observasi; lanjutkan rencana", 1) };
  }
  try {
    const res = await decide(
      {
        question: input.question,
        intent: input.intentLabel,
        level: `L${input.level}`,
        observations: formatObservations(input.facts, input.failures, input.remaining),
      },
      {
        sufficient: {
          type: "noul",
          instructions: "The collected facts in `observations` are enough to answer the `question` for this `intent` at this depth level, without the remaining planned steps.",
        },
        next_action: {
          type: "choice",
          instructions: "Given `observations`, decide what the data agent should do next.",
          criteria: {
            stop: "Collected facts fully answer the intent; remaining steps add little value — stop now to save credits.",
            continue_plan: "More planned steps are still needed; keep executing the remaining plan as-is.",
            replan: "The facts show the plan is wrong or incomplete (wrong endpoints, missing dimension); a different set of endpoints is needed.",
            escalate: "Key data is missing or failing and no alternative endpoint can fill it; stop and report the limitation honestly.",
          },
        },
      },
      { position: "sufficiency_judge", sessionId: input.meta.sessionId, turnId: input.meta.turnId },
    );
    const picked = choiceOf(res.answers.next_action, "continue_plan");
    const sufficient = noulOf(res.answers.sufficient, false);
    const action = (["stop", "continue_plan", "replan", "escalate"] as const).includes(picked.value as SufficiencyAction)
      ? (picked.value as SufficiencyAction)
      : "continue_plan";
    // Pengaman silang: klaim "cukup" tapi minta replan → anggap lanjutkan rencana.
    const finalAction = sufficient.value && action === "replan" ? "continue_plan" : action;
    return {
      action: finalAction,
      missing: "",
      trace: trace(res.model, `${finalAction} (cukup: ${sufficient.value ? "ya" : "belum"})`, picked.confidence, res.costUsd),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 100) : "error";
    return { action: "continue_plan", missing: "", trace: trace("fallback", `judge gagal (${message}); lanjutkan rencana`, 0) };
  }
}
