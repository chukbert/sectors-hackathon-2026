import { getDb } from "@/lib/db";
import { getMode, spentToday } from "@/lib/db/api-hit-store";
import { todayJakarta, daysBetween } from "@/lib/util/time";
import type { Slots } from "@/lib/agent/types";

export type Digest = {
  text: string;
  symbols: string[];
  cached: Array<{ symbol: string; endpoint: string; latest: string; ageDays: number }>;
  spentTodayKr: number;
  mode: string;
};

const KEY_ENDPOINTS = ["daily", "foreign-flow", "broker-summary-top", "broker-summary", "quarterly", "report", "news", "filings", "top-changes", "most-traded", "brokers", "subsectors", "industries"];

export function buildDigest(slots: Slots): Digest {
  const symbols = slots.symbols.length ? slots.symbols : [];
  const cached: Digest["cached"] = [];
  if (symbols.length) {
    const rows = getDb()
      .prepare(
        `SELECT endpoint, args, MAX(last_seen) AS last_seen FROM fact_memory
         WHERE endpoint IN (${KEY_ENDPOINTS.map(() => "?").join(",")})
           AND (${symbols.map(() => "args LIKE ?").join(" OR ")})
         GROUP BY endpoint`,
      )
      .all(
        ...KEY_ENDPOINTS,
        ...symbols.map((s) => `%"symbol":"${s}"%`),
      ) as Array<{ endpoint: string; args: string; last_seen: string }>;
    for (const row of rows) {
      const args = JSON.parse(row.args) as { symbol?: string };
      const sym = args.symbol ?? symbols[0];
      cached.push({ symbol: sym, endpoint: row.endpoint, latest: row.last_seen.slice(0, 10), ageDays: daysBetween(row.last_seen.slice(0, 10), todayJakarta()) });
    }
  }
  const lines: string[] = [];
  if (cached.length) {
    for (const c of cached) {
      lines.push(`- ${c.symbol} · ${c.endpoint}: tersedia sampai ${c.latest} (cache ${c.ageDays}h lalu)`);
    }
  } else if (symbols.length) {
    lines.push(`- ${symbols.join(", ")}: belum ada data tercache; rencanakan pengambilan live.`);
  }
  const spent = spentToday();
  lines.push(`- kredit Sectors terpakai hari ini: ${spent.toFixed(0)} kr · mode ${getMode()}`);
  return { text: lines.join("\n"), symbols, cached, spentTodayKr: spent, mode: getMode() };
}