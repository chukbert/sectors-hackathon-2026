// lib/kuasa.ts — F11 cluster detector (insider + rights + ex-date congestion). Pure code.
export interface InsiderEvent {
  sector: string;
  symbol: string;
  side: "buy" | "sell";
  atDaysAgo: number;
}
export interface KuasaResult {
  flag: boolean;
  kind: "insider-cluster" | "rights-wave" | "ex-congestion" | "ok";
  detail: string;
}

export function detectCluster(events: InsiderEvent[]): KuasaResult {
  const sells = events.filter((e) => e.side === "sell" && e.atDaysAgo <= 7);
  const bySector: Record<string, number> = {};
  for (const e of sells) bySector[e.sector] = (bySector[e.sector] ?? 0) + 1;
  for (const [sector, n] of Object.entries(bySector)) {
    if (n >= 4)
      return { flag: true, kind: "insider-cluster", detail: `${n} insider sell di sektor ${sector} 7hr — bukan 1 emiten, 1 sektor` };
  }
  return { flag: false, kind: "ok", detail: "tidak ada cluster" };
}

export function detectRightsWave(rightsCount: number, windowDays: number): KuasaResult {
  if (rightsCount >= 3 && windowDays <= 30)
    return { flag: true, kind: "rights-wave", detail: `${rightsCount} rights issue dalam ${windowDays}hr (wave)` };
  return { flag: false, kind: "ok", detail: "rights normal" };
}

export function detectExCongestion(exCount: number, windowDays: number): KuasaResult {
  if (exCount >= 5 && windowDays <= 7)
    return { flag: true, kind: "ex-congestion", detail: `${exCount} ex-date seminggu — congestion` };
  return { flag: false, kind: "ok", detail: "ex-date normal" };
}

interface FilingRow {
  symbol?: string;
  sector?: string;
  sub_sector?: string;
  transaction_type?: string;
  timestamp?: string;
}

// Sectors filings → InsiderEvent. atDaysAgo dari timestamp; tanpa timestamp → tidak dipakai (jujur).
export function eventsFromFilings(resp: { results?: FilingRow[] }, now = Date.now()): InsiderEvent[] {
  const out: InsiderEvent[] = [];
  for (const f of resp.results ?? []) {
    const side = (f.transaction_type ?? "").toLowerCase();
    if (side !== "sell" && side !== "buy") continue;
    let days: number | null = null;
    if (f.timestamp) {
      const t = new Date(f.timestamp).getTime();
      if (Number.isFinite(t)) days = Math.max(0, Math.round((now - t) / 86400000));
    }
    if (days === null) continue;
    out.push({
      sector: (f.sector ?? "unknown").toLowerCase(),
      symbol: (f.symbol ?? "?").replace(/\.JK$/i, ""),
      side,
      atDaysAgo: days,
    });
  }
  return out;
}