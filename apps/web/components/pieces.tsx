"use client";

import dynamic from "next/dynamic";
import React from "react";
import type { ChartSpec, Piece, TableSpec } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function fmtCell(value: unknown, format?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : Number(String(value).replace(/\./g, "").replace(",", "."));
  const localize = (v: number, digits = 1) =>
    v.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  switch (format) {
    case "pct":
      return typeof num === "number" && !Number.isNaN(num) ? `${localize(num)}%` : String(value);
    case "pct100":
      return typeof num === "number" && !Number.isNaN(num) ? `${localize(num * 100, 1)}%` : String(value);
    case "x":
      return typeof num === "number" && !Number.isNaN(num) ? `${localize(num, 1)}x` : String(value);
    case "idr": {
      if (typeof num !== "number" || Number.isNaN(num)) return String(value);
      const abs = Math.abs(num);
      if (abs >= 1e15) return `Rp${localize(num / 1e15, 2)} Kuadriliun`;
      if (abs >= 1e12) return `Rp${localize(num / 1e12, 1)} T`;
      if (abs >= 1e9) return `Rp${localize(num / 1e9, 1)} M`;
      if (abs >= 1e6) return `Rp${localize(num / 1e6, 1)} jt`;
      return `Rp${localize(num, 0)}`;
    }
    case "num":
      return typeof num === "number" && !Number.isNaN(num) ? localize(num, 0) : String(value);
    case "date": {
      const s = String(value);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return s;
      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      return `${m[3]} ${months[Number(m[2]) - 1]} ${m[1]}`;
    }
    case "bool":
      return value ? "Aktif" : "—";
    default:
      return typeof value === "number" ? localize(value, 1) : String(value);
  }
}

function mapOption(spec: ChartSpec) {
  const points = spec.points ?? [];
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.lon - 100)));
  return {
    textStyle: { fontFamily: "Roboto, 'Google Sans', Arial, sans-serif" },
    tooltip: { trigger: "item", formatter: "{b}" },
    xAxis: { type: "value", name: "Longitude", min: 95, max: 141, axisLabel: { fontSize: 10, color: "#747775" } },
    yAxis: { type: "value", name: "Latitude", min: -11, max: 7, axisLabel: { fontSize: 10, color: "#747775" } },
    series: [
      {
        type: "scatter",
        symbolSize: Math.max(10, Math.min(28, 30 - maxAbs)),
        data: points.map((p) => ({ name: `${p.name} · ${p.label ?? ""}`, value: [p.lon, p.lat] })),
        itemStyle: { color: "#1b4dd8", opacity: 0.8 },
        label: { show: true, formatter: "{b}", fontSize: 10, position: "right" },
      },
    ],
  };
}

export function ChartView({ spec }: { spec: ChartSpec }) {
  if (spec._kind === "map") return <ReactECharts option={mapOption(spec)} style={{ height: spec._height ?? 300, width: "100%" }} notMerge lazyUpdate />;
  return <ReactECharts option={spec} style={{ height: spec._height ?? 280, width: "100%" }} notMerge lazyUpdate />;
}

