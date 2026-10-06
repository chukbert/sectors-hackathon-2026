"use client";

import dynamic from "next/dynamic";
import type { Card, Spend } from "@/lib/struk";
import { rp, rupiah } from "@/lib/struk";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const FONT = "Plus Jakarta Sans, Roboto, sans-serif";

export function MoneySankey({ money }: { money: NonNullable<Card["money"]> }) {
  // Peran node ditentukan dari label asli (Inggris) Sectors + posisinya di aliran, bukan dari terjemahan
  // ("Biaya Jasa" = service fee = pendapatan). Laba yang muncul sebagai SUMBER biaya berarti rugi.
  const raw = money.links.filter((l) => l.value > 0);
  const cost = /cost|expense|tax/i;
  const profit = /profit|income/i;
  const targets = new Set(raw.map((l) => l.target));
  const lossNodes = new Set(raw.filter((l) => profit.test(l.source) && !targets.has(l.source)).map((l) => l.source));
  const label = (s: string) => money.explain?.labels?.[s] ?? s;
  const tr = (s: string) => (lossNodes.has(s) ? (/^laba/i.test(label(s)) ? label(s).replace(/^laba/i, "Rugi") : `Rugi: ${label(s)}`) : label(s));
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

// Dompet → emiten → grup pemilik. Nilai = harga di struk pengguna; tidak ada angka perusahaan di diagram ini.
export function SpendSankey({ spend, names }: { spend: Spend; names: Record<string, string> }) {
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  const WALLET = "Belanjamu";
  const OTHER = "Bukan emiten";
  const two = (name: string, v: number) => `{n|${name}}\n{v|${rp(v)}}`;
  type Node = { name: string; itemStyle: { color: string }; label?: Record<string, unknown> };
  // Kode saham di kolom tengah diberi latar putih agar tetap terbaca di atas aliran.
  const mid = { formatter: (p: { name: string }) => p.name, backgroundColor: "#ffffff", padding: [2, 4], borderRadius: 3, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 };
  const data: Node[] = [{ name: WALLET, itemStyle: { color: "#0b0d12" }, label: { formatter: () => two(WALLET, spend.total) } }];
  const links: { source: string; target: string; value: number }[] = [];
  for (const c of spend.companies) {
    data.push({ name: c.symbol, itemStyle: { color: c.verified ? "#2b4bff" : "#ff7a1a" }, label: mid });
    links.push({ source: WALLET, target: c.symbol, value: c.amount });
  }
  for (const g of spend.groups) {
    // Nama grup bisa sama dengan kode/nama lain; beri akhiran agar node tetap unik.
    const gname = data.some((d) => d.name === g.label) ? `${g.label} ` : g.label;
    data.push({ name: gname, itemStyle: { color: "#8aa61f" }, label: { formatter: () => two(g.kind === "dispersed" ? "Tanpa pengendali tunggal" : g.label, g.amount) } });
    for (const sym of g.symbols) {
      const c = spend.companies.find((x) => x.symbol === sym);
      if (c) links.push({ source: sym, target: gname, value: c.amount });
    }
  }
  if (spend.other > 0) {
    data.push({ name: OTHER, itemStyle: { color: "#cfd3dc" }, label: { formatter: () => two(OTHER, spend.other) } });
    links.push({ source: WALLET, target: OTHER, value: spend.other });
  }
  const full = (n: string) => (names[n] ? `${n} · ${names[n]}` : n.trim());
  const option = {
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: { dataType: string; data: { source?: string; target?: string; value?: number }; name: string; value: number }) =>
        p.dataType === "edge"
          ? `${full(p.data.source ?? "")} → ${full(p.data.target ?? "")}<br/><b>${rp(p.data.value)}</b>`
          : `${full(p.name)}<br/><b>${rp(p.value)}</b>`,
    },
    series: [
      {
        type: "sankey",
        left: 4,
        right: narrow ? 104 : 180,
        top: 10,
        bottom: 24,
        nodeWidth: 12,
        nodeGap: 22,
        nodeAlign: "left",
        draggable: false,
        emphasis: { focus: "adjacency" },
        data,
        links,
        lineStyle: { color: "gradient", opacity: 0.25, curveness: 0.5 },
        label: {
          color: "#0b0d12",
          fontSize: narrow ? 10.5 : 12,
          rich: {
            n: { fontSize: narrow ? 10.5 : 12, fontWeight: 600, color: "#0b0d12", width: narrow ? 96 : 172, overflow: "truncate", lineHeight: 16 },
            v: { fontFamily: "IBM Plex Mono, monospace", fontSize: narrow ? 10 : 11, color: "#6b7180", lineHeight: 14 },
          },
        },
      },
    ],
  };
  const rows = Math.max(spend.companies.length + (spend.other > 0 ? 1 : 0), spend.groups.length);
  return <ReactECharts option={option} className="sj-chart" style={{ height: Math.max(240, rows * 64) }} notMerge />;
}
