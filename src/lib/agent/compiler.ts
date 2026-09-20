import type { Fact, FactUnit } from "@/lib/facts";
import type { Slots } from "@/lib/agent/types";
import type { ResolveResult } from "@/lib/sectors/client";
import type { FactRef, Section } from "@/lib/output/answerdoc";
import { makeFact } from "@/lib/facts";
import { todayJakarta } from "@/lib/util/time";

export function formatForUnit(unit: FactUnit | undefined): FactRef["format"] {
  switch (unit) {
    case "IDR":
      return "idr";
    case "%":
      return "percent";
    case "x":
      return "per";
    case "price":
      return "number";
    case "date":
      return "date";
    case "text":
      return "text";
    case "volume":
    case "count":
    case "ratio":
    default:
      return "number";
  }
}

export function toFactRef(fact: Fact): FactRef {
  return {
    id: fact.id,
    label: fact.label,
    valueNum: fact.valueNum,
    valueText: fact.valueText,
    unit: fact.unit,
    asOf: fact.asOf,
    format: formatForUnit(fact.unit),
    source: fact.endpoint,
  };
}

export type Compiled = {
  facts: Fact[];
  factRefs: FactRef[];
  derived: FactRef[];
  bySection: Map<string, { title: string; facts: Fact[]; built: Section }>;
  sections: Section[];
};

const sectionOrder: Array<{ id: string; title: string; endpoints: string[] }> = [
  { id: "harga", title: "Harga & pergerakan", endpoints: ["daily", "index-daily", "index-universe", "company-universe", "most-traded", "top-changes", "listing-performance"] },
  { id: "valuasi", title: "Valuasi", endpoints: ["report", "screener"] },
  { id: "fundamental", title: "Kinerja & fundamental", endpoints: ["report", "quarterly", "segments", "free-float", "shareholders", "segments-list"] },
  { id: "aliran", title: "Aliran dana & bandarmologi", endpoints: ["foreign-flow", "foreign-flow-universe", "broker-summary", "broker-summary-top", "broker-activity", "broker-activity-top", "brokers", "brokers-top"] },
  { id: "dividen", title: "Dividen & aksi korporasi", endpoints: ["corporate-actions", "corporate-actions-symbol", "financial-dates", "quarterly-dates-universe"] },
  { id: "berita", title: "Berita & filings", endpoints: ["news", "filings"] },
  { id: "risiko", title: "Risiko & batasan data", endpoints: ["suspensions"] },
  { id: "komoditas", title: "Komoditas & tambang", endpoints: ["mining-commodities", "mining-price", "mining-total-production", "mining-company-performance", "mining-sales-destination", "mining-licenses", "mining-contracts", "mining-exports", "mining-global", "mining-sites", "mining-resources", "mining-auctions", "mining-company-detail"] },
  { id: "pasar", title: "Konteks pasar & sektor", endpoints: ["idx-total", "subsector-report", "subsectors", "industries", "subindustries", "tags"] },
];

const MIN_FACTS: Record<string, number> = { harga: 1, valuasi: 1, fundamental: 1, aliran: 1, dividen: 1, berita: 1, risiko: 1, komoditas: 1, pasar: 1 };

