// lib/gnn.ts — F12 GNN-lite: 11 fitur + correlation graph + anomaly score code (tanpa torch runtime).
export function features11(closes: number[]): number[] {
  const n = closes.length;
  const rets: number[] = [];
  for (let i = 1; i < n; i++) rets.push((closes[i] - closes[i - 1]) / Math.max(1e-9, closes[i - 1]));
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const std = (a: number[]) => {
    const m = mean(a);
    return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
  };
  const m = mean(rets);
  const s = std(rets) || 1e-9;
  const last = closes[n - 1] ?? 0;
  const sma20 = mean(closes.slice(-20));
  const vol = s;
  const spike = Math.abs(rets[rets.length - 1] ?? 0) / (s || 1e-9);
  const z = ((rets[rets.length - 1] ?? 0) - m) / s;
  const sharpe = (m / (s || 1e-9)) * Math.sqrt(252);
  const volRegime = vol > 0.03 ? 1 : vol > 0.015 ? 0.5 : 0;
  const smaGap = (last - sma20) / Math.max(1e-9, sma20);
  return [m, s, last, sma20, vol, spike, z, smaGap, sharpe, volRegime, rets.length];
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = a.slice(-n).reduce((s, x) => s + x, 0) / n;
  const mb = b.slice(-n).reduce((s, x) => s + x, 0) / n;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[a.length - n + i]! - ma) * (b[b.length - n + i]! - mb);
    da += (a[a.length - n + i]! - ma) ** 2;
    db += (b[b.length - n + i]! - mb) ** 2;
  }
  return num / Math.max(1e-9, Math.sqrt(da * db));
}

export interface Anomaly {
  symbol: string;
  score: number;
}

export function anomalyScores(series: Record<string, number[]>, threshold = 0.6): Anomaly[] {
  const syms = Object.keys(series);
  const out: Anomaly[] = [];
  for (const s of syms) {
    const f = features11(series[s]!);
    const z = Math.abs(f[6]!);
    // neighbor disconnect: 1 - max correlation (anomali bila gerak sendiri)
    let maxCorr = 0;
    for (const o of syms) {
      if (o === s) continue;
      maxCorr = Math.max(maxCorr, Math.abs(correlation(series[s]!, series[o]!)));
    }
    void threshold;
    const score = Math.min(1, z / 3 + (1 - maxCorr) * 0.5);
    out.push({ symbol: s, score: Math.round(score * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}
