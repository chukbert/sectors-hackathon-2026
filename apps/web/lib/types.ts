export type EvidenceItem = {
  id: string;
  label: string;
  endpoint: string;
  params: Record<string, unknown>;
  fetched_at: string;
  source: string;
  value: unknown;
  unit?: string | null;
  node_key?: string | null;
  note?: string | null;
};

export type TableColumn = { key: string; label: string; align?: "left" | "right"; format?: string; better?: "lower" | "higher" };

export type TableSpec = { columns: TableColumn[]; rows: Record<string, unknown>[]; note?: string | null };

export type ChartSpec = {
  _height?: number;
  _kind?: "tree" | "map";
  rows?: { label: string; symbols?: string[]; children?: { label: string }[] }[];
  points?: { name: string; lon: number; lat: number; label?: string }[];
  [key: string]: unknown;
};

export type KPI = { label: string; value: string; sub?: string | null; tone?: string };

export type Piece = {
  io: string;
  panel: string;
  title: string;
  why: string;
  narrative: string;
  kpis: KPI[];
  chart?: ChartSpec | null;
  table?: TableSpec | null;
  items: Record<string, unknown>[];
  facts: string[];
  evidence: string[];
  status: "ready" | "empty";
  empty_reason?: string | null;
};

export type Panel = {
  id: string;
  title: string;
  status: "ready" | "empty";
  hero_io: string;
  items: Piece[];
  why: string;
};

export type L0 = {
  title: string;
  kpis: KPI[];
  bullets: string[];
  persona: string;
  playbooks: string[];
  query: string;
  scope: Record<string, unknown>;
  disclaimer: string;
};

export type Memo = {
  lenses: { title: string; text: string }[];
  followups: string[];
  disclaimer: string;
  verification?: {
    numeric?: { ok: boolean; checked: number; unverified: { token: string; context: string }[] };
    policy?: { ok: boolean; banned: string[] };
    ok: boolean;
    judge?: { pass: boolean; temuan: string[]; judge?: string };
    source?: string;
    disclaimer_present?: boolean;
  };
};

export type PlanNode = {
  id: string;
  key: string;
  endpoint: string;
  params: Record<string, unknown>;
  wave: number;
  intents: string[];
  optional: boolean;
  label: string;
  est_credits: number;
  hit: boolean;
  fresh: boolean;
  invalid: boolean;
  status: string;
  error?: string | null;
  fetched_at?: string | null;
  source?: string | null;
  credits_spent: number;
};

export type Estimates = {
  nodes: number;
  store_hits: number;
  live: number;
  credits_live: number;
  credits_saved: number;
  waves: number;
  over_budget: boolean;
  budget_max: number;
};

export type Plan = {
  query: string;
  session_id: string;
  persona: string;
  playbooks: { key: string; label: string }[];
  intents: { id: string; name: string; panel: string }[];
  nodes: PlanNode[];
  estimates: Estimates;
  scope: { symbols?: string[]; regional?: { exchange: string; symbol: string }[]; language?: string };
  notes: string[];
  language: string;
  compiler?: { where?: Record<string, unknown> | null; compiler?: string } | null;
  router_source?: string;
};

export type RunResult = {
  run_id?: string;
  session_id?: string;
  l0: L0;
  panels: Panel[];
  memo: Memo;
  followups: string[];
  evidence: Record<string, EvidenceItem>;
  usage: {
    sectors_credits: number;
    store_hits: number;
    store_misses: number;
    calls: number;
    budget_stopped: boolean;
    llm?: { cost_usd: number; calls: number; by_role: { role: string; calls: number; cost: number; tokens: number }[] };
  };
  errors: string[];
  plan?: Plan;
};

export type ChatResponse =
  | { kind: "chat"; session_id: string; reply: string; disclaimer?: string | null }
  | { kind: "plan"; session_id: string; run_id: string; plan: Plan; disclaimer: string };

export type SessionInfo = { id: string; title: string; updated_at: number; turns: number };

export type Turn = { id: number; seq: number; role: string; text: string; run_id?: string | null; created_at: number };

export type StreamEvent = Record<string, unknown> & { type: string };