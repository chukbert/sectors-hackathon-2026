import type { Domain } from "@/lib/config";
import type { Fact, FactUnit } from "@/lib/facts";
import { makeFact } from "@/lib/facts";
import { todayJakarta, window } from "@/lib/util/time";

export type ParamSpec = {
  in: "path" | "query";
  required?: boolean;
  desc?: string;
};

export type CostModel =
  | { kind: "flat"; kr: number }
  | { kind: "per-section"; kr: number }
  | { kind: "per-quarter"; kr: number }
  | { kind: "per-page"; kr: number }
  | { kind: "per-combo"; kr: number }
  | { kind: "screener" };

export type ExtractCtx = {
  args: Record<string, unknown>;
  hitId?: string;
  asOf: string;
};

export type EndpointDef = {
  id: string;
  path: string;
  params: Record<string, ParamSpec>;
  cost: CostModel;
  domain: Domain;
  levelHint: number;
  desc: string;
  extract: (payload: unknown, ctx: ExtractCtx) => Fact[];
};

type AnyRec = Record<string, unknown>;

const get = (value: unknown, path: string): unknown => {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as AnyRec)[p];
    } else return undefined;
  }
  return cur;
};

const arr = (value: unknown, path: string): AnyRec[] => {
  const v = get(value, path);
  return Array.isArray(v) ? (v as AnyRec[]) : [];
};

const arrayBody = (value: unknown): AnyRec[] => {
  if (Array.isArray(value)) return value as AnyRec[];
  const d = get(value, "data");
  return Array.isArray(d) ? (d as AnyRec[]) : [];
};

const objBody = (value: unknown): AnyRec => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const d = (value as AnyRec).data;
    if (d && typeof d === "object" && !Array.isArray(d)) return d as AnyRec;
    return value as AnyRec;
  }
  return {};
};

const latest = (rows: AnyRec[], key = "date"): AnyRec | undefined =>
  rows.length ? [...rows].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""))).at(-1) : undefined;

const first = (rows: AnyRec[], key = "date"): AnyRec | undefined =>
  rows.length ? [...rows].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")))[0] : undefined;

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : v === null ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);

function baseFact(
  ctx: ExtractCtx,
  endpoint: string,
  key: string,
  label: string,
  valueNum: number | undefined,
  unit: FactUnit,
  asOf?: string,
  valueText?: string,
): Fact {
  return makeFact({
    label,
    key,
    valueNum,
    valueText,
    unit,
    asOf: asOf ?? ctx.asOf,
    endpoint,
    args: ctx.args,
    hitId: ctx.hitId,
  });
}

const SYM = (ctx: ExtractCtx, fallback = "") => String(ctx.args.symbol ?? ctx.args.index_code ?? ctx.args.slug ?? fallback);