export function ItemsView({
  items,
  onEvidence,
}: {
  items: Record<string, unknown>[];
  onEvidence?: (evidenceId: string) => void;
}) {
  if (!items?.length) return null;
  const kind = String(items[0]?.kind ?? "");
  if (kind === "check") {
    return (
      <div>
        {items.map((item, i) => (
          <div className="check" key={i}>
            <span className={`flagdot ${item.triggered ? "no" : "ok"}`}>{item.triggered ? "!" : "✓"}</span>
            <span>
              <b>{String(item.label)}</b>
              {item.symbol ? ` · ${String(item.symbol)}` : ""} — {String(item.detail ?? "")}
              {item.ev_ref && onEvidence ? (
                <>
                  {" "}
                  —{" "}
                  <span className="ev" onClick={() => onEvidence(String(item.ev_ref))}>
                    bukti
                  </span>
                </>
              ) : null}
              {item.weight ? <span className="chip" style={{ marginLeft: 6 }}>bobot {String(item.weight)}</span> : null}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "timeline") {
    return (
      <div className="tline">
        {items.map((item, i) => (
          <div className="ev2" key={i}>
            <b>{String(item.symbol)}</b> · {String(item.label)} · {fmtCell(item.date, "date")}
            {item.detail ? ` — ${String(item.detail)}` : ""}
          </div>
        ))}
      </div>
    );
  }
  if (kind === "news") {
    return (
      <div>
        {items.map((item, i) => (
          <div className="newsitem" key={i}>
            <div>
              {item.url ? (
                <a href={String(item.url)} target="_blank" rel="noreferrer">
                  {String(item.title)}
                </a>
              ) : (
                String(item.title)
              )}
            </div>
            <div className="meta">
              {String(item.symbol ?? "")} · {fmtCell(item.date, "date")} · {String(item.source ?? "")}{" "}
              {(item.tags as string[] | undefined)?.map((t) => (
                <span className="tag" key={t}>
                  #{t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "sector") {
    return (
      <div>
        {items.map((item, i) => (
          <div className="treerow" key={i}>
            <b>{String(item.label)}</b>
            <div className="treechild">{(item.symbols as string[] | undefined)?.join(", ")}</div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "tree") {
    return (
      <div>
        {items.map((item, i) => (
          <div className="treerow" key={i}>
            <b>{String(item.label)}</b>
            {(item.children as { label: string }[] | undefined)?.map((c, j) => (
              <div className="treechild" key={j}>
                └ {c.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (kind === "event") {
    return (
      <div className="tline">
        {items.map((item, i) => (
          <div className="ev2" key={i}>
            <b>{String(item.symbol)}</b> · {String(item.label)} {fmtCell(item.date, "date")} — {String(item.detail ?? "")}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function PieceCard({
  piece,
  onEvidence,
}: {
  piece: Piece;
  onEvidence: (evidenceId: string) => void;
}) {
  return (
    <div className="card2">
      <h4>{piece.title}</h4>
      <p className="sub">{piece.why?.startsWith(piece.io) ? piece.why : `${piece.io} · ${piece.why}`}</p>
      {piece.status !== "ready" ? (
        <div className="empty">{piece.empty_reason ?? "Data tidak tersedia pada scope ini."}</div>
      ) : (
        <>
          {piece.narrative ? <p className="narr">{piece.narrative}</p> : null}
          {piece.kpis?.length ? (
            <div className="kpis">
              {piece.kpis.map((kpi, i) => (
                <div className={`kpi ${kpi.tone ?? ""}`} key={i}>
                  <div className="l">{kpi.label}</div>
                  <div className="v">{kpi.value}</div>
                  {kpi.sub ? <div className="s">{kpi.sub}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
          {piece.chart ? <ChartView spec={piece.chart} /> : null}
          {piece.table ? (
            <div className="tblwrap">
              <table className="data">
                <thead>
                  <tr>
                    {piece.table.columns.map((c) => (
                      <th key={c.key} style={{ textAlign: c.align === "right" ? "right" : "left" }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {piece.table.rows.map((row, i) => (
                    <tr key={i}>
                      {piece.table!.columns.map((c) => (
                        <td
                          key={c.key}
                          className={c.better && row[`${c.key}_better`] ? "cell-good" : undefined}
                          style={{ textAlign: c.align === "right" ? "right" : "left" }}
                        >
                          {fmtCell(row[c.key], c.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <ItemsView items={piece.items} onEvidence={onEvidence} />
          {piece.evidence?.length ? (
            <div className="src">
              Sumber:{" "}
              {piece.evidence.slice(0, 4).map((ev, i) => (
                <React.Fragment key={ev}>
                  {i > 0 ? " · " : ""}
                  <span className="ev" onClick={() => onEvidence(ev)}>
                    {ev}
                  </span>
                </React.Fragment>
              ))}
            </div>
          ) : null}
          {piece.table?.note ? <div className="src">{piece.table.note}</div> : null}
        </>
      )}
    </div>
  );
}