// lib/dna.ts — F10 Broker DNA fingerprint. Pure code.
export interface BrokerTouch {
  broker: string;
  symbol: string;
  netBuy: number; // Rp M
  days: number;
}
export interface DnaResult {
  label: "spesialis-gorengan" | "conduit-asing" | "mesin-distribusi" | "netral";
  verdict: "akumulasi" | "distribusi" | "data-kurang";
  probability: number;
  repeat: number;
  note: string;
}

export function fingerprintBroker(
  code: string,
  touches: BrokerTouch[],
  opts: { foreignShare?: number; historyRepeat?: number; windowDays?: number } = {}
): DnaResult {
  const mine = touches.filter((t) => t.broker === code);
  if (mine.length === 0)
    return { label: "netral", verdict: "data-kurang", probability: 0.5, repeat: 0, note: `${code}: tanpa history di window ini → data-kurang` };
  const sells = mine.filter((t) => t.netBuy < 0).length;
  const repeat = opts.historyRepeat ?? (sells >= 3 ? 3 : sells);
  const foreignShare = opts.foreignShare ?? 0;
  let label: DnaResult["label"] = "netral";
  if (foreignShare > 0.5) label = "conduit-asing";
  else if (repeat >= 3 && sells / mine.length >= 0.6) label = "mesin-distribusi";
  else if (mine.length >= 5 && sells / mine.length >= 0.6) label = "spesialis-gorengan";
  const verdict = repeat >= 3 || sells / mine.length >= 0.6 ? "distribusi" : "akumulasi";
  const probability = verdict === "distribusi" ? (repeat >= 3 ? 0.74 : 0.62) : 0.6;
  const win = opts.windowDays ?? 14;
  return {
    label, verdict, probability, repeat,
    note: `${code}: ${label}, ${repeat} hari net-sell dari ${mine.length} simbol disentuh (${win}hr terakhir)`,
  };
}

interface ActivityDay {
  date: string;
  summary?: { symbol: string; nval?: number | null; bval?: number | null; sval?: number | null; f_bval?: number | null; f_sval?: number | null }[];
}
interface ActivityResp {
  broker_code?: string;
  data: ActivityDay[];
}

export function touchesFromActivity(code: string, resp: ActivityResp): { touches: BrokerTouch[]; foreignShare: number } {
  const perSymbol = new Map<string, { net: number; days: number }>();
  let fTurn = 0;
  let turn = 0;
  for (const d of resp.data ?? []) {
    for (const s of d.summary ?? []) {
      const sym = (s.symbol ?? "?").replace(/\.JK$/i, "");
      const e = perSymbol.get(sym) ?? { net: 0, days: 0 };
      e.net += (s.nval ?? 0) / 1e9; // Rp → Rp M
      e.days += 1;
      perSymbol.set(sym, e);
      fTurn += (s.f_bval ?? 0) + (s.f_sval ?? 0);
      turn += (s.bval ?? 0) + (s.sval ?? 0);
    }
  }
  const touches: BrokerTouch[] = [...perSymbol.entries()].map(([symbol, e]) => ({
    broker: code, symbol, netBuy: Math.round(e.net * 10) / 10, days: e.days,
  }));
  return { touches, foreignShare: turn > 0 ? Math.round((fTurn / turn) * 100) / 100 : 0 };
}