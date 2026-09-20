import { z } from "zod";

export const factRefSchema = z.object({
  id: z.string(),
  label: z.string(),
  valueNum: z.number().optional(),
  valueText: z.string().optional(),
  unit: z.string().optional(),
  asOf: z.string(),
  format: z.enum(["number", "idr", "percent", "per", "signed", "text", "date"]).default("number"),
  source: z.string(),
});

export type FactRef = z.infer<typeof factRefSchema>;

const narrative = z.object({
  kind: z.literal("narrative"),
  variants: z.object({ pemula: z.string(), menengah: z.string(), advanced: z.string() }),
  cites: z.array(z.string()).default([]),
});

const metricRow = z.object({
  kind: z.literal("metric_row"),
  items: z.array(z.object({ label: z.string(), factId: z.string(), hint: z.string().optional() })),
});

const series = z.object({
  kind: z.literal("series"),
  title: z.string(),
  unit: z.enum(["price", "idr", "volume", "percent", "count"]),
  points: z.array(z.object({ date: z.string(), value: z.number() })),
  factId: z.string().optional(),
  hi: z.number().optional(),
  lo: z.number().optional(),
});

const compare = z.object({
  kind: z.literal("compare"),
  title: z.string(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(
    z.object({
      label: z.string(),
      cells: z.array(z.object({ column: z.string(), factId: z.string(), highlight: z.enum(["good", "bad", "neutral"]).optional() })),
    }),
  ),
});

const table = z.object({
  kind: z.literal("table"),
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

const news = z.object({
  kind: z.literal("news"),
  title: z.string(),
  items: z.array(z.object({ title: z.string(), date: z.string(), source: z.string().optional(), symbols: z.array(z.string()).default([]), factId: z.string().optional() })),
});

const calendar = z.object({
  kind: z.literal("calendar"),
  title: z.string(),
  events: z.array(z.object({ date: z.string(), label: z.string(), symbol: z.string().optional(), type: z.string() })),
});

const flow = z.object({
  kind: z.literal("flow"),
  title: z.string(),
  unit: z.enum(["idr", "volume"]),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), value: z.number(), kind: z.enum(["source", "sink", "hub"]) })),
});

const scenarios = z.object({
  kind: z.literal("scenarios"),
  title: z.string(),
  items: z.array(z.object({ name: z.string(), assumption: z.string(), outcome: z.string(), factIds: z.array(z.string()).default([]) })),
});

const distribution = z.object({
  kind: z.literal("distribution"),
  title: z.string(),
  unit: z.enum(["idr", "percent", "volume"]),
  bars: z.array(z.object({ label: z.string(), value: z.number() })),
});

const definition = z.object({
  kind: z.literal("definition"),
  term: z.string(),
  plain: z.string(),
  technical: z.string(),
});

const note = z.object({
  kind: z.literal("note"),
  tone: z.enum(["info", "warning", "limit"]),
  text: z.string(),
});

const heroCard = z.object({
  label: z.string(),
  factId: z.string(),
  deltaFactId: z.string().optional(),
  viz: z.enum(["sparkline", "donut", "minibars", "none"]).default("none"),
  points: z.array(z.object({ date: z.string(), value: z.number() })).default([]),
  parts: z.array(z.object({ label: z.string(), value: z.number() })).default([]),
});

const hero = z.object({
  kind: z.literal("hero"),
  items: z.array(heroCard),
});

const shareDonut = z.object({
  kind: z.literal("share_donut"),
  title: z.string(),
  factId: z.string().optional(),
  parts: z.array(z.object({ label: z.string(), value: z.number(), color: z.string().optional() })),
});

const brokerTornado = z.object({
  kind: z.literal("broker_tornado"),
  title: z.string(),
  factId: z.string().optional(),
  buyers: z.array(z.object({ code: z.string(), value: z.number() })),
  sellers: z.array(z.object({ code: z.string(), value: z.number() })),
});

const caveats = z.object({
  kind: z.literal("caveats"),
  title: z.string(),
  items: z.array(z.object({ tone: z.enum(["asumsi", "risiko", "limit"]), text: z.string() })),
});

export const blockSchema = z.discriminatedUnion("kind", [narrative, metricRow, series, compare, table, news, calendar, flow, scenarios, distribution, definition, note, hero, shareDonut, brokerTornado, caveats]);
export type Block = z.infer<typeof blockSchema>;

export const sectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  blocks: z.array(blockSchema),
});
export type Section = z.infer<typeof sectionSchema>;

export const evidenceSchema = z.object({
  endpoint: z.string(),
  args: z.record(z.string(), z.unknown()),
  source: z.string(),
  status: z.number(),
  chargedKr: z.number(),
  facts: z.number(),
  purpose: z.string().optional(),
});

export const traceSchema = z.object({
  position: z.string(),
  model: z.string(),
  outcome: z.string(),
  confidence: z.number(),
  costUsd: z.number(),
});

export const answerDocSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  turnId: z.string(),
  question: z.string(),
  title: z.string(),
  level: z.number(),
  domain: z.string(),
  modeDefault: z.enum(["pemula", "menengah", "advanced"]),
  conclusion: z.object({ pemula: z.string(), menengah: z.string(), advanced: z.string() }),
  sections: z.array(sectionSchema),
  factIndex: z.array(factRefSchema),
  evidence: z.array(evidenceSchema),
  traces: z.array(traceSchema),
  notes: z.array(z.string()).default([]),
  agents: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.enum(["ok", "partial", "failed"]),
        creditsKr: z.number(),
        facts: z.number(),
        sections: z.number(),
      }),
    )
    .default([]),
  credits: z.object({ total: z.number(), byEndpoint: z.record(z.string(), z.number()) }),
  verified: z.object({ citations: z.boolean(), compliance: z.boolean(), degraded: z.boolean() }),
  generatedAt: z.string(),
});

export type AnswerDoc = z.infer<typeof answerDocSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;