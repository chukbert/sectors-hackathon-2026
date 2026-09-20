"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatIdr, formatNumber, type LangMode } from "@/lib/util/format";

const gridColor = "#2b2d3a";
const axisColor = "#9a9aa8";
export const C_ACCENT = "#ff8b3d";
export const C_LIME = "#a3e635";
export const C_RED = "#ff5c6c";
export const C_MUTED = "#6b6d7a";

const tooltipStyle = {
  background: "#14151d",
  border: `1px solid ${gridColor}`,
  borderRadius: 12,
  fontSize: 12,
} as const;

function compact(value: number, mode: LangMode): string {
  return formatCompact(value, mode);
}

export function SeriesChart({
  points,
  unit,
  mode,
  hi,
  lo,
}: {
  points: Array<{ date: string; value: number }>;
  unit: "price" | "idr" | "volume" | "percent" | "count";
  mode: LangMode;
  hi?: number;
  lo?: number;
}) {
  if (points.length < 3) return <EmptyViz reason="Seri data kurang dari 3 titik untuk grafik." />;
  if (unit === "price") return <PriceAreaChart points={points} mode={mode} hi={hi} lo={lo} />;
  const crossesZero = points.some((p) => p.value < 0);
  if (unit === "idr" && crossesZero) return <FlowDivergingChart points={points} mode={mode} />;
  const isMoney = unit === "idr";
  const data = points.map((p) => ({ ...p, label: p.date.slice(5) }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} minTickGap={24} />
          <YAxis tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} width={64} tickFormatter={(v: number) => (isMoney ? compact(v, mode) : formatNumber(v, mode))} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: axisColor }}
            formatter={(value: unknown) => [isMoney ? formatIdr(Number(value), mode) : formatNumber(Number(value), mode), "Nilai"]}
          />
          <Line type="monotone" dataKey="value" stroke={C_ACCENT} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceAreaChart({ points, mode, hi, lo }: { points: Array<{ date: string; value: number }>; mode: LangMode; hi?: number; lo?: number }) {
  const data = points.map((p) => ({ ...p, label: p.date.slice(5) }));
  const last = data[data.length - 1];
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 14, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C_ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={C_ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          {hi !== undefined && lo !== undefined && data.length ? (
            <ReferenceArea x1={data[0].label} x2={last.label} y1={lo} y2={hi} fill={C_LIME} fillOpacity={0.06} strokeOpacity={0} />
          ) : null}
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} minTickGap={24} />
          <YAxis tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} width={64} domain={["auto", "auto"]} tickFormatter={(v: number) => formatNumber(v, mode)} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} formatter={(value: unknown) => [formatNumber(Number(value), mode), "Harga"]} />
          <Area type="monotone" dataKey="value" stroke={C_ACCENT} strokeWidth={2} fill="url(#priceFill)" dot={false} />
          {last ? <ReferenceDot x={last.label} y={last.value} r={4} fill={C_ACCENT} stroke="#0b0c10" strokeWidth={2} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FlowDivergingChart({ points, mode }: { points: Array<{ date: string; value: number }>; mode: LangMode }) {
  const data = points.map((p) => ({ ...p, label: p.date.slice(5), fill: p.value >= 0 ? C_LIME : C_RED }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} minTickGap={20} />
          <YAxis tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} width={64} tickFormatter={(v: number) => compact(v, mode)} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(value: unknown) => [formatIdr(Number(value), mode), "Net flow"]} />
          <ReferenceLine y={0} stroke={axisColor} />
          <Bar dataKey="value" radius={[3, 3, 3, 3]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionChart({ bars, unit, mode }: { bars: Array<{ label: string; value: number }>; unit: "idr" | "percent" | "volume"; mode: LangMode }) {
  const data = bars.map((b) => ({ ...b, fill: b.value >= 0 ? C_LIME : C_RED }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} tickFormatter={(v: number) => compact(v, mode)} />
          <YAxis type="category" dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} width={140} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(value: unknown) => [unit === "idr" ? formatIdr(Number(value), mode) : formatNumber(Number(value), mode), "Nilai"]} />
          <ReferenceLine x={0} stroke={axisColor} />
          <Bar dataKey="value" radius={[4, 4, 4, 4]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BrokerTornadoChart({ buyers, sellers, mode }: { buyers: Array<{ code: string; value: number }>; sellers: Array<{ code: string; value: number }>; mode: LangMode }) {
  const data = [
    ...buyers.map((b) => ({ code: b.code, value: Math.abs(b.value), side: "buy" as const })),
    ...sellers.map((s) => ({ code: s.code, value: -Math.abs(s.value), side: "sell" as const })),
  ];
  if (!data.length) return <EmptyViz reason="Tidak ada data broker untuk tornado." />;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} tickFormatter={(v: number) => compact(v, mode)} />
          <YAxis type="category" dataKey="code" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} width={52} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} cursor={{ fill: "rgba(255,255,255,0.03)" }} formatter={(value: unknown) => [formatIdr(Math.abs(Number(value)), mode), "Nilai"]} />
          <ReferenceLine x={0} stroke={axisColor} />
          <Bar dataKey="value" radius={[3, 3, 3, 3]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.side === "buy" ? C_LIME : C_RED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DONUT_COLORS = [C_LIME, C_ACCENT, C_MUTED, "#5b8def", "#c084fc"];

export function ShareDonutChart({ parts, mode }: { parts: Array<{ label: string; value: number; color?: string }>; mode: LangMode }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const data = parts.map((p, i) => ({ ...p, pct: (p.value / total) * 100, fill: p.color ?? DONUT_COLORS[i % DONUT_COLORS.length] }));
  return (
    <div className="flex items-center gap-4">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="pct" nameKey="label" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown, name: unknown) => [`${formatNumber(Number(value), mode)}%`, String(name)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
            <span className="text-ink/90">{d.label}</span>
            <span className="tabular text-muted">{formatNumber(d.pct, mode)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ points, tone = "neu" }: { points: Array<{ date: string; value: number }>; tone?: "pos" | "neg" | "neu" }) {
  if (points.length < 2) return null;
  const data = points.map((p) => ({ v: p.value }));
  const color = tone === "neg" ? C_RED : tone === "pos" ? C_LIME : C_ACCENT;
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniBars({ points }: { points: Array<{ date: string; value: number }> }) {
  if (points.length < 2) return null;
  const data = points.map((p) => ({ v: p.value, fill: p.value >= 0 ? C_LIME : C_RED }));
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <ReferenceLine y={0} stroke={gridColor} />
          <Bar dataKey="v" radius={[2, 2, 2, 2]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutMini({ parts }: { parts: Array<{ label: string; value: number }> }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const data = parts.map((p, i) => ({ ...p, pct: (p.value / total) * 100, fill: DONUT_COLORS[i % DONUT_COLORS.length] }));
  return (
    <div className="h-12 w-12 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="pct" innerRadius={15} outerRadius={24} paddingAngle={2} stroke="none" isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyViz({ reason }: { reason: string }) {
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-line bg-surface2/30 px-4 text-center text-xs text-muted">
      {reason}
    </div>
  );
}