export function deriveFacts(all: Fact[]): Fact[] {
  const out: Fact[] = [];
  const find = (endpoint: string, key: string): Fact | undefined => all.find((f) => f.endpoint === endpoint && f.key === key);
  const q = (key: string) => find("quarterly", key);
  const r = (key: string) => find("report", key);

  const revFirst = q("revenue_trend");
  if (revFirst && revFirst.valueNum !== undefined) {
    out.push(
      makeFact({
        label: "Tren revenue antar kuartal (dihitung dari data kuartalan)",
        key: "derived_revenue_trend",
        valueNum: revFirst.valueNum,
        unit: "%",
        asOf: revFirst.asOf,
        endpoint: "derived",
        args: {},
      }),
    );
  }
  const rev = q("revenue");
  const oi = q("operating_pnl");
  if (rev?.valueNum && oi?.valueNum) {
    out.push(
      makeFact({
        label: "Margin operasi kuartal terakhir (operating pnl ÷ revenue)",
        key: "derived_operating_margin",
        valueNum: oi.valueNum / rev.valueNum,
        unit: "%",
        asOf: rev.asOf,
        endpoint: "derived",
        args: {},
      }),
    );
  }
  const pe = r("val_pe");
  const pePeer = r("val_pe_peer_avg");
  if (pe?.valueNum && pePeer?.valueNum) {
    out.push(
      makeFact({
        label: "Diskon/premi PER vs rata-rata peers (dihitung)",
        key: "derived_pe_vs_peers",
        valueNum: (pe.valueNum - pePeer.valueNum) / pePeer.valueNum,
        unit: "%",
        asOf: pe.asOf,
        endpoint: "derived",
        args: {},
      }),
    );
  }
  const pb = r("val_pb");
  const pbPeer = r("val_pb_peer_avg");
  if (pb?.valueNum && pbPeer?.valueNum) {
    out.push(
      makeFact({
        label: "Diskon/premi PBV vs rata-rata peers (dihitung)",
        key: "derived_pb_vs_peers",
        valueNum: (pb.valueNum - pbPeer.valueNum) / pbPeer.valueNum,
        unit: "%",
        asOf: pb.asOf,
        endpoint: "derived",
        args: {},
      }),
    );
  }
  const buy = find("broker-summary-top", "buyer_value");
  const sell = find("broker-summary-top", "seller_value");
  if (buy?.valueNum !== undefined && sell?.valueNum !== undefined && buy.valueNum + Math.abs(sell.valueNum) > 0) {
    out.push(
      makeFact({
        label: "Rasio dominasi sisi beli vs jual (dihitung)",
        key: "derived_broker_balance",
        valueNum: buy.valueNum / (buy.valueNum + Math.abs(sell.valueNum)),
        unit: "%",
        asOf: buy.asOf,
        endpoint: "derived",
        args: {},
      }),
    );
  }
  const close = find("daily", "close");
  const mc = find("daily", "market_cap");
  const volume = find("daily", "volume");
  if (close?.valueNum && mc?.valueNum && volume?.valueNum && volume.valueNum > 0) {
    out.push(
      makeFact({
        label: "Nilai transaksi harian estimasi (harga × volume, dihitung)",
        key: "derived_turnover",
        valueNum: close.valueNum * volume.valueNum,
        unit: "IDR",
        asOf: close.asOf,
        endpoint: "derived",
        args: {},
      }),
    );
  }
  const divYield = r("div_yield_ttm");
  const payout = r("div_payout_ratio");
  if (divYield?.valueNum !== undefined && payout?.valueNum !== undefined && payout.valueNum > 1.1) {
    out.push(
      makeFact({
        label: "Payout ratio di atas 100% — dividen berpotensi tidak berkelanjutan (diperiksa kode)",
        key: "derived_payout_warning",
        valueText: `payout ${(payout.valueNum * (payout.valueNum <= 1.5 ? 100 : 1)).toFixed(1)}% vs yield ${(divYield.valueNum * (divYield.valueNum <= 1.5 ? 100 : 1)).toFixed(1)}%`,
        unit: "text",
        asOf: payout.asOf,
        endpoint: "derived",
        args: {},
      }),
    );
  }
  return out;
}

