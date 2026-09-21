import { getMode, spentToday } from "@/lib/db/api-hit-store";
import { resolveEndpoint, SectorsError } from "@/lib/sectors/client";
import { INVESTIGATION_CAP_KR, saveGraph, type PortfolioProfile } from "@/lib/db/portfolio-store";
import { buildGraphResult, distinctiveToken, normCompanyName, type GraphRecord, type HolderRef, type PortfolioGraph } from "@/lib/portfolio/graph";

type AnyRec = Record<string, unknown>;
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

type ReportParsed = {
  symbol: string;
  companyName: string;
  subsector?: string;
  marketCap?: number;
  close?: number;
  holders: HolderRef[];
  factIds: string[];
};

function parseReport(symbol: string, payload: unknown): ReportParsed | null {
  const p = (payload && typeof payload === "object" ? payload : {}) as AnyRec;
  const d = (p.data && typeof p.data === "object" ? p.data : p) as AnyRec;
  const companyName = String(d.company_name ?? symbol);
  const ov = (d.overview && typeof d.overview === "object" ? d.overview : {}) as AnyRec;
  const own = (d.ownership && typeof d.ownership === "object" ? d.ownership : {}) as AnyRec;
  const holders: HolderRef[] = [];
  const list = Array.isArray(own.major_shareholders) ? (own.major_shareholders as AnyRec[]) : [];
  for (const h of list) {
    const name = typeof h.name === "string" ? h.name.trim() : "";
    const pct = num(h.share_percentage);
    if (!name || pct === undefined) continue;
    holders.push({ name, pct });
  }
  return {
    symbol,
    companyName,
    subsector: typeof ov.sub_sector === "string" ? ov.sub_sector : undefined,
    marketCap: num(ov.market_cap),
    close: num(ov.last_close_price),
    holders,
    factIds: [],
  };
}

function attachFactIds(parsed: ReportParsed, facts: Array<{ id: string; label: string }>): GraphRecord {
  const ids = new Map<string, string>();
  for (const f of facts) {
    const m = f.label.match(/Pemegang saham utama [^:]+: (.+)$/);
    if (m) ids.set(normCompanyName(m[1]), f.id);
  }
  return {
    symbol: parsed.symbol,
    companyName: parsed.companyName,
    subsector: parsed.subsector,
    marketCap: parsed.marketCap,
    inPortfolio: false,
    holders: parsed.holders.map((h) => ({ ...h, factId: ids.get(normCompanyName(h.name)) })),
    factIds: facts.filter((f) => /market_cap|last_close|own_holder/.test(f.label)).slice(0, 10).map((f) => f.id),
  };
}

export type InvestigationOutcome = { graph: PortfolioGraph; status: "ok" | "partial" | "failed"; error: string | null };

