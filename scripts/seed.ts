import fs from "node:fs";
import path from "node:path";
import { canonicalKey } from "@/lib/util/ids";
import { putCache, recordHit } from "@/lib/db/api-hit-store";
import { upsertFacts } from "@/lib/db/fact-memory";
import { ENDPOINT_BY_ID } from "@/lib/sectors/registry";
import type { CacheEntry } from "@/lib/db/api-hit-store";

const TOOL_TO_ENDPOINT: Record<string, string> = {
  broker_registry: "brokers",
  broker_summary: "broker-summary",
  company_report: "report",
  daily: "daily",
  filings: "filings",
  foreign_flow: "foreign-flow",
  news: "news",
  quarterly_financials: "quarterly",
  suspensions: "suspensions",
};

type V4File = {
  tool?: string;
  params?: Record<string, unknown>;
  body?: unknown;
  ttl?: number;
  at?: number;
};

type Envelope = { at?: number; data?: unknown; body?: unknown; seed?: number };

function collectDates(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectDates(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === "date" || k === "timestamp" || k.endsWith("_date")) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        out.push(v.slice(0, 10));
      } else if (k === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        out.push(v.slice(0, 10));
      } else {
        collectDates(v, out);
      }
    }
    return;
  }
}

function safeIsoFromEpoch(at: number | undefined): string {
  if (!at || !Number.isFinite(at)) return new Date().toISOString();
  const ms = at > 1e12 ? at : at * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return new Date().toISOString();
  return d.toISOString();
}

function inferCovers(payload: unknown): { from: string | null; to: string | null } {
  const dates: string[] = [];
  collectDates(payload, dates);
  if (!dates.length) return { from: null, to: null };
  const sorted = dates.sort();
  return { from: sorted[0], to: sorted.at(-1) ?? null };
}

function importV5File(file: string): { endpoint: string; args: Record<string, unknown> } | null {
  const name = file.replace(/\.json$/, "").replace(/^_+/, "").replace(/_+$/, "");
  const D = "(\\d{4})[_-](\\d{2})[_-](\\d{2})";
  const pair = (m: RegExpMatchArray, i: number) => `${m[i]}-${m[i + 1]}-${m[i + 2]}`;
  let match: RegExpMatchArray | null;

  if ((match = name.match(new RegExp(`^daily_([A-Z0-9]{4})(?:_start_${D}_end_${D})?$`)))) {
    return { endpoint: "daily", args: match[2] ? { symbol: match[1], start: pair(match, 2), end: pair(match, 5) } : { symbol: match[1] } };
  }
  if ((match = name.match(new RegExp(`^foreign_flow_([A-Z0-9]{4})(?:_start_${D}_end_${D})?$`)))) {
    return { endpoint: "foreign-flow", args: match[2] ? { symbol: match[1], start: pair(match, 2), end: pair(match, 5) } : { symbol: match[1] } };
  }
  if ((match = name.match(new RegExp(`^index_daily_([a-z0-9]+)_start_${D}_end_${D}$`)))) {
    return { endpoint: "index-daily", args: { index_code: match[1], start: pair(match, 2), end: pair(match, 5) } };
  }
  if ((match = name.match(new RegExp(`^idx_total_start_${D}_end_${D}$`)))) {
    return { endpoint: "idx-total", args: { start: pair(match, 1), end: pair(match, 4) } };
  }
  if ((match = name.match(new RegExp(`^most_traded_start_${D}_end_${D}_n_stock_(\\d+)$`)))) {
    return { endpoint: "most-traded", args: { start: pair(match, 1), end: pair(match, 4), n_stock: Number(match[7]) } };
  }
  if ((match = name.match(/^companies_top_changes_classifications_(top_gainers|top_losers)_periods_(\w+)_n_stock_(\d+)$/))) {
    return { endpoint: "top-changes", args: { classifications: [match[1]], periods: [match[2]], n_stock: Number(match[3]) } };
  }
  if ((match = name.match(/^mining_commodities_([a-z]+)_price_start_year_(\d{4})_end_year_(\d{4})$/))) {
    return { endpoint: "mining-price", args: { commodity_name: match[1], start_year: Number(match[2]), end_year: Number(match[3]) } };
  }
  if (name === "mining_commodities") return { endpoint: "mining-commodities", args: {} };
  if (name === "brokers") return { endpoint: "brokers", args: {} };
  if ((match = name.match(/^filings_symbol_([A-Z0-9]{4})_transaction_type_(buy|sell)(?:_start_\d{4}_\d{2}_\d{2}_end_\d{4}_\d{2}_\d{2})?$/))) {
    return { endpoint: "filings", args: { symbol: match[1], transaction_type: match[2] } };
  }
  if ((match = name.match(/^financials_quarterly_([A-Z0-9]{4})_n_quarters_(\d+)$/))) {
    return { endpoint: "quarterly", args: { symbol: match[1], n_quarters: Number(match[2]) } };
  }
  if ((match = name.match(/^company_report_([A-Z0-9]{4})_sections_([a-z]+)$/))) {
    return { endpoint: "report", args: { symbol: match[1], sections: [match[2]] } };
  }
  if ((match = name.match(/^broker_activity_([A-Z0-9]{2,4})(?:_where_code_[A-Z0-9]+)?$/))) {
    return { endpoint: "broker-activity", args: { broker_code: match[1] } };
  }
  if ((match = name.match(/^broker_summary_([A-Z0-9]{4})_end_\d{4}_\d{2}_\d{2}_start_\d{4}_\d{2}_\d{2}$/))) {
    return { endpoint: "broker-summary", args: { symbol: match[1] } };
  }
  if ((match = name.match(/^mining_licenses_company_(.+?)(?:_limit_(\d+))?(?:_order_by_[a-z_]+)?$/))) {
    return { endpoint: "mining-licenses", args: { company: match[1].replace(/_/g, "-"), limit: match[2] ? Number(match[2]) : undefined } };
  }
  if ((match = name.match(/^mining_contracts_mine_owner_(.+)$/))) {
    return { endpoint: "mining-contracts", args: { mine_owner: match[1].replace(/_/g, "-") } };
  }
  if ((match = name.match(/^mining_sales_destination_(.+)$/))) {
    return { endpoint: "mining-sales-destination", args: { slug: match[1].replace(/_/g, "-") } };
  }
  return null;
}

