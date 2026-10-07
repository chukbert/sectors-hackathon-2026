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

// compact: untuk kolom perbandingan yang sempit — legenda dan angka sumbu lebih kecil.
export function TrendChart({ trend, height = 280, compact = false }: { trend: Card["trend"]; height?: number; compact?: boolean }) {
  const years = trend.revenue.map((r) => String(r.year));
  const option = {
    textStyle: { fontFamily: FONT },
    grid: { left: 4, right: 4, top: compact ? 26 : 34, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: compact ? 10 : 12, itemHeight: 8, textStyle: { fontSize: compact ? 11 : 12 } },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number | null) => rupiah(v),
    },
    xAxis: { type: "category", data: years, axisTick: { show: false }, axisLine: { lineStyle: { color: "#cfd3dc" } }, axisLabel: { fontSize: compact ? 10 : 12 } },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#e2e4ea" } },
      axisLabel: { fontSize: compact ? 10 : 11, formatter: (v: number) => (v === 0 ? "0" : Math.abs(v) >= 1e12 ? `${(v / 1e12).toLocaleString("id-ID")} T` : `${(v / 1e9).toLocaleString("id-ID")} M`) },
    },
    series: [
      { name: "Pendapatan", type: "bar", data: trend.revenue.map((r) => r.value), itemStyle: { color: "#0b0d12", borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34 },
      { name: "Laba bersih", type: "bar", data: trend.earnings.map((r) => ({ value: r.value, itemStyle: { color: (r.value ?? 0) < 0 ? "#ff7a1a" : "#2b4bff" } })), itemStyle: { color: "#2b4bff", borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34 },
    ],
  };
  return <ReactECharts option={option} className="sj-chart" style={{ height }} notMerge />;
}

// Lima sisi: jari-jari = porsi cek yang lolos di sisi itu (maks = jumlah cek di sisi itu, 4 untuk Kesehatan bank).
// Digambar sebagai SVG sendiri (radar ECharts tidak bisa melengkung): kurva Catmull-Rom tertutup melewati kelima titik,
// grid berupa lingkaran. Titik aslinya tetap ditandai, jadi lengkungan tidak menyembunyikan angkanya.
export function FiveSidesRadar({ sf, height, compact = false }: { sf: Snowflake; height?: number; compact?: boolean }) {
  const L = compact ? { w: 230, h: 210, r: 60, gap: 8, cy: 112, fs: 11, lh: 13 } : { w: 380, h: 320, r: 104, gap: 14, cy: 166, fs: 12.5, lh: 16 };
  const cx = L.w / 2;
  const n = sf.axes.length;
  // Mulai dari atas, berlawanan arah jarum jam (Harga, Prospek, Rekam jejak, Kesehatan, Dividen).
  const ang = (i: number) => -Math.PI / 2 - (i * 2 * Math.PI) / n;
  const at = (i: number, r: number): [number, number] => [cx + r * Math.cos(ang(i)), L.cy + r * Math.sin(ang(i))];
  // Sisi 0/6 tetap punya jari-jari kecil supaya kurvanya tidak terjepit ke satu titik.
  const pts = sf.axes.map((a, i) => at(i, L.r * (0.06 + 0.94 * (a.total ? a.passed / a.total : 0))));
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  const summary = sf.axes.map((a) => `${a.label}: ${a.passed} dari ${a.total} cek lolos${a.assessed < a.total ? ` (${a.total - a.assessed} tanpa data)` : ""}`).join("\n");
  return (
    <svg
      className="sj-radar"
      viewBox={`0 0 ${L.w} ${L.h}`}
      style={{ height: height ?? (compact ? 220 : 340) }}
      role="img"
      aria-label={`Bentuk lima sisi. ${summary.replace(/\n/g, "; ")}`}
    >
      {[3, 2, 1].map((k) => (
        <circle key={k} cx={cx} cy={L.cy} r={(L.r * k) / 3} className={`ring${k % 2 ? "" : " alt"}`} />
      ))}
      {sf.axes.map((a, i) => {
        const [x, y] = at(i, L.r);
        return <line key={a.id} x1={cx} y1={L.cy} x2={x} y2={y} className="spoke" />;
      })}
      <g className="blob" style={{ transformOrigin: `${cx}px ${L.cy}px` }}>
        <path d={d}>
          <title>{summary}</title>
        </path>
        {pts.map(([x, y], i) => (
          <circle key={sf.axes[i].id} cx={x} cy={y} r={compact ? 2.6 : 3.2} className="pt">
            <title>{`${sf.axes[i].label}: ${sf.axes[i].passed} dari ${sf.axes[i].total} cek lolos`}</title>
          </circle>
        ))}
      </g>
      {sf.axes.map((a, i) => {
        const [x, y] = at(i, L.r + L.gap);
        const c = Math.cos(ang(i)), s = Math.sin(ang(i));
        const anchor = Math.abs(c) < 0.3 ? "middle" : c > 0 ? "start" : "end";
        // Label di atas titik: baris terakhir menempel ke titik; di bawah: baris pertama menempel; di samping: di tengah.
        const y0 = s < -0.5 ? y - L.lh : s > 0.5 ? y + L.lh * 0.8 : y - L.lh * 0.15;
        return (
          <text key={a.id} x={x} y={y0} textAnchor={anchor} fontSize={L.fs} className="lab">
            <tspan x={x}>{a.label}</tspan>
            <tspan x={x} dy={L.lh} className="n">
              {a.passed}/{a.total}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