export async function investigatePortfolio(profile: PortfolioProfile): Promise<InvestigationOutcome> {
  const mode = getMode();
  if (mode === "replay") {
    throw new Error("Investigasi portofolio butuh mode hybrid/live (cache belum tentu memuat emiten Anda).");
  }
  const calls: PortfolioGraph["calls"] = [];
  const issues: string[] = [];
  const records: GraphRecord[] = [];
  const weights: Record<string, number> = {};
  let spent = 0;

  const spendHeadroom = () => spent < INVESTIGATION_CAP_KR;

  for (const item of profile.items) {
    if (!spendHeadroom()) {
      issues.push(`Cap ${INVESTIGATION_CAP_KR} kr tercapai — ${item.symbol} dan sisanya dilewati.`);
      break;
    }
    try {
      let res = await resolveEndpoint("report", { symbol: item.symbol, sections: ["overview", "ownership"] }, { sessionId: "portfolio", turnId: "investigate" });
      spent += res.chargedKr;
      calls.push({ endpoint: "report", args: { symbol: item.symbol, sections: ["overview", "ownership"] }, kr: res.chargedKr, source: res.source });
      let parsed = parseReport(item.symbol, res.payload);
      if (!parsed || parsed.holders.length === 0) {
        try {
          const own = await resolveEndpoint("report", { symbol: item.symbol, sections: ["ownership"] }, { sessionId: "portfolio", turnId: "investigate" });
          spent += own.chargedKr;
          calls.push({ endpoint: "report", args: { symbol: item.symbol, sections: ["ownership"] }, kr: own.chargedKr, source: own.source });
          const parsedOwn = parseReport(item.symbol, own.payload);
          if (parsedOwn && parsedOwn.holders.length) {
            parsed = parsed ? { ...parsed, holders: parsedOwn.holders } : parsedOwn;
            res = { ...res, facts: [...res.facts, ...own.facts] };
          }
        } catch (err) {
          issues.push(`${item.symbol}: ownership solo — ${err instanceof SectorsError ? err.message : String(err)}`);
        }
      }
      if (!parsed) {
        issues.push(`${item.symbol}: respons laporan tidak terbaca.`);
        continue;
      }
      records.push({ ...attachFactIds(parsed, res.facts.map((f) => ({ id: f.id, label: f.label }))), inPortfolio: true });
      if (item.lots && item.avgPrice && parsed.close) {
        weights[item.symbol] = item.lots * 100 * parsed.close;
      }
    } catch (err) {
      const msg = err instanceof SectorsError ? `${err.message}${err.status ? ` [HTTP ${err.status}]` : ""}` : String(err);
      issues.push(`${item.symbol}: ${msg}`);
    }
  }

  const totalValue = Object.values(weights).reduce((a, b) => a + b, 0);
  const holdingCount = records.filter((r) => r.inPortfolio).length;
  if (totalValue > 0) {
    for (const s of Object.keys(weights)) weights[s] = Math.round((weights[s] / totalValue) * 1000) / 10;
  } else if (holdingCount > 0) {
    for (const r of records) if (r.inPortfolio) weights[r.symbol] = Math.round((100 / holdingCount) * 10) / 10;
  }

  const knownSymbols = new Set(records.map((r) => r.symbol));
  const portfolioNames = new Set(records.filter((r) => r.inPortfolio).map((r) => normCompanyName(r.companyName)));
  const entityPct = new Map<string, { name: string; pct: number; hits: number }>();
  for (const r of records) {
    for (const h of r.holders) {
      if (h.pct < 0.05 || /^(public|masyarakat|treasury)/i.test(h.name)) continue;
      const key = normCompanyName(h.name);
      if (portfolioNames.has(key) || portfolioNames.has(`${key} ${r.symbol.toLowerCase()}`)) continue;
      const cur = entityPct.get(key);
      if (cur) {
        cur.hits++;
        if (h.pct > cur.pct) {
          cur.pct = h.pct;
          cur.name = h.name;
        }
      } else entityPct.set(key, { name: h.name, pct: h.pct, hits: 1 });
    }
  }
  const expansions = [...entityPct.values()].sort((a, b) => b.hits - a.hits || b.pct - a.pct).slice(0, 8);
  for (const ent of expansions) {
    if (!spendHeadroom()) break;
    const token = distinctiveToken(ent.name);
    if (token.length < 5) continue;
    const entNorm = normCompanyName(ent.name);
    let accepted = 0;
    try {
      const res = await resolveEndpoint("screener", { where: `company_name like '%${token}%'`, limit: 5 }, { sessionId: "portfolio", turnId: "investigate" });
      spent += res.chargedKr;
      calls.push({ endpoint: "screener", args: { where: `company_name like '%${token}%'`, limit: 5 }, kr: res.chargedKr, source: res.source });
      const p = (res.payload && typeof res.payload === "object" ? res.payload : {}) as AnyRec;
      const rows = Array.isArray(p.results) ? (p.results as AnyRec[]) : Array.isArray((p.data as AnyRec)?.results) ? (((p.data as AnyRec).results ?? []) as AnyRec[]) : [];
      for (const row of rows) {
        if (accepted >= 2) break;
        const sym = String(row.symbol ?? "").replace(/\.JK$/i, "").toUpperCase();
        const name = String(row.company_name ?? "");
        const nameNorm = normCompanyName(name);
        const strong = nameNorm === entNorm || nameNorm.includes(entNorm) || (entNorm.length > 8 && entNorm.includes(nameNorm));
        if (!strong || !/^[A-Z]{4}$/.test(sym) || knownSymbols.has(sym)) continue;
        if (!spendHeadroom()) break;
        try {
          const parent = await resolveEndpoint("report", { symbol: sym, sections: ["overview", "ownership"] }, { sessionId: "portfolio", turnId: "investigate" });
          spent += parent.chargedKr;
          calls.push({ endpoint: "report", args: { symbol: sym, sections: ["overview", "ownership"] }, kr: parent.chargedKr, source: parent.source });
          const parsed = parseReport(sym, parent.payload);
          if (parsed) {
            records.push({ ...attachFactIds(parsed, parent.facts.map((f) => ({ id: f.id, label: f.label }))), inPortfolio: false });
            knownSymbols.add(sym);
            accepted++;
          }
        } catch (err) {
          issues.push(`${sym}: ${err instanceof SectorsError ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      issues.push(`Ekspansi "${ent.name}": ${err instanceof SectorsError ? err.message : String(err)}`);
    }
  }

  const { nodes, edges, clusters } = buildGraphResult(records, weights);
  const graph: PortfolioGraph = { createdAt: new Date().toISOString(), creditsKr: spent, calls, nodes, edges, clusters, issues };
  const failedHoldings = records.filter((r) => r.inPortfolio).length === 0;
  const status: InvestigationOutcome["status"] = failedHoldings ? "failed" : issues.length ? "partial" : "ok";
  const error = failedHoldings ? (issues[0] ?? "tidak ada emiten yang bisa dibaca") : null;
  saveGraph(status, spent, error, failedHoldings ? null : graph);
  return { graph, status, error };
}

export function todaySpendSnapshot(): number {
  return spentToday();
}