function importV5(dir: string): number {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "memory.json") continue;
    const parsed = importV5File(file);
    if (!parsed) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Envelope;
    const def = ENDPOINT_BY_ID.get(parsed.endpoint);
    if (!def) continue;
    const args: Record<string, unknown> = {};
    for (const key of Object.keys(def.params)) if (parsed.args[key] !== undefined) args[key] = parsed.args[key];
    const key = canonicalKey({ endpoint: parsed.endpoint, args, version: 1 });
    const payload = raw.data ?? raw.body ?? raw;
    const hitId = recordHit({ endpoint: parsed.endpoint, args, cacheKey: key, status: 200, chargedKr: 0, source: "replay", sessionId: "seed" });
    const inferred = inferCovers(payload);
    putCache({
      cacheKey: key,
      endpoint: parsed.endpoint,
      args,
      status: 200,
      payload,
      coversFrom: (args.start as string) ?? inferred.from,
      coversTo: (args.end as string) ?? inferred.to,
      fetchedAt: safeIsoFromEpoch(raw.at),
      immutable: true,
      ttlDays: null,
      hitId,
    });
    upsertFacts(def.extract(payload, { args, hitId, asOf: safeIsoFromEpoch(raw.at).slice(0, 10) }));
    count += 1;
  }
  return count;
}

function importV4(dir: string): number {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as V4File;
    const tool = raw.tool ?? file.split("__")[0];
    const endpointId = TOOL_TO_ENDPOINT[tool];
    if (!endpointId) continue;
    const def = ENDPOINT_BY_ID.get(endpointId);
    if (!def) continue;
    const params = raw.params ?? {};
    const args: Record<string, unknown> = {};
    for (const key of Object.keys(def.params)) {
      if (params[key] !== undefined) args[key] = params[key];
    }
    const payload = raw.body ?? raw;
    const key = canonicalKey({ endpoint: endpointId, args, version: 1 });
    const hitId = recordHit({
      endpoint: endpointId,
      args,
      cacheKey: key,
      status: 200,
      chargedKr: 0,
      source: "replay",
      sessionId: "seed",
    });
    const inferred = inferCovers(payload);
    const entry: CacheEntry = {
      cacheKey: key,
      endpoint: endpointId,
      args,
      status: 200,
      payload,
      coversFrom: (args.start as string) ?? inferred.from,
      coversTo: (args.end as string) ?? inferred.to,
      fetchedAt: safeIsoFromEpoch(raw.at),
      immutable: true,
      ttlDays: null,
      hitId,
    };
    putCache(entry);
    upsertFacts(def.extract(payload, { args, hitId, asOf: entry.fetchedAt.slice(0, 10) }));
    count += 1;
  }
  return count;
}

const root = process.cwd();
const imported =
  importV4(path.join(root, "riset/raw-api-cache/v4")) +
  importV5(path.join(root, "riset/raw-api-cache/v5")) +
  importV5(path.join(root, "riset/raw-api-cache/v5-live-verify"));
console.log(`seed selesai: ${imported} entri cache + fakta dimuat ke data/investigraph.sqlite`);