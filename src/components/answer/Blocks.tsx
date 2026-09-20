"use client";

import type { Block, FactRef } from "@/lib/output/answerdoc";
import type { LangMode } from "@/lib/util/format";
import { formatDateId, formatPercent, signedTone } from "@/lib/util/format";
import {
  BrokerTornadoChart,
  DistributionChart,
  DonutMini,
  MiniBars,
  SeriesChart,
  ShareDonutChart,
  Sparkline,
} from "@/components/answer/charts";
import { FactChip, heroValue, renderTemplate, toneClass } from "@/components/answer/rich";

const noteTone: Record<string, string> = {
  info: "border-l-4 border-l-accent",
  warning: "border-l-4 border-l-warn",
  limit: "border-l-4 border-l-negative",
};

export default function Blocks({
  blocks,
  factIndex,
  mode,
}: {
  blocks: Block[];
  factIndex: Map<string, FactRef>;
  mode: LangMode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} factIndex={factIndex} mode={mode} />
      ))}
    </div>
  );
}

function BlockView({ block, factIndex, mode }: { block: Block; factIndex: Map<string, FactRef>; mode: LangMode }) {
  switch (block.kind) {
    case "hero":
      return (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {block.items.map((item, i) => (
            <HeroCard key={i} item={item} factIndex={factIndex} mode={mode} />
          ))}
        </div>
      );
    case "narrative":
      return <p className="text-sm leading-relaxed text-ink/90 whitespace-pre-line">{renderTemplate(block.variants[mode], factIndex, mode)}</p>;
    case "metric_row":
      return (
        <div className="grid-flow-row-dense grid grid-cols-2 gap-2 sm:grid-cols-3">
          {block.items.map((item, i) => {
            const fact = factIndex.get(item.factId);
            if (!fact) return null;
            const { text, tone } = heroValue(fact, mode);
            return (
              <div key={i} className="rounded-xl border border-line bg-surface2/60 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">{item.label}</div>
                <div className={`mt-1 text-lg tabular ${toneClass(tone)}`}>
                  <FactChip fact={fact}>{text}</FactChip>
                </div>
                {item.hint ? <div className="mt-1 text-[11px] text-muted">{item.hint}</div> : null}
              </div>
            );
          })}
        </div>
      );
    case "series":
      return (
        <div className="rounded-xl border border-line bg-surface2/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">{block.title}</div>
          <SeriesChart points={block.points} unit={block.unit} mode={mode} hi={block.hi} lo={block.lo} />
        </div>
      );
    case "share_donut":
      return (
        <div className="rounded-xl border border-line bg-surface2/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">{block.title}</div>
          <ShareDonutChart parts={block.parts} mode={mode} />
        </div>
      );
    case "broker_tornado":
      return (
        <div className="rounded-xl border border-line bg-surface2/40 p-3">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted">
            <span>{block.title}</span>
            <span className="flex items-center gap-3 normal-case tracking-normal">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-positive" /> buyer</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-negative" /> seller</span>
            </span>
          </div>
          <BrokerTornadoChart buyers={block.buyers} sellers={block.sellers} mode={mode} />
        </div>
      );
    case "distribution":
      return (
        <div className="rounded-xl border border-line bg-surface2/40 p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">{block.title}</div>
          <DistributionChart bars={block.bars} unit={block.unit} mode={mode} />
        </div>
      );
    case "compare":
      return (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Metrik</th>
                {block.columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-left">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2 text-muted">{row.label}</td>
                  {block.columns.map((c) => {
                    const cell = row.cells.find((x) => x.column === c.key);
                    const fact = cell ? factIndex.get(cell.factId) : undefined;
                    const { text, tone } = fact ? heroValue(fact, mode) : { text: "", tone: "neu" as const };
                    return (
                      <td key={c.key} className={`px-3 py-2 tabular ${fact ? toneClass(tone) : ""}`}>
                        {fact ? <FactChip fact={fact}>{text}</FactChip> : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-line">
          <div className="bg-surface2 px-3 py-2 text-xs uppercase tracking-wide text-muted">{block.title}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                {block.columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-normal">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-2 ${j > 0 ? "tabular" : ""}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "news":
      return (
        <div className="rounded-xl border border-line">
          <div className="bg-surface2 px-3 py-2 text-xs uppercase tracking-wide text-muted">{block.title}</div>
          <ul className="divide-y divide-line">
            {block.items.map((item, i) => (
              <li key={i} className="px-3 py-2 text-sm">
                <div className="text-ink/90">{item.title}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {formatDateId(item.date)}
                  {item.source ? ` · ${item.source}` : ""}
                  {item.symbols.length ? ` · ${item.symbols.join(", ")}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    case "calendar":
      return (
        <div className="rounded-xl border border-line">
          <div className="bg-surface2 px-3 py-2 text-xs uppercase tracking-wide text-muted">{block.title}</div>
          <ul className="divide-y divide-line">
            {block.events.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="tabular w-28 text-muted">{formatDateId(e.date)}</span>
                <span className="chip">{e.type}</span>
                <span className="text-ink/90">{e.label}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "flow":
      return (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">{block.title}</div>
          <div className="flex flex-wrap items-center gap-3">
            {block.nodes.map((n, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface2/70 px-3 py-2">
                <div className="text-xs text-muted">{n.kind}</div>
                <div className="text-sm">{n.label}</div>
                <div className="tabular text-sm text-accent">{formatFactValue(n.value, block.unit, mode)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case "scenarios":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          {block.items.map((s, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface2/50 p-3">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="mt-1 text-xs text-muted">{s.assumption}</div>
              <div className="mt-2 text-sm">{renderTemplate(s.outcome, factIndex, mode)}</div>
            </div>
          ))}
        </div>
      );
    case "definition":
      return (
        <details className="rounded-xl border border-line bg-surface2/50 p-3">
          <summary className="cursor-pointer text-sm text-accent">{block.term} — penjelasan singkat</summary>
          <p className="mt-2 text-sm text-ink/90">{block.plain}</p>
          <p className="mt-2 text-xs text-muted">{block.technical}</p>
        </details>
      );
    case "caveats":
      return (
        <div className="caveats">
          <div className="text-xs font-semibold uppercase tracking-wide text-warn">{block.title}</div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {block.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink/90">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${it.tone === "risiko" ? "bg-negative" : "bg-warn"}`} />
                <span>
                  <span className="mr-1 text-[11px] uppercase tracking-wide text-muted">{it.tone}</span>
                  {renderTemplate(it.text, factIndex, mode)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "note":
      return <div className={`rounded-xl border border-line bg-surface2/40 p-3 text-sm ${noteTone[block.tone] ?? ""}`}>{renderTemplate(block.text, factIndex, mode)}</div>;
    default:
      return null;
  }
}

function HeroCard({ item, factIndex, mode }: { item: Extract<Block, { kind: "hero" }>["items"][number]; factIndex: Map<string, FactRef>; mode: LangMode }) {
  const fact = factIndex.get(item.factId);
  if (!fact) return null;
  const { text, tone } = heroValue(fact, mode);
  const delta = item.deltaFactId ? factIndex.get(item.deltaFactId) : undefined;
  const deltaNum = delta?.valueNum;
  const deltaTone = signedTone(deltaNum);
  return (
    <div className="hero-card">
      <div className="flex items-start justify-between gap-2">
        <div className="hero-label">{item.label}</div>
        {delta && deltaNum !== undefined ? (
          <span className={`delta-chip tabular ${deltaTone === "pos" ? "delta-up" : deltaTone === "neg" ? "delta-down" : "delta-flat"}`}>
            {deltaTone === "pos" ? "▲" : deltaTone === "neg" ? "▼" : "•"} {formatPercent(Math.abs(deltaNum), mode)}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className={`hero-value tabular ${toneClass(tone)}`}>
          <FactChip fact={fact}>{text}</FactChip>
        </div>
        {item.viz === "donut" && item.parts.length ? <DonutMini parts={item.parts} /> : null}
      </div>
      {item.viz === "sparkline" && item.points.length > 1 ? (
        <div className="mt-1">
          <Sparkline points={item.points} tone={tone} />
        </div>
      ) : null}
      {item.viz === "minibars" && item.points.length > 1 ? (
        <div className="mt-1">
          <MiniBars points={item.points} />
        </div>
      ) : null}
    </div>
  );
}

function formatFactValue(value: number, unit: "idr" | "volume", mode: LangMode): string {
  if (unit === "idr") {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `Rp ${(value / 1e12).toFixed(2)} T`;
    if (abs >= 1e9) return `Rp ${(value / 1e9).toFixed(2)} M`;
    return `Rp ${(value / 1e6).toFixed(2)} jt`;
  }
  return value.toLocaleString("id-ID", { maximumFractionDigits: mode === "advanced" ? 2 : 0 });
}
