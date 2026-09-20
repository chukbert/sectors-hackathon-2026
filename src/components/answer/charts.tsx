"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatIdr, formatNumber, type LangMode } from "@/lib/util/format";

const gridColor = "#232d44";
const axisColor = "#8b96ad";

function compact(value: number, mode: LangMode): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${formatNumber(abs / 1e12, mode)}T`;
  if (abs >= 1e9) return `${formatNumber(abs / 1e9, mode)}M`;
  if (abs >= 1e6) return `${formatNumber(abs / 1e6, mode)}jt`;
  if (abs >= 1e3) return `${formatNumber(abs / 1e3, mode)}rb`;
  return formatNumber(abs, mode);
}

export function SeriesChart({
  points,
  unit,
  mode,
}: {
  points: Array<{ date: string; value: number }>;
  unit: "price" | "idr" | "volume" | "percent" | "count";
  mode: LangMode;
}) {
  const data = points.map((p) => ({ ...p, label: p.date.slice(5) }));
  const isMoney = unit === "idr";
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} minTickGap={24} />
          <YAxis
            tick={{ fill: axisColor, fontSize: 11 }}
            stroke={gridColor}
            width={64}
            tickFormatter={(v: number) => (isMoney ? compact(v, mode) : formatNumber(v, mode))}
          />
          <Tooltip
            contentStyle={{ background: "#111725", border: "1px solid #232d44", borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: axisColor }}
            formatter={(value: unknown) => [isMoney ? formatIdr(Number(value), mode) : formatNumber(Number(value), mode), "Nilai"]}
          />
          <Line type="monotone" dataKey="value" stroke="#7c9cff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionChart({
  bars,
  unit,
  mode,
}: {
  bars: Array<{ label: string; value: number }>;
  unit: "idr" | "percent" | "volume";
  mode: LangMode;
}) {
  const data = bars.map((b) => ({ ...b, fill: b.value >= 0 ? "#3dd68c" : "#ff6b81" }));
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} tickFormatter={(v: number) => compact(v, mode)} />
          <YAxis type="category" dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} stroke={gridColor} width={140} />
          <Tooltip
            contentStyle={{ background: "#111725", border: "1px solid #232d44", borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: axisColor }}
            formatter={(value: unknown) => [unit === "idr" ? formatIdr(Number(value), mode) : formatNumber(Number(value), mode), "Nilai"]}
          />
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