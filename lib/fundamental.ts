// lib/fundamental.ts — peta pertanyaan fundamental emiten → mode + endpoint (deterministik, tanpa LLM).
// Angka tetap milik Sectors; ARUS tidak menghitung ulang, hanya menata & menerjemahkan.
export type FundMode = "valuasi" | "kinerja" | "tahunan" | "segmen" | "prospek" | "manajemen" | "peer" | "tentang";

export const FUND_MODES: FundMode[] = ["valuasi", "kinerja", "tahunan", "segmen", "prospek", "manajemen", "peer", "tentang"];

export interface FundQuery { mode: FundMode; label: string; sections: string[] }

/** Mode tervalidasi dari query compiler → bentuk eksekusi deterministik (label + section Sectors). */
export function fundQueryFor(mode: FundMode): FundQuery {
  switch (mode) {
    case "segmen": return { mode, label: "Segmen pendapatan", sections: [] };
    case "prospek": return { mode, label: "Prospek & estimasi analis", sections: ["future"] };
    case "manajemen": return { mode, label: "Manajemen", sections: ["management"] };
    case "peer": return { mode, label: "Peer sebanding", sections: ["peers"] };
    case "tahunan": return { mode, label: "Kinerja tahunan", sections: ["financials"] };
    case "kinerja": return { mode, label: "Kinerja kuartalan", sections: [] };
    case "tentang": return { mode, label: "Profil perusahaan", sections: ["overview"] };
    case "valuasi": return { mode, label: "Valuasi", sections: ["valuation"] };
  }
}

export function parseFundamental(q: string): FundQuery {
  const s = q.toLowerCase();
  if (/\bsegmen\b|segmentasi|kontribusi pendapatan|revenue breakdown|breakdown pendapatan/.test(s))
    return { mode: "segmen", label: "Segmen pendapatan", sections: [] };
  if (/prospek|proyeksi|forecast|estimasi analis|target harga|konsensus analis|\banalis\b/.test(s))
    return { mode: "prospek", label: "Prospek & estimasi analis", sections: ["future"] };
  if (/direksi|manajemen|eksekutif|komisaris|siapa pengurus|pengurus/.test(s))
    return { mode: "manajemen", label: "Manajemen", sections: ["management"] };
  if (/\bpeer\b|pesaing|kompetitor|sebanding|sekelas|seindustri/.test(s))
    return { mode: "peer", label: "Peer sebanding", sections: ["peers"] };
  if (/tahunan|annual|\btahun\b|historis|laba 5 tahun|kinerja tahunan/.test(s))
    return { mode: "tahunan", label: "Kinerja tahunan", sections: ["financials"] };
  if (/laba|pendapatan|revenue|profit|margin|kinerja|kuartal|quarter|laporan keuangan|ekuitas|\butang\b|\beps\b|earnings/.test(s))
    return { mode: "kinerja", label: "Kinerja kuartalan", sections: [] };
  if (/profil|sekilas|tentang|listing|alamat|karyawan|\besg\b|papan pencatatan|indeks yang masuk/.test(s))
    return { mode: "tentang", label: "Profil perusahaan", sections: ["overview"] };
  return { mode: "valuasi", label: "Valuasi", sections: ["valuation"] };
}

// Format nilai rupiah gaya pasar Indonesia (T = triliun, M = miliar, jt = juta). Live "-" bila null.
export function fmtRp(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const a = Math.abs(v);
  if (a >= 1e12) return `Rp ${Math.round((v / 1e12) * 100) / 100} T`;
  if (a >= 1e9) return `Rp ${Math.round((v / 1e9) * 10) / 10} M`;
  if (a >= 1e6) return `Rp ${Math.round((v / 1e6) * 10) / 10} jt`;
  return `Rp ${Math.round(v)}`;
}

export const fmtNum = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "-" : `${Math.round(v * 10 ** digits) / 10 ** digits}`;

export const fmtRatioPct = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "-" : `${Math.round(v * 1000) / 10}%`;

export const quarterLabel = (date: string): string => {
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return date;
  const q = Math.ceil(Number(m[2]) / 3);
  return `Q${q} ${m[1]}`;
};

export interface ValuationLike {
  forward_pe?: number | null; intrinsic_value?: number | null; last_close_price?: number | null;
  latest_close_date?: string | null;
  historical_valuation?: { year?: number; pe?: number | null; pb?: number | null; ps?: number | null }[] | null;
}
export function latestValuation(v: ValuationLike | undefined): { year?: number; pe: number | null; pb: number | null; ps: number | null } {
  const rows = (v?.historical_valuation ?? []).filter((x) => typeof x?.year === "number").sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const last = rows[0];
  return { year: last?.year, pe: last?.pe ?? null, pb: last?.pb ?? null, ps: last?.ps ?? null };
}