export const ENDPOINTS: EndpointDef[] = [
  {
    id: "daily",
    path: "/v2/daily/{symbol}/",
    params: { symbol: { in: "path", required: true }, start: { in: "query" }, end: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "harga",
    levelHint: 1,
    desc: "Harga harian (close/open/high/low/volume/market cap) 1 emiten, ≤90 hari.",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const last = latest(rows);
      const prev = rows.length > 1 ? rows[rows.length - 2] : undefined;
      const close = num(last?.close);
      const prevClose = num(prev?.close);
      const out: Fact[] = [];
      if (close !== undefined)
        out.push(baseFact(ctx, "daily", "close", `Harga penutupan ${SYM(ctx)} (${last?.date})`, close, "price", String(last?.date)));
      if (close !== undefined && prevClose)
        out.push(baseFact(ctx, "daily", "close_change", `Perubahan harga ${SYM(ctx)} vs hari sebelumnya`, (close - prevClose) / prevClose, "%", String(last?.date)));
      const mc = num(last?.market_cap);
      if (mc !== undefined) out.push(baseFact(ctx, "daily", "market_cap", `Kapitalisasi pasar ${SYM(ctx)}`, mc, "IDR", String(last?.date)));
      const vol = num(last?.volume);
      if (vol !== undefined) out.push(baseFact(ctx, "daily", "volume", `Volume transaksi ${SYM(ctx)} (${last?.date})`, vol, "volume", String(last?.date)));
      const hi = rows.reduce<number | undefined>((acc, r) => {
        const v = num(r.close);
        return v !== undefined && (acc === undefined || v > acc) ? v : acc;
      }, undefined);
      const lo = rows.reduce<number | undefined>((acc, r) => {
        const v = num(r.close);
        return v !== undefined && (acc === undefined || v < acc) ? v : acc;
      }, undefined);
      if (hi !== undefined)
        out.push(baseFact(ctx, "daily", "high_window", `Harga tertinggi ${SYM(ctx)} dalam jendela`, hi, "price"));
      if (lo !== undefined)
        out.push(baseFact(ctx, "daily", "low_window", `Harga terendah ${SYM(ctx)} dalam jendela`, lo, "price"));
      return out;
    },
  },
  {
    id: "foreign-flow",
    path: "/v2/foreign-flow/{symbol}/",
    params: { symbol: { in: "path", required: true }, start: { in: "query" }, end: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "asing",
    levelHint: 2,
    desc: "Net foreign flow harian per emiten atau IHSG, ≤90 hari.",
    extract: (p, ctx) => {
      const rows = arr(p, "data");
      const last = latest(rows);
      const windowRows = rows.filter((r) => num(r.net_foreign_inflow) !== undefined);
      const total = windowRows.reduce((a, r) => a + (num(r.net_foreign_inflow) ?? 0), 0);
      const out: Fact[] = [];
      if (windowRows.length)
        out.push(baseFact(ctx, "foreign-flow", "net_window", `Net foreign flow ${SYM(ctx, "IHSG")} dalam jendela`, total, "IDR"));
      if (num(last?.net_foreign_inflow) !== undefined)
        out.push(baseFact(ctx, "foreign-flow", "net_last", `Net foreign flow ${SYM(ctx, "IHSG")} (${last?.date})`, num(last?.net_foreign_inflow), "IDR", String(last?.date)));
      if (num(last?.foreign_share) !== undefined)
        out.push(baseFact(ctx, "foreign-flow", "foreign_share", `Porsi transaksi asing ${SYM(ctx, "IHSG")} (${last?.date})`, num(last?.foreign_share), "%", String(last?.date)));
      const buys = windowRows.reduce((a, r) => a + (num(r.foreign_buy_idr) ?? 0), 0);
      const sells = windowRows.reduce((a, r) => a + (num(r.foreign_sell_idr) ?? 0), 0);
      if (buys) out.push(baseFact(ctx, "foreign-flow", "foreign_buy", `Total beli asing ${SYM(ctx, "IHSG")} dalam jendela`, buys, "IDR"));
      if (sells) out.push(baseFact(ctx, "foreign-flow", "foreign_sell", `Total jual asing ${SYM(ctx, "IHSG")} dalam jendela`, sells, "IDR"));
      return out;
    },
  },
  {
    id: "index-daily",
    path: "/v2/index-daily/{index_code}/",
    params: { index_code: { in: "path", required: true }, start: { in: "query" }, end: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "sektor",
    levelHint: 2,
    desc: "Level harian indeks (kode lowercase: ihsg, lq45, idx30, …), ≤90 hari.",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const last = latest(rows);
      const lev = num(last?.price);
      const out: Fact[] = [];
      if (lev !== undefined)
        out.push(baseFact(ctx, "index-daily", "level", `Level ${String(ctx.args.index_code).toUpperCase()} (${last?.date})`, lev, "price", String(last?.date)));
      const firstRow = first(rows);
      const startLev = num(firstRow?.price);
      if (lev !== undefined && startLev)
        out.push(baseFact(ctx, "index-daily", "level_change", `Perubahan ${String(ctx.args.index_code).toUpperCase()} dalam jendela`, (lev - startLev) / startLev, "%", String(last?.date)));
      return out;
    },
  },
  {
    id: "idx-total",
    path: "/v2/idx-total/",
    params: { start: { in: "query" }, end: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "sektor",
    levelHint: 2,
    desc: "Kapitalisasi pasar total IDX historis, ≤90 hari.",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const last = latest(rows);
      const cap = num(last?.idx_total_market_cap);
      const out: Fact[] = [];
      if (cap !== undefined)
        out.push(baseFact(ctx, "idx-total", "market_cap", `Kapitalisasi pasar total IDX (${last?.date})`, cap, "IDR", String(last?.date)));
      const firstRow = first(rows);
      const prev = num(firstRow?.idx_total_market_cap);
      if (cap !== undefined && prev)
        out.push(baseFact(ctx, "idx-total", "market_cap_change", `Perubahan kapitalisasi pasar IDX dalam jendela`, (cap - prev) / prev, "%", String(last?.date)));
      return out;
    },
  },
  {
    id: "screener",
    path: "/v2/companies/",
    params: {
      where: { in: "query" },
      q: { in: "query" },
      order_by: { in: "query" },
      desc: { in: "query" },
      limit: { in: "query" },
      offset: { in: "query" },
      include_query_values: { in: "query" },
    },
    cost: { kind: "screener" },
    domain: "screening",
    levelHint: 3,
    desc: "Screener emiten (where/order_by 1kr; q natural language 3kr).",
    extract: (p, ctx) => {
      const rows = arr(p, "results").length ? arr(p, "results") : arr(p, "data.results");
      const total = num(get(p, "pagination.total_count")) ?? num(get(p, "data.pagination.total_count")) ?? rows.length;
      const out: Fact[] = [
        baseFact(ctx, "screener", "count", `Jumlah emiten yang cocok dengan filter`, total, "count"),
        baseFact(ctx, "screener", "top_symbols", `Emiten teratas hasil screener`, undefined, "text", ctx.asOf, rows.map((r) => String(r.symbol)).join(", ")),
      ];
      rows.slice(0, 5).forEach((r, i) => {
        const qv = (r.query_values ?? {}) as AnyRec;
        const firstNum = Object.entries(qv).find(([, v]) => num(v) !== undefined);
        if (firstNum)
          out.push(
            baseFact(ctx, "screener", `row${i}_${firstNum[0]}`, `${String(r.symbol)} ${String(r.company_name ?? "")} — ${firstNum[0]}`, num(firstNum[1]), "ratio", ctx.asOf),
          );
      });
      return out;
    },
  },
  {
    id: "top-changes",
    path: "/v2/companies/top-changes/",
    params: {
      classifications: { in: "query" },
      periods: { in: "query" },
      n_stock: { in: "query" },
      sub_sector: { in: "query" },
      min_mcap_billion: { in: "query" },
    },
    cost: { kind: "per-combo", kr: 1 },
    domain: "screening",
    levelHint: 3,
    desc: "Top gainers/losers per periode (1kr per klasifikasi×periode).",
    extract: (p, ctx) => {
      const out: Fact[] = [];
      for (const cls of ["top_gainers", "top_losers"]) {
        for (const period of ["1d", "7d", "14d", "30d", "365d"]) {
          const rows = arr(p, `${cls}.${period}`).length ? arr(p, `${cls}.${period}`) : arr(p, `data.${cls}.${period}`);
          if (rows.length === 0) continue;
          out.push(baseFact(ctx, "top-changes", `${cls}_${period}`, `${cls === "top_gainers" ? "Top gainers" : "Top losers"} ${period}`, undefined, "text", ctx.asOf, rows.map((r) => `${r.symbol} ${num(r.price_change) !== undefined ? (num(r.price_change)! * 100).toFixed(1) + "%" : ""}`).join(", ")));
          const top = rows[0];
          if (num(top.price_change) !== undefined)
            out.push(baseFact(ctx, "top-changes", `${cls}_${period}_lead`, `Pergerakan ${String(top.symbol)} (${period})`, num(top.price_change), "%", ctx.asOf));
        }
      }
      return out;
    },
  },
  {
    id: "most-traded",
    path: "/v2/most-traded/",
    params: { start: { in: "query" }, end: { in: "query" }, n_stock: { in: "query" }, sub_sector: { in: "query" }, adjusted: { in: "query" } },
    cost: { kind: "flat", kr: 2 },
    domain: "harga",
    levelHint: 4,
    desc: "Saham paling ramai diperdagangkan, keyed by date (2kr).",
    extract: (p, ctx) => {
      const data = objBody(p);
      const out: Fact[] = [];
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const dates = Object.keys(data as AnyRec).sort();
        const lastDate = dates.at(-1);
        if (lastDate) {
          const rows = (data as AnyRec)[lastDate] as AnyRec[];
          const top = Array.isArray(rows) && rows.length ? rows[0] : undefined;
          if (top) {
            out.push(baseFact(ctx, "most-traded", "top_symbol", `Saham paling ramai (${lastDate})`, undefined, "text", lastDate, rows.map((r) => String(r.symbol)).slice(0, 5).join(", ")));
            if (num(top.volume) !== undefined)
              out.push(baseFact(ctx, "most-traded", "top_volume", `Volume terbesar ${String(top.symbol)} (${lastDate})`, num(top.volume), "volume", lastDate));
          }
        }
      }
      return out;
    },
  },
  {
    id: "listing-performance",
    path: "/v2/listing-performance/{symbol}/",
    params: { symbol: { in: "path", required: true } },
    cost: { kind: "flat", kr: 1 },
    domain: "ipo",
    levelHint: 5,
    desc: "Performa harga sejak IPO (7/30/90/365 hari).",
    extract: (p, ctx) => {
      const obj = objBody(p);
      const out: Fact[] = [];
      for (const k of ["7d", "30d", "90d", "365d"]) {
        const v = num(obj?.[k]);
        if (v !== undefined)
          out.push(baseFact(ctx, "listing-performance", `change_${k}`, `Perubahan ${SYM(ctx)} sejak listing (${k})`, v, "%"));
      }
      const gain = num(obj?.gain_since_listing) ?? num(obj?.gain);
      if (gain !== undefined)
        out.push(baseFact(ctx, "listing-performance", "gain_since_listing", `Gain ${SYM(ctx)} sejak listing`, gain, "%"));
      return out;
    },
  },
  {
    id: "report",
    path: "/v2/company/report/{symbol}/",
    params: { symbol: { in: "path", required: true }, sections: { in: "query" } },
    cost: { kind: "per-section", kr: 1 },
    domain: "fundamental",
    levelHint: 2,
    desc: "Laporan emiten per section (overview/valuation/future/peers/financials/dividend/management/ownership) 1kr/section.",
    extract: (p, ctx) => {
      const d = (get(p, "data") ?? p) as AnyRec;
      const out: Fact[] = [];
      const ov = d?.overview as AnyRec | undefined;
      if (ov) {
        if (num(ov.market_cap) !== undefined) out.push(baseFact(ctx, "report", "market_cap", `Kapitalisasi pasar ${SYM(ctx)}`, num(ov.market_cap), "IDR"));
        if (num(ov.market_cap_rank) !== undefined) out.push(baseFact(ctx, "report", "market_cap_rank", `Peringkat kapitalisasi ${SYM(ctx)}`, num(ov.market_cap_rank), "count"));
        if (num(ov.last_close_price) !== undefined) out.push(baseFact(ctx, "report", "last_close", `Harga penutupan terakhir ${SYM(ctx)}`, num(ov.last_close_price), "price"));
        if (ov.sub_sector) out.push(baseFact(ctx, "report", "sub_sector", `Subsektor ${SYM(ctx)}`, undefined, "text", ctx.asOf, String(ov.sub_sector)));
        if (ov.listing_date) out.push(baseFact(ctx, "report", "listing_date", `Tanggal listing ${SYM(ctx)}`, undefined, "date", String(ov.listing_date)));
        const tags = Array.isArray(ov.tags) ? (ov.tags as string[]).join(", ") : "";
        if (tags) out.push(baseFact(ctx, "report", "tags", `Tag klasifikasi ${SYM(ctx)}`, undefined, "text", ctx.asOf, tags));
      }
      const val = d?.valuation as AnyRec | undefined;
      if (val) {
        for (const k of ["forward_pe", "intrinsic_value"]) {
          if (num(val[k]) !== undefined) out.push(baseFact(ctx, "report", k, `${k} ${SYM(ctx)}`, num(val[k]), k.includes("value") ? "price" : "x"));
        }
        const hv = Array.isArray(val.historical_valuation) ? (val.historical_valuation as AnyRec[]) : [];
        const last = latest(hv, "year");
        for (const k of ["pe", "pb", "ps", "pcf", "peg", "pe_peer_avg", "pb_peer_avg", "enterprise_to_ebitda"]) {
          if (num(last?.[k]) !== undefined)
            out.push(baseFact(ctx, "report", `val_${k}`, `${k.toUpperCase()} ${SYM(ctx)} (${last?.year})`, num(last?.[k]), k.includes("peer") || ["pe", "pb", "ps", "pcf", "peg"].includes(k) ? "x" : "ratio"));
        }
      }
      const div = d?.dividend as AnyRec | undefined;
      if (div) {
        for (const k of ["yield_ttm", "dividend_yield_avg", "payout_ratio", "cash_payout_ratio", "dividend_ttm"]) {
          if (num(div[k]) !== undefined) out.push(baseFact(ctx, "report", `div_${k}`, `${k} ${SYM(ctx)}`, num(div[k]), k.includes("ratio") || k.includes("yield") || k === "dividend_yield_avg" ? "%" : "IDR"));
        }
        const hist = div.historical_dividends as AnyRec | undefined;
        if (hist && typeof hist === "object") {
          const years = Object.keys(hist).sort();
          const lastYear = years.at(-1);
          const h = lastYear ? (hist[lastYear] as AnyRec) : undefined;
          if (num(h?.total_dividend) !== undefined)
            out.push(baseFact(ctx, "report", "div_last_year", `Dividen total ${SYM(ctx)} ${lastYear}`, num(h?.total_dividend), "IDR"));
          if (num(h?.total_yield) !== undefined)
            out.push(baseFact(ctx, "report", "div_last_yield", `Yield dividen ${SYM(ctx)} ${lastYear}`, num(h?.total_yield), "%"));
        }
      }
      const future = d?.future as AnyRec | undefined;
      if (future) {
        const forecast = (future.forecast ?? future) as AnyRec;
        for (const k of ["eps_growth", "revenue_growth", "rating", "target_price"]) {
          const v = forecast?.[k];
          if (num(v) !== undefined) out.push(baseFact(ctx, "report", `future_${k}`, `Proyeksi ${k} ${SYM(ctx)}`, num(v), k.includes("growth") ? "%" : k === "rating" ? "text" : "price"));
          else if (typeof v === "string" && v)
            out.push(baseFact(ctx, "report", `future_${k}`, `Proyeksi ${k} ${SYM(ctx)}`, undefined, "text", ctx.asOf, v));
        }
      }
      const fin = d?.financials as AnyRec | undefined;
      if (fin) {
        for (const k of ["revenue", "net_income", "total_assets", "total_equity", "total_debt", "operating_cash_flow", "eps", "roe", "roa", "der", "net_margin", "gross_margin"]) {
          if (num(fin[k]) !== undefined)
            out.push(baseFact(ctx, "report", `fin_${k}`, `${k} ${SYM(ctx)}`, num(fin[k]), k.includes("margin") || k === "roe" || k === "roa" ? "%" : k === "eps" ? "ratio" : k === "der" ? "x" : "IDR"));
        }
      }
      const own = d?.ownership as AnyRec | undefined;
      if (own) {
        for (const k of ["free_float", "foreign_ownership", "institutional_ownership", "retail_ownership"]) {
          if (num(own[k]) !== undefined) out.push(baseFact(ctx, "report", `own_${k}`, `${k} ${SYM(ctx)}`, num(own[k]), "%"));
        }
      }
      const mgmt = d?.management as AnyRec | undefined;
      if (mgmt && Array.isArray(mgmt.board)) {
        out.push(baseFact(ctx, "report", "board_count", `Jumlah direksi/komisaris ${SYM(ctx)}`, (mgmt.board as unknown[]).length, "count"));
      }
      if (d?.company_name) out.push(baseFact(ctx, "report", "company_name", `Nama perusahaan`, undefined, "text", ctx.asOf, String(d.company_name)));
      return out;
    },
  },
  {
    id: "quarterly",
    path: "/v2/financials/quarterly/{symbol}/",
    params: { symbol: { in: "path", required: true }, n_quarters: { in: "query" }, report_date: { in: "query" }, approx: { in: "query" } },
    cost: { kind: "per-quarter", kr: 1 },
    domain: "fundamental",
    levelHint: 4,
    desc: "Laporan keuangan kuartalan (1kr per kuartal).",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const sorted = [...rows].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
      const last = sorted.at(-1);
      const prev = sorted.at(-2);
      const out: Fact[] = [];
      const metrics: Array<[string, FactUnit]> = [
        ["revenue", "IDR"],
        ["operating_pnl", "IDR"],
        ["net_income", "IDR"],
        ["total_assets", "IDR"],
        ["total_equity", "IDR"],
        ["eps", "ratio"],
        ["roe", "%"],
        ["der", "x"],
        ["net_margin", "%"],
      ];
      if (last) {
        for (const [k, unit] of metrics) {
          const v = num(last[k]);
          if (v !== undefined) out.push(baseFact(ctx, "quarterly", k, `${k} ${SYM(ctx)} ${last.date}`, v, unit, String(last.date)));
        }
        if (prev) {
          const r1 = num(last.revenue);
          const r0 = num(prev.revenue);
          if (r1 !== undefined && r0)
            out.push(baseFact(ctx, "quarterly", "revenue_yoy", `Pertumbuhan revenue ${SYM(ctx)} QoQ`, (r1 - r0) / Math.abs(r0), "%", String(last.date)));
        }
      }
      const first = sorted[0];
      const rLast = num(last?.revenue);
      const rFirst = num(first?.revenue);
      if (rLast !== undefined && rFirst && sorted.length > 2)
        out.push(baseFact(ctx, "quarterly", "revenue_trend", `Tren revenue ${SYM(ctx)} ${first?.date}→${last?.date}`, (rLast - rFirst) / Math.abs(rFirst), "%", String(last?.date)));
      return out;
    },
  },
  {
    id: "segments",
    path: "/v2/company/get-segments/{symbol}/",
    params: { symbol: { in: "path", required: true }, financial_year: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "fundamental",
    levelHint: 6,
    desc: "Rincian segmen pendapatan (Sankey-ready).",
    extract: (p, ctx) => {
      const d = objBody(p);
      const out: Fact[] = [];
      for (const k of ["revenue_breakdown", "cost_breakdown"]) {
        const bd = d?.[k];
        if (Array.isArray(bd) && bd.length) {
          const items = bd as AnyRec[];
          const total = items.reduce((a, r) => a + (num(r.value) ?? 0), 0);
          const top = [...items].sort((x, y) => (num(y.value) ?? 0) - (num(x.value) ?? 0))[0];
          out.push(baseFact(ctx, "segments", `${k}_total`, `Total ${k} ${SYM(ctx)}`, total, "IDR"));
          out.push(baseFact(ctx, "segments", `${k}_top`, `Segmen terbesar ${k} ${SYM(ctx)}`, undefined, "text", ctx.asOf, `${top.source} → ${top.target}: ${num(top.value)}`));
          out.push(baseFact(ctx, "segments", `${k}_top_share`, `Porsi segmen terbesar ${k}`, total ? (num(top.value) ?? 0) / total : undefined, "%"));
        }
      }
      return out;
    },
  },
  {
    id: "shareholders",
    path: "/v2/company/shareholders-composition/{symbol}/",
    params: { symbol: { in: "path", required: true }, year: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "asing",
    levelHint: 6,
    desc: "Komposisi pemegang saham.",
    extract: (p, ctx) => {
      const d = objBody(p);
      const rows = Array.isArray(d) ? (d as AnyRec[]) : Array.isArray(d.data) ? (d.data as AnyRec[]) : [];
      const out: Fact[] = [];
      for (const r of rows.slice(0, 8)) {
        const pct = num(r.percentage) ?? num(r.share_percentage);
        const name = r.name ?? r.holder_name ?? r.shareholder;
        if (pct !== undefined && name)
          out.push(baseFact(ctx, "shareholders", `holder_${String(name).slice(0, 24)}`, `Pemegang saham ${SYM(ctx)}: ${name}`, pct, "%"));
      }
      return out;
    },
  },
  {
    id: "corporate-actions",
    path: "/v2/corporate-actions/",
    params: { start: { in: "query" }, end: { in: "query" }, type: { in: "query" } },
    cost: { kind: "per-combo", kr: 1 },
    domain: "kalender",
    levelHint: 2,
    desc: "Aksi korporasi seluruh pasar per tipe (1kr/tipe).",
    extract: (p, ctx) => {
      const d = objBody(p);
      const out: Fact[] = [];
      const types = Object.keys(d ?? {});
      for (const t of types) {
        const rows = Array.isArray(d[t]) ? (d[t] as AnyRec[]) : [];
        if (!rows.length) continue;
        const sorted = [...rows].sort((a, b) => String(a.ex_date ?? a.date ?? "").localeCompare(String(b.ex_date ?? b.date ?? "")));
        const next = sorted.find((r) => String(r.ex_date ?? r.date ?? "") >= todayJakarta()) ?? sorted.at(-1);
        out.push(
          baseFact(ctx, "corporate-actions", `count_${t}`, `Jumlah aksi korporasi tipe ${t} dalam jendela`, rows.length, "count"),
        );
        if (next)
          out.push(
            baseFact(
              ctx,
              "corporate-actions",
              `next_${t}_${next.symbol}`,
              `Aksi korporasi ${t} ${next.symbol} (ex ${next.ex_date ?? next.date})`,
              num(next.dividend_amount) ?? num(next.split_ratio),
              t === "dividend" || t === "upcoming_dividend" ? "IDR" : "ratio",
              String(next.ex_date ?? next.date),
            ),
          );
      }
      return out;
    },
  },
  {
    id: "corporate-actions-symbol",
    path: "/v2/company/corporate-actions/{symbol}/",
    params: { symbol: { in: "path", required: true } },
    cost: { kind: "flat", kr: 1 },
    domain: "dividen",
    levelHint: 2,
    desc: "Aksi korporasi satu emiten (semua riwayat).",
    extract: (p, ctx) => {
      const d = objBody(p);
      const out: Fact[] = [];
      const divs = Array.isArray(d?.dividend) ? (d.dividend as AnyRec[]) : [];
      if (divs.length) {
        const sorted = [...divs].sort((a, b) => String(a.ex_date ?? "").localeCompare(String(b.ex_date ?? "")));
        const last = sorted.at(-1);
        out.push(baseFact(ctx, "corporate-actions-symbol", "last_dividend", `Dividen terakhir ${SYM(ctx)} (ex ${last?.ex_date})`, num(last?.dividend_amount), "IDR", String(last?.ex_date)));
        out.push(baseFact(ctx, "corporate-actions-symbol", "dividend_count", `Jumlah riwayat dividen ${SYM(ctx)}`, divs.length, "count"));
      }
      const splits = Array.isArray(d?.stock_split) ? (d.stock_split as AnyRec[]) : [];
      if (splits.length) out.push(baseFact(ctx, "corporate-actions-symbol", "split_count", `Jumlah stock split ${SYM(ctx)}`, splits.length, "count"));
      return out;
    },
  },
  {
    id: "suspensions",
    path: "/v2/suspensions/",
    params: { symbol: { in: "query" }, start: { in: "query" }, end: { in: "query" }, limit: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "klaim",
    levelHint: 7,
    desc: "Riwayat suspensi saham.",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results");
      const out: Fact[] = [baseFact(ctx, "suspensions", "count", `Jumlah suspensi${ctx.args.symbol ? ` ${SYM(ctx)}` : ""} dalam jendela`, rows.length, "count")];
      const last = rows.length ? [...rows].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? ""))).at(-1) : undefined;
      if (last)
        out.push(baseFact(ctx, "suspensions", "last_reason", `Suspensi terakhir ${last.symbol ?? ""} (${last.date})`, undefined, "text", String(last.date), String(last.reason ?? "")));
      return out;
    },
  },
  {
    id: "news",
    path: "/v2/news/",
    params: {
      symbols: { in: "query" },
      sector: { in: "query" },
      sub_sector: { in: "query" },
      start: { in: "query" },
      end: { in: "query" },
      limit: { in: "query" },
      keyword: { in: "query" },
      extension: { in: "query" },
    },
    cost: { kind: "flat", kr: 1 },
    domain: "klaim",
    levelHint: 3,
    desc: "Berita IDX/mining (filter simbol, sektor, tag, keyword).",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results");
      const out: Fact[] = [];
      rows.slice(0, 5).forEach((r, i) => {
        out.push(
          baseFact(ctx, "news", `headline${i}`, `Berita ${i + 1} (${String(r.timestamp).slice(0, 10)})`, undefined, "text", String(r.timestamp).slice(0, 10), `${r.title} — ${r.source}`),
        );
      });
      out.push(baseFact(ctx, "news", "count", `Jumlah berita dalam jendela`, rows.length, "count"));
      return out;
    },
  },
  {
    id: "filings",
    path: "/v2/filings/",
    params: {
      symbol: { in: "query" },
      transaction_type: { in: "query" },
      holder_type: { in: "query" },
      start: { in: "query" },
      end: { in: "query" },
      limit: { in: "query" },
      tags: { in: "query" },
    },
    cost: { kind: "flat", kr: 1 },
    domain: "klaim",
    levelHint: 7,
    desc: "Filings insider (beli/jual oleh insider & pemegang saham besar).",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results");
      const buys = rows.filter((r) => r.transaction_type === "buy");
      const sells = rows.filter((r) => r.transaction_type === "sell");
      const out: Fact[] = [
        baseFact(ctx, "filings", "buy_count", `Jumlah filing BELI${ctx.args.symbol ? ` ${SYM(ctx)}` : ""}`, buys.length, "count"),
        baseFact(ctx, "filings", "sell_count", `Jumlah filing JUAL${ctx.args.symbol ? ` ${SYM(ctx)}` : ""}`, sells.length, "count"),
      ];
      const top = rows[0];
      if (top)
        out.push(
          baseFact(ctx, "filings", "latest", `Filing terbaru ${top.symbol} (${String(top.timestamp).slice(0, 10)})`, num(top.transaction_value), "IDR", String(top.timestamp).slice(0, 10), String(top.title ?? "")),
        );
      const buyValue = buys.reduce((a, r) => a + (num(r.transaction_value) ?? 0), 0);
      const sellValue = sells.reduce((a, r) => a + (num(r.transaction_value) ?? 0), 0);
      if (buyValue) out.push(baseFact(ctx, "filings", "buy_value", `Nilai filing beli dalam jendela`, buyValue, "IDR"));
      if (sellValue) out.push(baseFact(ctx, "filings", "sell_value", `Nilai filing jual dalam jendela`, sellValue, "IDR"));
      return out;
    },
  },
  {
    id: "brokers",
    path: "/v2/brokers/",
    params: { origin: { in: "query" }, cohort: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "bandarmologi",
    levelHint: 8,
    desc: "Registry broker (kode, nama, asing/domestik, cohort).",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [baseFact(ctx, "brokers", "count", `Jumlah broker terdaftar`, rows.length, "count")];
      const byCode = new Map(rows.map((r) => [String(r.code), r]));
      for (const code of ["BK", "YP", "CC", "AK", "MG", "DX", "KZ", "AZ"]) {
        const r = byCode.get(code);
        if (r)
          out.push(
            baseFact(ctx, "brokers", `broker_${code}`, `Broker ${code} — ${r.name}`, undefined, "text", ctx.asOf, `${r.is_foreign ? "asing" : "domestik"} / ${r.cohort}`),
          );
      }
      return out;
    },
  },
  {
    id: "brokers-top",
    path: "/v2/brokers/top/",
    params: { date: { in: "query" }, metric: { in: "query" }, origin: { in: "query" }, cohort: { in: "query" }, n_brokers: { in: "query" }, foreign: { in: "query" } },
    cost: { kind: "flat", kr: 2 },
    domain: "bandarmologi",
    levelHint: 8,
    desc: "Ranking broker harian (gross/net).",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [];
      const sorted = [...rows].sort((a, b) => (num(b.net_value) ?? num(b.gross_value) ?? 0) - (num(a.net_value) ?? num(a.gross_value) ?? 0));
      if (sorted.length)
        out.push(
          baseFact(ctx, "brokers-top", "top_list", `Broker teratas (${ctx.args.metric ?? "gross"})`, undefined, "text", ctx.asOf, sorted.slice(0, 5).map((r) => `${r.code} ${num(r.net_value) ?? num(r.gross_value) ?? ""}`).join(", ")),
        );
      return out;
    },
  },
  {
    id: "broker-summary",
    path: "/v2/broker-summary/{symbol}/",
    params: { symbol: { in: "path", required: true }, start: { in: "query" }, end: { in: "query" }, broker_code: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "bandarmologi",
    levelHint: 8,
    desc: "Aktivitas broker harian per emiten ≤14 hari.",
    extract: (p, ctx) => brokerSummaryFacts(p, ctx),
  },
  {
    id: "broker-summary-top",
    path: "/v2/broker-summary/{symbol}/top/",
    params: {
      symbol: { in: "path", required: true },
      start: { in: "query" },
      end: { in: "query" },
      n_brokers: { in: "query" },
      foreign: { in: "query" },
      cohort: { in: "query" },
      origin: { in: "query" },
    },
    cost: { kind: "flat", kr: 2 },
    domain: "bandarmologi",
    levelHint: 8,
    desc: "Top buyer/seller per emiten (2kr, ≤90 hari).",
    extract: (p, ctx) => {
      const d = objBody(p);
      const out: Fact[] = [];
      const buyers = Array.isArray(d?.top_buyers) ? (d.top_buyers as AnyRec[]) : [];
      const sellers = Array.isArray(d?.top_sellers) ? (d.top_sellers as AnyRec[]) : [];
      if (buyers.length) {
        const top = buyers[0];
        out.push(baseFact(ctx, "broker-summary-top", "top_buyer", `Top buyer ${SYM(ctx)}: ${top.broker_code}`, num(top.nval) ?? num(top.net_value), "IDR"));
        out.push(baseFact(ctx, "broker-summary-top", "buyer_list", `Daftar top buyer ${SYM(ctx)}`, undefined, "text", ctx.asOf, buyers.slice(0, 5).map((b) => String(b.broker_code)).join(", ")));
        const totalBuy = buyers.reduce((a, b) => a + (num(b.nval) ?? num(b.net_value) ?? 0), 0);
        if (totalBuy) out.push(baseFact(ctx, "broker-summary-top", "buyer_value", `Total net buy top buyer ${SYM(ctx)}`, totalBuy, "IDR"));
      }
      if (sellers.length) {
        const top = sellers[0];
        out.push(baseFact(ctx, "broker-summary-top", "top_seller", `Top seller ${SYM(ctx)}: ${top.broker_code}`, num(top.nval) ?? num(top.net_value), "IDR"));
        out.push(baseFact(ctx, "broker-summary-top", "seller_list", `Daftar top seller ${SYM(ctx)}`, undefined, "text", ctx.asOf, sellers.slice(0, 5).map((b) => String(b.broker_code)).join(", ")));
        const totalSell = sellers.reduce((a, b) => a + (num(b.nval) ?? num(b.net_value) ?? 0), 0);
        if (totalSell) out.push(baseFact(ctx, "broker-summary-top", "seller_value", `Total net sell top seller ${SYM(ctx)}`, totalSell, "IDR"));
      }
      return out;
    },
  },
  {
    id: "broker-activity",
    path: "/v2/broker-activity/{broker_code}/",
    params: { broker_code: { in: "path", required: true }, symbol: { in: "query" }, start: { in: "query" }, end: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "bandarmologi",
    levelHint: 8,
    desc: "Aktivitas satu broker per saham/hari ≤14 hari.",
    extract: (p, ctx) => {
      const rows = arr(p, "data");
      const out: Fact[] = [];
      let net = 0;
      let n = 0;
      for (const day of rows) {
        const summary = Array.isArray(day.summary) ? (day.summary as AnyRec[]) : [];
        for (const s of summary) {
          const v = num(s.nval);
          if (v !== undefined) {
            net += v;
            n += 1;
          }
        }
      }
      if (n) out.push(baseFact(ctx, "broker-activity", "net_value", `Net value broker ${ctx.args.broker_code} dalam jendela`, net, "IDR"));
      return out;
    },
  },
  {
    id: "broker-activity-top",
    path: "/v2/broker-activity/{broker_code}/top/",
    params: { broker_code: { in: "path", required: true }, start: { in: "query" }, end: { in: "query" }, n_brokers: { in: "query" }, foreign: { in: "query" } },
    cost: { kind: "flat", kr: 2 },
    domain: "bandarmologi",
    levelHint: 8,
    desc: "Top akumulasi/distribusi satu broker (2kr).",
    extract: (p, ctx) => {
      const d = objBody(p);
      const acc = Array.isArray(d?.top_accumulations) ? (d.top_accumulations as AnyRec[]) : [];
      const dist = Array.isArray(d?.top_distributions) ? (d.top_distributions as AnyRec[]) : [];
      const out: Fact[] = [];
      if (acc.length)
        out.push(
          baseFact(ctx, "broker-activity-top", "top_accumulations", `Saham paling diakumulasi broker ${ctx.args.broker_code}`, undefined, "text", ctx.asOf, acc.slice(0, 5).map((r) => `${r.symbol} ${num(r.net_value) ?? ""}`).join(", ")),
        );
      if (dist.length)
        out.push(
          baseFact(ctx, "broker-activity-top", "top_distributions", `Saham paling didistribusi broker ${ctx.args.broker_code}`, undefined, "text", ctx.asOf, dist.slice(0, 5).map((r) => `${r.symbol} ${num(r.net_value) ?? ""}`).join(", ")),
        );
      return out;
    },
  },
  {
    id: "free-float",
    path: "/v2/free-float/",
    params: { sector: { in: "query" }, sub_sector: { in: "query" }, industry: { in: "query" }, sub_industry: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "asing",
    levelHint: 6,
    desc: "Free float per emiten (opsional filter sektor).",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [];
      const bySym = new Map(rows.map((r) => [String(r.symbol), r]));
      const sym = String(ctx.args.symbol ?? "");
      const row = bySym.get(sym);
      if (row && num(row.free_float) !== undefined)
        out.push(baseFact(ctx, "free-float", "free_float", `Free float ${sym}`, num(row.free_float), "%"));
      out.push(baseFact(ctx, "free-float", "count", `Jumlah emiten dalam daftar free float`, rows.length, "count"));
      return out;
    },
  },
  {
    id: "subsectors",
    path: "/v2/subsectors/",
    params: {},
    cost: { kind: "flat", kr: 1 },
    domain: "sektor",
    levelHint: 3,
    desc: "Daftar slug subsector (sector→subsector).",
    extract: (p, ctx) => [
      baseFact(ctx, "subsectors", "count", `Jumlah subsector terdaftar`, arrayBody(p).length, "count"),
      baseFact(ctx, "subsectors", "list", `Daftar slug subsector`, undefined, "text", ctx.asOf, arrayBody(p).slice(0, 60).map((r) => String(r.subsector ?? r.sub_sector ?? r.slug ?? JSON.stringify(r))).join(", ")),
    ],
  },
  {
    id: "industries",
    path: "/v2/industries/",
    params: {},
    cost: { kind: "flat", kr: 1 },
    domain: "sektor",
    levelHint: 3,
    desc: "Daftar slug industry (subsector→industry).",
    extract: (p, ctx) => [
      baseFact(ctx, "industries", "count", `Jumlah industry terdaftar`, arrayBody(p).length, "count"),
      baseFact(ctx, "industries", "list", `Daftar slug industry`, undefined, "text", ctx.asOf, arrayBody(p).slice(0, 60).map((r) => String(r.industry ?? r.slug ?? JSON.stringify(r))).join(", ")),
    ],
  },
  {
    id: "subindustries",
    path: "/v2/subindustries/",
    params: {},
    cost: { kind: "flat", kr: 1 },
    domain: "sektor",
    levelHint: 3,
    desc: "Daftar slug subindustry.",
    extract: (p, ctx) => [
      baseFact(ctx, "subindustries", "count", `Jumlah subindustry terdaftar`, arrayBody(p).length, "count"),
      baseFact(ctx, "subindustries", "list", `Daftar slug subindustry`, undefined, "text", ctx.asOf, arrayBody(p).slice(0, 60).map((r) => String(r.sub_industry ?? r.subindustry ?? r.slug ?? JSON.stringify(r))).join(", ")),
    ],
  },
  {
    id: "tags",
    path: "/v2/tags/",
    params: {},
    cost: { kind: "flat", kr: 1 },
    domain: "tag",
    levelHint: 3,
    desc: "Daftar slug tag berita/filings.",
    extract: (p, ctx) => [
      baseFact(ctx, "tags", "count", `Jumlah tag terdaftar`, arrayBody(p).length, "count"),
      baseFact(ctx, "tags", "list", `Daftar tag`, undefined, "text", ctx.asOf, arr(p, "data").slice(0, 80).map(String).join(", ")),
    ],
  },
  {
    id: "subsector-report",
    path: "/v2/subsector/report/{sub_sector}/",
    params: { sub_sector: { in: "path", required: true }, sections: { in: "query" } },
    cost: { kind: "per-section", kr: 1 },
    domain: "sektor",
    levelHint: 6,
    desc: "Laporan subsektor per section (1kr/section).",
    extract: (p, ctx) => {
      const d = objBody(p);
      const out: Fact[] = [];
      for (const sec of ["statistics", "valuation", "growth", "stability", "market_cap"]) {
        const s = d?.[sec] as AnyRec | undefined;
        if (!s) continue;
        for (const [k, v] of Object.entries(s)) {
          if (num(v) !== undefined)
            out.push(baseFact(ctx, "subsector-report", `${sec}_${k}`, `${sec}.${k} ${String(ctx.args.sub_sector)}`, num(v), "%"));
        }
      }
      const companies = Array.isArray(d?.companies) ? (d.companies as AnyRec[]) : [];
      if (companies.length)
        out.push(
          baseFact(ctx, "subsector-report", "companies", `Emiten di subsektor ${String(ctx.args.sub_sector)}`, companies.length, "count", ctx.asOf, companies.slice(0, 8).map((c) => String(c.symbol ?? c)).join(", ")),
        );
      return out;
    },
  },
  {
    id: "mining-commodities",
    path: "/v2/mining/commodities/",
    params: {},
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 4,
    desc: "Daftar komoditas dengan metadata cakupan harga.",
    extract: (p, ctx) => [
      baseFact(ctx, "mining-commodities", "count", `Jumlah komoditas tersedia`, arrayBody(p).length, "count"),
      baseFact(ctx, "mining-commodities", "list", `Daftar komoditas`, undefined, "text", ctx.asOf, arr(p, "data").map((r) => String(r.name)).join(", ")),
    ],
  },
  {
    id: "mining-price",
    path: "/v2/mining/commodities/{commodity_name}/price/",
    params: { commodity_name: { in: "path", required: true }, start_year: { in: "query" }, end_year: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 4,
    desc: "Harga historis komoditas (bulanan, maks 3 tahun).",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const sorted = [...rows].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
      const last = sorted.at(-1);
      const out: Fact[] = [];
      const price = num(last?.price_usd_per_ton) ?? num(last?.price);
      if (price !== undefined && last?.date)
        out.push(baseFact(ctx, "mining-price", "price", `Harga ${String(ctx.args.commodity_name)} (${last.date})`, price, "price", String(last.date)));
      const prev = sorted.at(-2);
      const p0 = num(prev?.price_usd_per_ton) ?? num(prev?.price);
      if (price !== undefined && p0)
        out.push(baseFact(ctx, "mining-price", "price_change", `Perubahan harga ${String(ctx.args.commodity_name)} periode terakhir`, (price - p0) / p0, "%", String(last?.date)));
      return out;
    },
  },
  {
    id: "mining-sales-destination",
    path: "/v2/mining/sales-destination/{slug}/",
    params: { slug: { in: "path", required: true }, year: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Tujuan penjualan (negara) per perusahaan tambang.",
    extract: (p, ctx) => {
      const d = objBody(p);
      const inner = (d?.data ?? d) as AnyRec;
      const out: Fact[] = [];
      if (inner && typeof inner === "object") {
        const entries = Object.entries(inner).filter(([, v]) => v && typeof v === "object");
        const total = entries.reduce((a, [, v]) => a + (num((v as AnyRec).revenue_usd) ?? 0), 0);
        for (const [country, v] of entries.slice(0, 6)) {
          const rev = num((v as AnyRec).revenue_usd);
          if (rev !== undefined)
            out.push(baseFact(ctx, "mining-sales-destination", `dest_${country}`, `Penjualan ke ${country} ${String(ctx.args.slug)}`, rev, "IDR", ctx.asOf));
          const share = num((v as AnyRec).percentage_of_sales_volume);
          if (share !== undefined)
            out.push(baseFact(ctx, "mining-sales-destination", `dest_${country}_share`, `Porsi volume ke ${country}`, share, "%"));
        }
        if (total) out.push(baseFact(ctx, "mining-sales-destination", "revenue_total", `Total revenue ekspor yang terdata`, total, "IDR"));
      }
      return out;
    },
  },
  {
    id: "mining-company-performance",
    path: "/v2/mining/companies/performance/{slug}/",
    params: { slug: { in: "path", required: true }, year: { in: "query" }, commodity_type: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Produksi/penjualan/strip ratio/resources-reserves perusahaan tambang.",
    extract: (p, ctx) => {
      const rows = arr(p, "data").length ? arr(p, "data") : arrayBody(p);
      const out: Fact[] = [];
      for (const r of rows.slice(0, 4)) {
        const stats = (r.commodity_stats ?? {}) as AnyRec;
        const prod = num(stats.production_volume);
        if (prod !== undefined)
          out.push(baseFact(ctx, "mining-company-performance", `production_${r.commodity_type}`, `Produksi ${r.commodity_type} ${String(ctx.args.slug)} ${r.year}`, prod, "volume"));
        const sales = num(stats.sales_volume);
        if (sales !== undefined)
          out.push(baseFact(ctx, "mining-company-performance", `sales_${r.commodity_type}`, `Penjualan ${r.commodity_type} ${String(ctx.args.slug)} ${r.year}`, sales, "volume"));
        const sr = num(stats.strip_ratio);
        if (sr !== undefined)
          out.push(baseFact(ctx, "mining-company-performance", `strip_ratio_${r.commodity_type}`, `Strip ratio ${r.commodity_type} ${String(ctx.args.slug)}`, sr, "ratio"));
        const rr = (stats.resources_reserves ?? {}) as AnyRec;
        const reserves = num(rr.total_reserves_Mt);
        if (reserves !== undefined)
          out.push(baseFact(ctx, "mining-company-performance", `reserves_${r.commodity_type}`, `Total cadangan ${r.commodity_type} ${String(ctx.args.slug)}`, reserves, "volume"));
      }
      return out;
    },
  },
  {
    id: "mining-licenses",
    path: "/v2/mining/licenses/",
    params: {
      company: { in: "query" },
      commodity_type: { in: "query" },
      province: { in: "query" },
      license_type: { in: "query" },
      expiring_soon: { in: "query" },
      cnc: { in: "query" },
      activity: { in: "query" },
      limit: { in: "query" },
      order_by: { in: "query" },
    },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 7,
    desc: "Izin tambang (IUP/IUPK) + tanggal kedaluwarsa.",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results");
      const out: Fact[] = [baseFact(ctx, "mining-licenses", "count", `Jumlah izin tambang dalam daftar`, rows.length, "count")];
      if (rows.length) {
        const sorted = [...rows].sort((a, b) => String(a.license_expiry_date ?? "").localeCompare(String(b.license_expiry_date ?? "")));
        const next = sorted[0];
        if (next)
          out.push(
            baseFact(ctx, "mining-licenses", "next_expiry", `Izin paling cepat kedaluwarsa: ${next.company_name ?? next.license_number}`, undefined, "date", String(next.license_expiry_date), `${next.province} ${next.commodity_type}`),
          );
        out.push(
          baseFact(ctx, "mining-licenses", "companies", `Perusahaan dalam daftar izin`, undefined, "text", ctx.asOf, Array.from(new Set(rows.map((r) => String(r.company_name)))).slice(0, 8).join(", ")),
        );
      }
      return out;
    },
  },
  {
    id: "mining-contracts",
    path: "/v2/mining/contracts/",
    params: { mine_owner: { in: "query" }, contractor: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 7,
    desc: "Kontrak tambang owner↔kontraktor.",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [baseFact(ctx, "mining-contracts", "count", `Jumlah kontrak tambang dalam daftar`, rows.length, "count")];
      if (rows.length)
        out.push(
          baseFact(ctx, "mining-contracts", "pairs", `Pasangan owner-kontraktor`, undefined, "text", ctx.asOf, rows.slice(0, 6).map((r) => `${r.mine_owner ?? r.owner ?? "?"}↔${r.contractor ?? "?"}`).join(", ")),
        );
      return out;
    },
  },
  {
    id: "mining-total-production",
    path: "/v2/mining/total-production/",
    params: { commodity_type: { in: "query", required: true } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 5,
    desc: "Produksi nasional per komoditas + YoY.",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [];
      const last = latest(rows, "year");
      for (const k of ["production", "production_volume", "total_production", "yoy_change", "year_over_year"]) {
        if (num(last?.[k]) !== undefined)
          out.push(baseFact(ctx, "mining-total-production", k, `Produksi nasional ${String(ctx.args.commodity_type)} (${last?.year}) — ${k}`, num(last?.[k]), k.includes("yoy") || k.includes("year") ? "%" : "volume", String(last?.year)));
      }
      return out;
    },
  },
  {
    id: "mining-resources",
    path: "/v2/mining/resources-reserves/{province}/",
    params: { province: { in: "path", required: true }, commodity_type: { in: "query" }, year: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Resources & reserves per provinsi.",
    extract: (p, ctx) => {
      const out: Fact[] = [];
      const d = get(p, "data") as AnyRec[] | AnyRec | undefined;
      const rows = Array.isArray(d) ? d : [];
      for (const r of rows.slice(0, 6)) {
        for (const k of ["total_resources", "resources", "total_reserves", "reserves", "total_inventory"]) {
          if (num(r[k]) !== undefined)
            out.push(baseFact(ctx, "mining-resources", `${k}_${r.commodity ?? r.commodity_type}`, `${k} ${r.commodity ?? ""} ${String(ctx.args.province)}`, num(r[k]), "volume"));
        }
      }
      return out;
    },
  },
  {
    id: "mining-company-detail",
    path: "/v2/mining/companies/{slug}/",
    params: { slug: { in: "path", required: true } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Detail perusahaan tambang (aktivitas, komoditas, lisensi, situs).",
    extract: (p, ctx) => {
      const d = objBody(p);
      const out: Fact[] = [];
      if (d?.company_name ?? d?.name)
        out.push(baseFact(ctx, "mining-company-detail", "name", `Nama perusahaan tambang`, undefined, "text", ctx.asOf, String(d.company_name ?? d.name)));
      for (const k of ["site_count", "license_count", "contract_count"]) {
        if (num(d?.[k]) !== undefined) out.push(baseFact(ctx, "mining-company-detail", k, `${k} ${String(ctx.args.slug)}`, num(d?.[k]), "count"));
      }
      const commodities = Array.isArray(d?.commodity_types) ? (d.commodity_types as unknown[]) : Array.isArray(d?.commodities) ? (d.commodities as unknown[]) : [];
      if (commodities.length)
        out.push(baseFact(ctx, "mining-company-detail", "commodities", `Komoditas ${String(ctx.args.slug)}`, undefined, "text", ctx.asOf, commodities.map((c) => String((c as AnyRec).name ?? c)).join(", ")));
      return out;
    },
  },
  {
    id: "mining-exports",
    path: "/v2/mining/exports/",
    params: { commodity_type: { in: "query", required: true }, year: { in: "query", required: true }, limit: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Tujuan ekspor teratas per komoditas per tahun.",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [];
      if (rows.length) {
        const total = rows.reduce((a, r) => a + (num(r.value_usd) ?? num(r.total_value) ?? 0), 0);
        if (total) out.push(baseFact(ctx, "mining-exports", "total_value", `Total nilai ekspor ${String(ctx.args.commodity_type)} ${String(ctx.args.year)}`, total, "IDR"));
        out.push(
          baseFact(ctx, "mining-exports", "top_destinations", `Tujuan ekspor teratas`, undefined, "text", ctx.asOf, rows.slice(0, 5).map((r) => `${r.country} ${num(r.value_usd) ?? ""}`).join(", ")),
        );
      }
      return out;
    },
  },
  {
    id: "mining-global",
    path: "/v2/mining/global-commodity/",
    params: { commodity_type: { in: "query" }, country: { in: "query" }, limit: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Data komoditas global (produksi, cadangan, perdagangan).",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [baseFact(ctx, "mining-global", "count", `Baris data komoditas global`, rows.length, "count")];
      const top = rows[0];
      if (top)
        out.push(
          baseFact(ctx, "mining-global", "top_row", `Data global teratas`, undefined, "text", ctx.asOf, JSON.stringify(top).slice(0, 220)),
        );
      return out;
    },
  },
  {
    id: "mining-auctions",
    path: "/v2/mining/license-auctions/",
    params: { commodity_type: { in: "query" }, province: { in: "query" }, status: { in: "query" }, order_by: { in: "query" }, limit: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Lelang WIUP/WIUPK (peserta, pemenang, luas).",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results");
      const out: Fact[] = [baseFact(ctx, "mining-auctions", "count", `Jumlah lelang dalam daftar`, rows.length, "count")];
      const top = rows[0];
      if (top)
        out.push(
          baseFact(ctx, "mining-auctions", "top", `Lelang teratas ${top.wiup_code ?? ""}`, num(top.licensed_area_ha), "volume", ctx.asOf, `${top.commodity_type} ${top.province} ${top.winner_name ?? ""}`),
        );
      return out;
    },
  },
  {
    id: "mining-sites",
    path: "/v2/mining/sites/",
    params: { province: { in: "query" }, commodity_type: { in: "query" }, company: { in: "query" }, year: { in: "query" }, min_production: { in: "query" }, order_by: { in: "query" }, limit: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "komoditas",
    levelHint: 6,
    desc: "Daftar situs tambang dengan produksi/strip ratio.",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results");
      const out: Fact[] = [baseFact(ctx, "mining-sites", "count", `Jumlah situs tambang dalam daftar`, rows.length, "count")];
      const top = rows[0];
      if (top)
        out.push(
          baseFact(ctx, "mining-sites", "top", `Situs teratas ${top.site_name ?? top.name ?? ""}`, num(top.production_volume), "volume", ctx.asOf, `${top.company_name ?? ""} ${top.province ?? ""}`),
        );
      return out;
    },
  },
  {
    id: "index-universe",
    path: "/v2/index-daily/",
    params: { date: { in: "query" } },
    cost: { kind: "flat", kr: 1 },
    domain: "sektor",
    levelHint: 5,
    desc: "Level semua indeks pada satu hari.",
    extract: (p, ctx) => {
      const rows = arrayBody(p);
      const out: Fact[] = [baseFact(ctx, "index-universe", "count", `Jumlah indeks pada hari itu`, rows.length, "count")];
      const ihsg = rows.find((r) => String(r.index_code ?? "").toLowerCase() === "ihsg");
      if (num(ihsg?.price) !== undefined)
        out.push(baseFact(ctx, "index-universe", "ihsg", `IHSG (${ihsg?.date})`, num(ihsg?.price), "price", String(ihsg?.date)));
      return out;
    },
  },
  {
    id: "company-universe",
    path: "/v2/close/",
    params: { date: { in: "query" }, limit: { in: "query" }, offset: { in: "query" } },
    cost: { kind: "per-page", kr: 1 },
    domain: "harga",
    levelHint: 3,
    desc: "Harga penutupan seluruh emiten pada satu hari (1kr/halaman, limit ≤30).",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results").length ? arr(objBody(p), "results") : arrayBody(p);
      const out: Fact[] = [baseFact(ctx, "company-universe", "count", `Jumlah emiten pada halaman ini`, rows.length, "count")];
      const sym = String(ctx.args.symbol ?? "");
      const row = rows.find((r) => String(r.symbol) === sym);
      if (row && num(row.close) !== undefined)
        out.push(baseFact(ctx, "company-universe", "close", `Harga penutupan ${sym}`, num(row.close), "price", String(row.date ?? ctx.asOf)));
      return out;
    },
  },
  {
    id: "financial-dates",
    path: "/v2/company/get_quarterly_financial_dates/{symbol}/",
    params: { symbol: { in: "path", required: true } },
    cost: { kind: "flat", kr: 1 },
    domain: "kalender",
    levelHint: 3,
    desc: "Tanggal laporan kuartalan tersedia per emiten.",
    extract: (p, ctx) => {
      const d = objBody(p);
      const out: Fact[] = [];
      const years = Object.keys(d ?? {}).sort();
      const lastYear = years.at(-1);
      const dates = lastYear ? (d[lastYear] as unknown[]) : [];
      if (Array.isArray(dates) && dates.length)
        out.push(baseFact(ctx, "financial-dates", "latest", `Tanggal laporan kuartalan terbaru ${SYM(ctx)}`, undefined, "date", String(dates.at(-1))));
      return out;
    },
  },
  {
    id: "segments-list",
    path: "/v2/companies/list_companies_with_segments/",
    params: {},
    cost: { kind: "flat", kr: 1 },
    domain: "fundamental",
    levelHint: 6,
    desc: "Daftar emiten yang punya data segmen + tahun tersedia.",
    extract: (p, ctx) => [baseFact(ctx, "segments-list", "count", `Jumlah emiten dengan data segmen`, arrayBody(p).length, "count")],
  },
  {
    id: "quarterly-dates-universe",
    path: "/v2/companies/quarterly-financial-dates/",
    params: { year: { in: "query" }, since: { in: "query" }, limit: { in: "query" }, offset: { in: "query" } },
    cost: { kind: "per-page", kr: 1 },
    domain: "kalender",
    levelHint: 5,
    desc: "Tanggal laporan kuartalan terbaru seluruh emiten (1kr/halaman).",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results").length ? arr(objBody(p), "results") : arrayBody(p);
      return [baseFact(ctx, "quarterly-dates-universe", "count", `Jumlah emiten pada halaman ini`, rows.length, "count")];
    },
  },
  {
    id: "foreign-flow-universe",
    path: "/v2/foreign-flow/",
    params: { date: { in: "query" }, order_by: { in: "query" }, limit: { in: "query" }, offset: { in: "query" } },
    cost: { kind: "per-page", kr: 1 },
    domain: "asing",
    levelHint: 5,
    desc: "Net foreign flow seluruh emiten pada satu hari (1kr/halaman).",
    extract: (p, ctx) => {
      const rows = arr(objBody(p), "results").length ? arr(objBody(p), "results") : arrayBody(p);
      const out: Fact[] = [];
      const top = rows[0];
      if (top)
        out.push(
          baseFact(ctx, "foreign-flow-universe", "top_buy", `Net buy asing terbesar ${top.symbol}`, num(top.net_foreign_inflow), "IDR", String(ctx.args.date ?? ctx.asOf)),
        );
      const bottom = rows.at(-1);
      if (bottom)
        out.push(
          baseFact(ctx, "foreign-flow-universe", "top_sell", `Net sell asing terbesar ${bottom.symbol}`, num(bottom.net_foreign_inflow), "IDR", String(ctx.args.date ?? ctx.asOf)),
        );
      out.push(baseFact(ctx, "foreign-flow-universe", "count", `Jumlah emiten pada halaman ini`, rows.length, "count"));
      return out;
    },
  },
];

function brokerSummaryFacts(p: unknown, ctx: ExtractCtx): Fact[] {
  const rows = arr(p, "data");
  const out: Fact[] = [];
  const byBroker = new Map<string, number>();
  let nval = 0;
  for (const day of rows) {
    const summary = Array.isArray(day.summary) ? (day.summary as AnyRec[]) : [];
    for (const s of summary) {
      const v = num(s.nval);
      if (v === undefined) continue;
      nval += v;
      const code = String(s.broker_code);
      byBroker.set(code, (byBroker.get(code) ?? 0) + v);
    }
  }
  if (nval) out.push(baseFact(ctx, "broker-summary", "net_value", `Net value seluruh broker ${SYM(ctx)} dalam jendela`, nval, "IDR"));
  const ranked = [...byBroker.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length) {
    out.push(baseFact(ctx, "broker-summary", "top_net_buy", `Broker net buy teratas ${SYM(ctx)}: ${ranked[0][0]}`, ranked[0][1], "IDR"));
    const last = ranked.at(-1);
    if (last) out.push(baseFact(ctx, "broker-summary", "top_net_sell", `Broker net sell teratas ${SYM(ctx)}: ${last[0]}`, last[1], "IDR"));
  }
  return out;
}

export const ENDPOINT_BY_ID = new Map(ENDPOINTS.map((e) => [e.id, e]));

export function buildUrl(def: EndpointDef, args: Record<string, unknown>): string {
  let path = def.path;
  const query = new URLSearchParams();
  for (const [name, spec] of Object.entries(def.params)) {
    const value = args[name];
    if (value === undefined || value === null || value === "") continue;
    if (spec.in === "path") {
      path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
    } else if (Array.isArray(value)) {
      for (const v of value) query.append(name, String(v));
    } else {
      query.set(name, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function estimateCost(def: EndpointDef, args: Record<string, unknown>): number {
  const sections = Array.isArray(args.sections) ? args.sections.length : 1;
  switch (def.cost.kind) {
    case "flat":
      return def.cost.kr;
    case "per-section":
      return def.cost.kr * sections;
    case "per-quarter":
      return def.cost.kr * (Number(args.n_quarters ?? 1) || 1);
    case "per-page":
      return def.cost.kr;
    case "per-combo": {
      const classes = args.classifications ? (Array.isArray(args.classifications) ? args.classifications.length : 1) : 1;
      const periods = args.periods ? (Array.isArray(args.periods) ? args.periods.length : 1) : 1;
      const types = args.type ? (Array.isArray(args.type) ? args.type.length : 1) : 1;
      return def.cost.kr * classes * periods * types;
    }
    case "screener":
      return args.q ? 3 : 1;
  }
}

export function defaultArgs(def: EndpointDef, overrides: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = { ...overrides };
  for (const [name, spec] of Object.entries(def.params)) {
    if (args[name] !== undefined) continue;
    if (spec.in === "query" && (name === "start" || name === "end")) {
      const w = window(30);
      args.start = w.start;
      args.end = w.end;
    }
  }
  return args;
}