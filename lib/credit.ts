// lib/credit.ts — Credit Guard keras. Semua fetch Sectors WAJIB lewat sini.
// Budget per sesi bisa diatur: SECTORS_BUDGET (default 6). Tim lomba punya 1.000 kredit; naikkan saat verifikasi/demo.
export const SESSION_BUDGET = Math.max(1, Number(process.env.SECTORS_BUDGET ?? 6) || 6);

export interface LedgerEntry {
  endpoint: string;
  cost: number;
  cached: boolean;
  at: string;
  note?: string; // HTTP 400/404/429/5xx/jaringan — upaya tetap tercatat walau 0kr (transparansi ledger)
}

export class CreditSession {
  spent = 0;
  ledger: LedgerEntry[] = [];
  constructor(public id: string) {}
  get remaining() {
    return SESSION_BUDGET - this.spent;
  }
  canAfford(cost: number) {
    if (this.spent + cost > SESSION_BUDGET)
      throw new Error(`CREDIT_EXHAUSTED: butuh ${cost}kr, sisa ${this.remaining}kr — data ini dilewati, bukan dikarang.`);
  }
  charge(endpoint: string, cost: number, cached = false, note?: string) {
    this.spent += cost;
    this.ledger.push({ endpoint, cost, cached, at: new Date().toISOString(), note });
  }
  badge() {
    return `⚡ ${this.spent} kredit`;
  }
}

// Tabel biaya konservatif. Report multi-section ditagih per section (sama seperti dokumen harga).
// Quarterly financials ditagih per kuartal (n_quarters), sesuai dokumentasi Sectors.
export function estimateCost(endpoint: string): number {
  const sections = endpoint.match(/[?&]sections=([^&]+)/)?.[1];
  if (sections && !sections.includes("all")) return Math.max(1, sections.split(",").filter(Boolean).length);
  if (endpoint.includes("/financials/quarterly/")) {
    const n = Number(endpoint.match(/[?&]n_quarters=(\d+)/)?.[1] ?? 1);
    return Math.max(1, Number.isFinite(n) ? n : 1);
  }
  if (endpoint.includes("most-traded")) return 2;
  if (endpoint.includes("top-changes")) {
    const cls = endpoint.match(/classifications=([^&]+)/)?.[1]?.split(",").filter(Boolean).length ?? 1;
    const per = endpoint.match(/periods=([^&]+)/)?.[1]?.split(",").filter(Boolean).length ?? 1;
    return Math.max(1, cls * per);
  }
  if (endpoint.includes("?q=") || endpoint.includes("sections=all") || endpoint.includes("type=all")) return 3;
  if (endpoint.includes("full-universe") || endpoint.includes("universe")) return 2;
  if (endpoint.includes("free-float") || endpoint.includes("/brokers/top") || endpoint.includes("broker-summary") && endpoint.includes("/top/")) return 2;
  return 1;
}