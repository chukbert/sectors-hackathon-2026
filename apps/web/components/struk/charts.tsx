"use client";

import dynamic from "next/dynamic";
import type { Card, Snowflake } from "@/lib/struk";
import { rupiah } from "@/lib/struk";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const FONT = "Plus Jakarta Sans, Roboto, sans-serif";

export function MoneySankey({ money }: { money: NonNullable<Card["money"]> }) {
  // Label segmen tampil apa adanya dari Sectors (bahasa Inggris). Peran node ditentukan dari label + posisinya
  // di aliran. Laba yang muncul sebagai SUMBER biaya berarti rugi.
  const raw = money.links.filter((l) => l.value > 0);
  const cost = /cost|expense|tax/i;
  const profit = /profit|income/i;
  const targets = new Set(raw.map((l) => l.target));
  const lossNodes = new Set(raw.filter((l) => profit.test(l.source) && !targets.has(l.source)).map((l) => l.source));
  const tr = (s: string) => (lossNodes.has(s) ? `Rugi: ${s}` : s);
  const color = (s: string) => (lossNodes.has(s) || cost.test(s) ? "#ff7a1a" : profit.test(s) ? "#2b4bff" : "#0b0d12");
  const links = raw.map((l) => ({ source: tr(l.source), target: tr(l.target), value: l.value }));
  const nodeColor = new Map(raw.flatMap((l) => [[tr(l.source), color(l.source)] as const, [tr(l.target), color(l.target)] as const]));
  const names = Array.from(nodeColor.keys());
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const option = {
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: { dataType: string; data: { source?: string; target?: string; value?: number }; name: string; value: number }) =>
        p.dataType === "edge" ? `${p.data.source} → ${p.data.target}<br/><b>${rupiah(p.data.value)}</b>` : `${p.name}<br/><b>${rupiah(p.value)}</b>`,
    },
    series: [
      {
        type: "sankey",
        left: 4,
        right: narrow ? 78 : 120,
        top: 8,
        bottom: 8,
        nodeWidth: 12,
        nodeGap: narrow ? 16 : 12,
        draggable: false,
        emphasis: { focus: "adjacency" },
        data: names.map((n) => ({
          name: n,
          itemStyle: { color: nodeColor.get(n) },
        })),
        links,
        lineStyle: { color: "gradient", opacity: 0.22, curveness: 0.5 },
        label: { fontSize: narrow ? 10 : 11.5, color: "#0b0d12", width: narrow ? 74 : 116, overflow: "break", lineHeight: narrow ? 12 : 14 },
      },
    ],
  };
  return <ReactECharts option={option} className="sj-chart tall" style={{ height: narrow ? 460 : 380 }} notMerge />;
}

export function TrendChart({ trend }: { trend: Card["trend"] }) {
  const years = trend.revenue.map((r) => String(r.year));
  const option = {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 12 } },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number | null) => rupiah(v),
    },
    xAxis: { type: "category", data: years, axisTick: { show: false }, axisLine: { lineStyle: { color: "#cfd3dc" } } },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#e2e4ea" } },
      axisLabel: { fontSize: 11, formatter: (v: number) => (v === 0 ? "0" : Math.abs(v) >= 1e12 ? `${(v / 1e12).toLocaleString("id-ID")} T` : `${(v / 1e9).toLocaleString("id-ID")} M`) },
    },
    series: [
      { name: "Pendapatan", type: "bar", data: trend.revenue.map((r) => r.value), itemStyle: { color: "#0b0d12", borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34 },
      { name: "Laba bersih", type: "bar", data: trend.earnings.map((r) => ({ value: r.value, itemStyle: { color: (r.value ?? 0) < 0 ? "#ff7a1a" : "#2b4bff" } })), itemStyle: { color: "#2b4bff", borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34 },
    ],
  };
  return <ReactECharts option={option} className="sj-chart" style={{ height: 280 }} notMerge />;
}

// Lima sisi: jari-jari = jumlah cek yang lolos di sisi itu (maks = jumlah cek di sisi itu).
export function FiveSidesRadar({ sf }: { sf: Snowflake }) {
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const option = {
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: () =>
        sf.axes.map((a) => `${a.label}: <b>${a.passed}</b> dari ${a.total} cek lolos${a.assessed < a.total ? ` (${a.total - a.assessed} tanpa data)` : ""}`).join("<br/>"),
    },
    radar: {
      radius: narrow ? "62%" : "68%",
      center: ["50%", "54%"],
      startAngle: 90,
      splitNumber: 3,
      shape: "polygon",
      indicator: sf.axes.map((a) => ({ name: `${a.label}\n${a.passed}/${a.total}`, max: a.total, min: 0 })),
      axisName: { color: "#0b0d12", fontSize: narrow ? 11 : 12.5, fontWeight: 600, lineHeight: 16 },
      splitLine: { lineStyle: { color: "#e2e4ea" } },
      splitArea: { areaStyle: { color: ["#ffffff", "#f7f9fc"] } },
      axisLine: { lineStyle: { color: "#cfd3dc" } },
    },
    series: [
      {
        type: "radar",
        symbol: "circle",
        symbolSize: 6,
        data: [{ value: sf.axes.map((a) => a.passed), name: "cek lolos" }],
        lineStyle: { color: "#2b4bff", width: 2 },
        itemStyle: { color: "#2b4bff" },
        areaStyle: { color: "rgba(43, 75, 255, 0.18)" },
      },
    ],
  };
  return <ReactECharts option={option} className="sj-chart" style={{ height: narrow ? 300 : 340 }} notMerge />;
}
