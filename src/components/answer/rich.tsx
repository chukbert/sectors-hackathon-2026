"use client";

import type { ReactNode } from "react";
import type { FactRef } from "@/lib/output/answerdoc";
import { formatIdr, formatNumber, formatPer, formatPercent, formatSigned, type LangMode } from "@/lib/util/format";

export function formatFactRef(ref: FactRef, mode: LangMode): string {
  if (ref.valueNum === undefined) {
    if (ref.format === "date") return ref.asOf;
    return ref.valueText ?? "—";
  }
  switch (ref.format) {
    case "idr":
      return formatIdr(ref.valueNum, mode);
    case "percent":
      return formatPercent(ref.valueNum, mode);
    case "per":
      return formatPer(ref.valueNum, mode);
    case "signed":
      return formatSigned(ref.valueNum, mode);
    case "date":
      return ref.valueText ?? ref.asOf;
    case "text":
      return ref.valueText ?? "—";
    default:
      return formatNumber(ref.valueNum, mode);
  }
}

export function FactChip({ fact, children }: { fact: FactRef; children: ReactNode }) {
  const detail = `${fact.label}\nas of ${fact.asOf} · sumber: ${fact.source}${fact.valueNum !== undefined ? ` · nilai mentah: ${fact.valueNum}` : ""}`;
  return (
    <span className="fact-chip tabular" title={detail} data-fact-id={fact.id}>
      {children}
    </span>
  );
}

const TOKEN = /\{\{f:([a-z0-9]+)\|(number|idr|percent|per|signed|text|date)\}\}/gi;

export function renderTemplate(text: string, index: Map<string, FactRef>, mode: LangMode): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const fact = index.get(match[1]);
    if (fact) {
      nodes.push(
        <FactChip key={`${match[1]}-${start}`} fact={fact}>
          {formatFactRef(fact, mode)}
        </FactChip>,
      );
    } else {
      nodes.push(<span key={`${match[1]}-${start}`}>[data tidak ditemukan]</span>);
    }
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}