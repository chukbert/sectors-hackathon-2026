import type { Fact } from "@/lib/facts";
import type { Block } from "@/lib/output/answerdoc";

type HeroItem = Extract<Block, { kind: "hero" }>["items"][number];

function seriesByKey(facts: Fact[], ...keys: string[]): Fact[] {
  const set = new Set(keys);
  return facts
    .filter((f) => set.has(f.key) && f.valueNum !== undefined)
    .sort((a, b) => a.asOf.localeCompare(b.asOf));
}

function last(facts: Fact[], key: string): Fact | undefined {
  return facts.filter((f) => f.key === key && f.valueNum !== undefined).sort((a, b) => a.asOf.localeCompare(b.asOf)).at(-1);
}

function points(facts: Fact[], max = 30): Array<{ date: string; value: number }> {
  const seen = new Map<string, number>();
  for (const f of facts) if (f.valueNum !== undefined) seen.set(f.asOf, f.valueNum);
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-max).map(([date, value]) => ({ date, value }));
}

export function buildHero(facts: Fact[], symbol?: string): Block | null {
  const items: HeroItem[] = [];

  const closes = seriesByKey(facts, "close_pt", "close");
  const close = last(facts, "close") ?? closes.at(-1);
  if (close) {
    const delta = last(facts, "close_change");
    items.push({
      label: `Harga${symbol ? ` ${symbol}` : ""}`,
      factId: close.id,
      deltaFactId: delta?.id,
      viz: closes.length > 1 ? "sparkline" : "none",
      points: points(closes),
      parts: [],
    });
  }

  const netWindow = facts.find((f) => f.key === "net_window" && f.valueNum !== undefined);
  const flowSeries = seriesByKey(facts, "net_pt", "net_last");
  const flow = netWindow ?? flowSeries.at(-1);
  if (flow) {
    items.push({
      label: "Net foreign flow",
      factId: flow.id,
      viz: flowSeries.length > 1 ? "minibars" : "none",
      points: points(flowSeries, 14),
      parts: [],
    });
  }

  const foreign = facts.find((f) => f.key === "foreign_pct" && f.valueNum !== undefined);
  const local = facts.find((f) => f.key === "local_pct" && f.valueNum !== undefined);
  if (foreign?.valueNum !== undefined) {
    const parts = [{ label: "Asing", value: foreign.valueNum }];
    if (local?.valueNum !== undefined) parts.push({ label: "Lokal", value: local.valueNum });
    const rest = 1 - foreign.valueNum - (local?.valueNum ?? 0);
    if (rest > 0.02) parts.push({ label: "Free float", value: rest });
    items.push({ label: "Porsi asing", factId: foreign.id, viz: "donut", points: [], parts });
  }

  const turnover = facts.find((f) => f.key === "derived_turnover" && f.valueNum !== undefined);
  const marketCap = last(facts, "market_cap");
  const money = turnover ?? marketCap;
  if (money) {
    items.push({
      label: turnover ? "Nilai transaksi" : "Kapitalisasi",
      factId: money.id,
      viz: "none",
      points: [],
      parts: [],
    });
  }

  if (!items.length) return null;
  return { kind: "hero", items: items.slice(0, 4) };
}
