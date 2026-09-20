import { ENDPOINTS } from "@/lib/sectors/registry";
import { resolveEndpoint, SectorsError } from "@/lib/sectors/client";
import { getMode, setMode, spentToday } from "@/lib/db/api-hit-store";
import { estimateCost } from "@/lib/sectors/registry";

const argsFor: Record<string, Record<string, unknown>> = {
  daily: { symbol: "BRMS" },
  "foreign-flow": { symbol: "BRMS" },
  "index-daily": { index_code: "ihsg" },
  "idx-total": {},
  screener: { where: "pe_ttm > 0", order_by: "market_cap", desc: true, limit: 5 },
  "top-changes": { classifications: ["top_gainers"], periods: ["1d"], n_stock: 3 },
  "most-traded": { n_stock: 3 },
  "listing-performance": { symbol: "BRMS" },
  report: { symbol: "BRMS", sections: ["overview"] },
  quarterly: { symbol: "BRMS", n_quarters: 2 },
  segments: { symbol: "BRMS" },
  shareholders: { symbol: "BRMS" },
  "corporate-actions": { type: ["dividend"] },
  "corporate-actions-symbol": { symbol: "BRMS" },
  suspensions: { symbol: "BRMS" },
  news: { symbols: "BRMS", limit: 5 },
  filings: { symbol: "BRMS", limit: 5 },
  brokers: {},
  "brokers-top": { metric: "gross", n_brokers: 5 },
  "broker-summary": { symbol: "BRMS" },
  "broker-summary-top": { symbol: "BRMS", n_brokers: 5 },
  "broker-activity": { broker_code: "YP", symbol: "BRMS" },
  "broker-activity-top": { broker_code: "YP", n_brokers: 5 },
  "free-float": {},
  subsectors: {},
  industries: {},
  subindustries: {},
  tags: {},
  "subsector-report": { sub_sector: "banks", sections: ["statistics"] },
  "mining-commodities": {},
  "mining-price": { commodity_name: "coal", start_year: 2025, end_year: 2026 },
  "mining-sales-destination": { slug: "pt-alamtri-resources-indonesia-tbk" },
  "mining-company-performance": { slug: "pt-alamtri-resources-indonesia-tbk" },
  "mining-licenses": { company: "pt-bukit-asam-tbk", limit: 5 },
  "mining-contracts": { mine_owner: "pt-alamtri-resources-indonesia-tbk" },
  "mining-total-production": { commodity_type: "Coal" },
  "mining-resources": { province: "Kalimantan Timur", year: 2024 },
  "mining-company-detail": { slug: "pt-alamtri-resources-indonesia-tbk" },
  "mining-exports": { commodity_type: "Coal", year: 2024 },
  "mining-global": { commodity_type: "Coal" },
  "mining-auctions": { commodity_type: "Coal", limit: 5 },
  "mining-sites": { commodity_type: "Coal", limit: 5 },
  "index-universe": {},
  "company-universe": { limit: 30 },
  "financial-dates": { symbol: "BRMS" },
  "segments-list": {},
  "quarterly-dates-universe": { limit: 10 },
  "foreign-flow-universe": { limit: 10 },
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const live = process.argv.includes("--live");
  const budget = Number(process.argv.find((a) => a.startsWith("--budget="))?.split("=")[1] ?? "61");
  const startSpend = spentToday();
  console.log(`sweep ${ENDPOINTS.length} endpoint · mode ${getMode()} · ${live ? "LIVE" : "cache-only"} · budget ${budget} kr`);
  if (dryRun) {
    let total = 0;
    for (const def of ENDPOINTS) {
      const kr = estimateCost(def, argsFor[def.id] ?? {});
      total += kr;
      console.log(`${def.id.padEnd(28)} ${kr} kr  ${def.desc}`);
    }
    console.log(`total estimasi: ${total} kr`);
    return;
  }
  if (!live) setMode("replay");
  let kr = 0;
  let ok = 0;
  let fail = 0;
  const failures: string[] = [];
  for (const def of ENDPOINTS) {
    if (kr >= budget) {
      console.log(`budget ${budget} kr tercapai, berhenti (${ENDPOINTS.length - ok - fail} endpoint belum diuji)`);
      break;
    }
    try {
      const res = await resolveEndpoint(def.id, argsFor[def.id] ?? {}, {});
      kr += res.chargedKr;
      ok += 1;
      console.log(`✓ ${def.id.padEnd(28)} ${res.status} ${res.source.padEnd(8)} ${res.chargedKr} kr  ${res.facts.length} fakta`);
    } catch (err) {
      fail += 1;
      const message = err instanceof SectorsError ? `${err.message}${err.status ? ` [${err.status}]` : ""}` : String(err);
      failures.push(`${def.id}: ${message}`);
      console.log(`✗ ${def.id.padEnd(28)} ${message}`);
    }
  }
  console.log(`\nsweep selesai: ${ok} ok, ${fail} gagal, ${kr} kr (this run) · ${(spentToday() - startSpend).toFixed(0)} kr hari ini`);
  if (failures.length) console.log(`gagal:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
}

void main();