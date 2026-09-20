import type { Domain } from "@/lib/config";
import type { LangMode } from "@/lib/util/format";

export type Slots = {
  symbols: string[];
  symbolsFromMemory: boolean;
  indexCode: string | null;
  sectorText: string | null;
  periodDays: number | null;
  isRumor: boolean;
  wantsAdvice: boolean;
  isComparison: boolean;
  commodity: string | null;
};

export type PlanStep = {
  id: string;
  endpoint: string;
  args: Record<string, unknown>;
  purpose: string;
  estCostKr: number;
  phase: 1 | 2 | 3;
  optional: boolean;
};

export type Plan = {
  level: number;
  domain: Domain;
  goal: string;
  steps: PlanStep[];
  estCostKr: number;
  notes: string[];
};

export type TurnProgress = {
  phase: string;
  message: string;
  detail?: string;
};

export type EvidencePack = {
  endpoint: string;
  args: Record<string, unknown>;
  factIds: string[];
  source: string;
  chargedKr: number;
  status: number;
};

export type AgentTurnInput = {
  sessionId: string;
  question: string;
  langMode: LangMode;
  emit?: (event: TurnProgress) => void;
};

export type Claim = {
  id: string;
  text: string;
  factIds: string[];
  kind: "fact" | "arithmetic" | "interpretation" | "risk";
};

export type NumberToken = {
  placeholder: string;
  factId: string;
  format: "number" | "idr" | "percent" | "per" | "signed" | "text" | "date";
  prefix?: string;
  suffix?: string;
};

export type NarrativeVariants = {
  pemula: string;
  menengah: string;
  advanced: string;
};

export type DecisionTrace = {
  position: string;
  model: string;
  outcome: string;
  confidence: number;
  costUsd: number;
};