function seriesFrom(facts: Fact[], endpoint: string, key: string): Array<{ date: string; value: number }> {
  return facts
    .filter((f) => f.endpoint === endpoint && f.key === key && f.valueNum !== undefined)
    .map((f) => ({ date: f.asOf, value: f.valueNum as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildSections(slots: Slots, results: ResolveResult[], level: number): Compiled {
  const facts = results.flatMap((r) => r.facts);
  const derived = deriveFacts(facts);
  const allFacts = [...facts, ...derived];
  const factRefs = allFacts.map(toFactRef);
  const sections: Section[] = [];

  for (const group of sectionOrder) {
    const groupFacts = facts.filter((f) => group.endpoints.includes(f.endpoint));
    const derivedForGroup = derived.filter((d) => {
      if (group.id === "fundamental" && d.key.startsWith("derived_") && (d.key.includes("margin") || d.key.includes("turnover") || d.key.includes("revenue"))) return true;
      if (group.id === "valuasi" && d.key.includes("pe") ) return true;
      if (group.id === "aliran" && d.key.includes("broker")) return true;
      if (group.id === "dividen" && d.key.includes("payout")) return true;
      return false;
    });
    const relevant = [...groupFacts, ...derivedForGroup];
    if (relevant.length < (MIN_FACTS[group.id] ?? 1)) continue;

    const blocks: Section["blocks"] = [];

    const bySource = (endpoint: string) => results.filter((r) => r.endpoint === endpoint);
    const daily = bySource("daily");
    const ff = bySource("foreign-flow");
    const idx = bySource("index-daily");
    const quarterly = bySource("quarterly");

    if (daily.length) {
      const rows = daily.flatMap((r) => r.facts.filter((f) => f.key === "close" && f.valueNum !== undefined).map((f) => ({ date: f.asOf, value: f.valueNum as number })));
      if (rows.length > 1) blocks.push({ kind: "series", title: `Harga penutupan ${slots.symbols.join(", ")}`, unit: "price", points: rows, factId: daily[0].facts.find((f) => f.key === "close")?.id });
    }
    if (idx.length) {
      const rows = idx.flatMap((r) => r.facts.filter((f) => f.key === "level" && f.valueNum !== undefined).map((f) => ({ date: f.asOf, value: f.valueNum as number })));
      if (rows.length > 1) blocks.push({ kind: "series", title: `Level ${String(idx[0].args.index_code).toUpperCase()}`, unit: "price", points: rows });
    }
    if (ff.length) {
      const rows = ff.flatMap((r) => r.facts.filter((f) => f.key === "net_last" && f.valueNum !== undefined).map((f) => ({ date: f.asOf, value: f.valueNum as number })));
      if (rows.length > 1) blocks.push({ kind: "series", title: "Net foreign flow harian", unit: "idr", points: rows });
    }
    if (quarterly.length) {
      const revPoints = quarterly
        .flatMap((r) => r.facts.filter((f) => f.key === "revenue" && f.valueNum !== undefined).map((f) => ({ date: f.asOf, value: f.valueNum as number })))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (revPoints.length > 1) blocks.push({ kind: "series", title: "Revenue kuartalan", unit: "idr", points: revPoints });
    }

    const topBuyers = results.find((r) => r.endpoint === "broker-summary-top");
    if (topBuyers) {
      const b = topBuyers.facts.find((f) => f.key === "buyer_value");
      const s = topBuyers.facts.find((f) => f.key === "seller_value");
      const bars: Array<{ label: string; value: number }> = [];
      if (b?.valueNum !== undefined) bars.push({ label: "Top buyer (net)", value: b.valueNum });
      if (s?.valueNum !== undefined) bars.push({ label: "Top seller (net)", value: s.valueNum });
      if (bars.length) blocks.push({ kind: "distribution", title: `Dominasi sisi ${slots.symbols[0] ?? "emiten"}`, unit: "idr", bars });
      const buyers = topBuyers.facts.find((f) => f.key === "buyer_list")?.valueText;
      if (buyers) blocks.push({ kind: "note", tone: "info", text: `Top buyer: ${buyers}` });
    }

    const newsResults = bySource("news");
    if (newsResults.length) {
      const items = newsResults.flatMap((r) =>
        r.facts
          .filter((f) => f.key.startsWith("headline"))
          .slice(0, 6)
          .map((f) => ({ title: f.valueText ?? f.label, date: f.asOf, source: undefined, symbols: slots.symbols.slice(0, 1), factId: f.id })),
      );
      if (items.length) blocks.push({ kind: "news", title: "Berita terbaru", items });
    }

    const caResults = results.filter((r) => r.endpoint === "corporate-actions" || r.endpoint === "corporate-actions-symbol");
    if (caResults.length) {
      const events = caResults.flatMap((r) =>
        r.facts
          .filter((f) => f.key.startsWith("next_") || f.key === "last_dividend")
          .map((f) => ({ date: f.asOf, label: f.label, symbol: slots.symbols[0], type: f.key.split("_")[0] })),
      );
      if (events.length) blocks.push({ kind: "calendar", title: "Agenda & aksi korporasi", events });
    }

    const filings = bySource("filings");
    if (filings.length) {
      const buys = filings.flatMap((r) => r.facts.filter((f) => f.key === "buy_count"));
      const sells = filings.flatMap((r) => r.facts.filter((f) => f.key === "sell_count"));
      if (buys.length && sells.length)
        blocks.push({
          kind: "metric_row",
          items: [
            { label: "Filing beli", factId: buys[0].id },
            { label: "Filing jual", factId: sells[0].id },
          ],
        });
    }

    const screener = results.find((r) => r.endpoint === "screener");
    if (screener) {
      const rows = screener.facts
        .filter((f) => f.key.startsWith("row") && f.valueNum !== undefined)
        .map((f) => [f.label.split(" — ")[0], f.label.split(" — ")[1] ?? "", String(f.valueNum)]);
      if (rows.length) blocks.push({ kind: "table", title: "Hasil screener (top 5)", columns: ["Emiten", "Metrik", "Nilai"], rows });
    }

    const mostTraded = results.find((r) => r.endpoint === "most-traded");
    if (mostTraded) {
      const t = mostTraded.facts.find((f) => f.key === "top_symbol");
      if (t?.valueText) blocks.push({ kind: "note", tone: "info", text: `Paling ramai: ${t.valueText}` });
    }

    const topChanges = results.find((r) => r.endpoint === "top-changes");
    if (topChanges) {
      const rows = topChanges.facts
        .filter((f) => f.key.endsWith("_lead") && f.valueNum !== undefined)
        .map((f) => [f.label, "", `${(f.valueNum as number) * 100 > 0 ? "+" : ""}${((f.valueNum as number) * 100).toFixed(2)}%`]);
      if (rows.length) blocks.push({ kind: "table", title: "Pergerakan teratas", columns: ["Emiten", "Klasifikasi", "Perubahan"], rows });
    }

    const mining = results.find((r) => r.endpoint === "mining-price");
    if (mining) {
      const pts = seriesFrom(mining.facts, "mining-price", "price");
      if (pts.length) blocks.push({ kind: "series", title: `Harga komoditas (USD/ton)`, unit: "price", points: pts });
    }

    const licenses = results.find((r) => r.endpoint === "mining-licenses");
    if (licenses) {
      const note = licenses.facts.find((f) => f.key === "next_expiry");
      if (note?.valueText) blocks.push({ kind: "note", tone: "warning", text: `${note.label} — ${note.valueText}` });
    }

    if (blocks.length || relevant.some((f) => f.unit !== "text")) {
      if (level >= 2 && relevant.length) {
        blocks.unshift({
          kind: "metric_row",
          items: relevant
            .filter((f) => f.valueNum !== undefined)
            .slice(0, 6)
            .map((f) => ({ label: f.label, factId: f.id })),
        });
      }
      sections.push({ id: group.id, title: group.title, blocks });
    }
  }

  if (derived.length) {
    const extra = derived.filter((d) => !sections.some((s) => s.blocks.some((b) => b.kind === "metric_row" && b.items.some((i) => i.factId === d.id))));
    if (extra.length >= 2) {
      sections.push({
        id: "turunan",
        title: "Angka turunan (dihitung kode)",
        blocks: [{ kind: "metric_row", items: extra.slice(0, 6).map((d) => ({ label: d.label, factId: d.id })) }],
      });
    }
  }

  const bySection = new Map<string, { title: string; facts: Fact[]; built: Section }>();
  for (const s of sections) {
    const group = sectionOrder.find((g) => g.id === s.id);
    const relevant = group ? facts.filter((f) => group.endpoints.includes(f.endpoint)) : [];
    bySection.set(s.id, { title: s.title, facts: relevant, built: s });
  }

  return { facts: allFacts, factRefs, derived: derived.map(toFactRef), bySection, sections };
}

export function factRefById(refs: FactRef[], id: string): FactRef | undefined {
  return refs.find((r) => r.id === id);
}

export function today(): string {
  return todayJakarta();
}