import { getDb } from "@/lib/db";
import type { Fact } from "@/lib/facts";

export function upsertFacts(facts: Fact[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO fact_memory (fact_id, label, value_num, value_text, unit, as_of, endpoint, args, hit_id, meta, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(fact_id) DO UPDATE SET
       label=excluded.label, value_num=excluded.value_num, value_text=excluded.value_text,
       unit=excluded.unit, as_of=excluded.as_of, hit_id=excluded.hit_id, last_seen=excluded.last_seen`,
  );
  const now = new Date().toISOString();
  const tx = db.transaction((rows: Fact[]) => {
    for (const f of rows) {
      stmt.run(
        f.id,
        f.label,
        f.valueNum ?? null,
        f.valueText ?? null,
        f.unit ?? null,
        f.asOf,
        f.endpoint,
        JSON.stringify(f.args),
        f.hitId ?? null,
        now,
        now,
      );
    }
  });
  tx(facts);
}

export function getFacts(ids: string[]): Fact[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM fact_memory WHERE fact_id IN (${placeholders})`)
    .all(...ids) as Array<{
    fact_id: string;
    label: string;
    value_num: number | null;
    value_text: string | null;
    unit: string | null;
    as_of: string;
    endpoint: string;
    args: string;
  }>;
  return rows.map((r) => ({
    id: r.fact_id,
    label: r.label,
    key: r.label,
    valueNum: r.value_num ?? undefined,
    valueText: r.value_text ?? undefined,
    unit: (r.unit as Fact["unit"]) ?? undefined,
    asOf: r.as_of,
    endpoint: r.endpoint,
    args: JSON.parse(r.args) as Record<string, unknown>,
  }));
}

export function factsForEndpoint(endpoint: string, args: Record<string, unknown>): Fact[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fact_memory WHERE endpoint = ? AND args = ? ORDER BY as_of DESC LIMIT 200`)
    .all(endpoint, JSON.stringify(args)) as Array<{
    fact_id: string;
    label: string;
    value_num: number | null;
    value_text: string | null;
    unit: string | null;
    as_of: string;
    endpoint: string;
    args: string;
  }>;
  return rows.map((r) => ({
    id: r.fact_id,
    label: r.label,
    key: r.label,
    valueNum: r.value_num ?? undefined,
    valueText: r.value_text ?? undefined,
    unit: (r.unit as Fact["unit"]) ?? undefined,
    asOf: r.as_of,
    endpoint: r.endpoint,
    args: JSON.parse(r.args) as Record<string, unknown>,
  }));
}

export function factCount(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM fact_memory`).get() as { n: number };
  return row.n;
}