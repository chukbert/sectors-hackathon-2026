// lib/resolve.ts — resolusi ticker universal. Nol whitelist gerbang: token 4-huruf-kapital apa pun = kandidat.
// Daftar simbol hanya menolong input huruf kecil. Tidak ada kandidat → pemanggil WAJIB klarifikasi.
import { NOT_TICKER, isKnownSymbol } from "./symbols.js";

export interface Resolution {
  tickers: string[]; // urut kemunculan; tickers[0] = subjek utama
  source: "pesan" | "portofolio" | "tidak-ada";
  unknown: string[]; // kandidat kapital yang tidak ada di daftar (tetap dipakai, ditandai)
}

const UPPER4 = /\b([A-Z]{4})\b/g;
const LOWER4 = /\b([a-z]{4})\b/g;

/** kandidat ticker dari pesan. uppercase = universal; lowercase = hanya yang ada di daftar simbol. */
export function plausibleTickers(text: string): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    if (!out.includes(t)) out.push(t);
  };
  for (const m of text.matchAll(UPPER4)) {
    const t = m[1]!;
    if (!isKnownSymbol(t) && NOT_TICKER.has(t)) continue;
    push(t);
  }
  for (const m of text.matchAll(LOWER4)) {
    const t = m[1]!.toUpperCase();
    if (!isKnownSymbol(t)) continue;
    if (!out.includes(t)) push(t);
  }
  return out;
}

/** kode broker 2-huruf (mis. "YP"), hanya dari huruf kapital atau setelah kata broker/bandar. */
const BROKER_STOP = new Set(["DI", "KE", "YA", "ID", "PT", "AI", "OK", "NO", "TV", "HP", "WA", "IG", "FB", "RI", "UU", "TH", "AT", "BY", "IN", "ON", "OF", "TO", "VS"]);
export function brokerCodes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b([A-Z]{2})\b/g)) {
    const c = m[1]!;
    if (!BROKER_STOP.has(c) && !out.includes(c)) out.push(c);
  }
  if (!out.length) {
    const m = text.match(/\b(?:broker|bandar)\s+([a-z]{2})\b/i);
    if (m) out.push(m[1]!.toUpperCase());
  }
  return out;
}

export function resolveTickers(text: string, context: { portfolio?: string[]; watchlist?: string[] } = {}): Resolution {
  const fromMsg = plausibleTickers(text);
  if (fromMsg.length)
    return { tickers: fromMsg, source: "pesan", unknown: fromMsg.filter((t) => !isKnownSymbol(t)) };
  const ctx = [...(context.portfolio ?? []), ...(context.watchlist ?? [])].map((t) => t.toUpperCase());
  if (ctx.length) return { tickers: [...new Set(ctx)], source: "portofolio", unknown: [] };
  return { tickers: [], source: "tidak-ada", unknown: [] };
}

export interface PortofolioItem { ticker: string; pct: number }

/** "portofolio saya: BBCA 30% BMRI 20 TLKM" → bobot; yang tanpa bobot dibagi rata dari sisa. */
export function parsePortfolio(text: string): PortofolioItem[] | null {
  if (!/(portofolio|porto)/i.test(text)) return null;
  const tickers = plausibleTickers(text);
  if (tickers.length < 2) return null;
  const raw = tickers.map((t) => {
    const i = text.indexOf(t);
    const tail = text.slice(i + t.length, i + t.length + 14);
    const m = tail.match(/\s*[:=]?\s*(\d{1,3})\s*%?/);
    const pct = m ? Number(m[1]) : undefined;
    return { ticker: t, pct: pct !== undefined && pct > 0 && pct <= 100 ? pct : undefined };
  });
  const known = raw.filter((r) => r.pct !== undefined) as PortofolioItem[];
  const unknown = raw.filter((r) => r.pct === undefined);
  const used = known.reduce((s, r) => s + r.pct, 0);
  const rest = Math.max(0, 100 - used);
  const each = unknown.length ? Math.round((rest / unknown.length) * 10) / 10 : 0;
  const items = [...known, ...unknown.map((u) => ({ ticker: u.ticker, pct: each }))];
  const total = items.reduce((s, r) => s + r.pct, 0) || 1;
  return items.map((r) => ({ ticker: r.ticker, pct: Math.round((r.pct / total) * 1000) / 10 }));
}

export function clarificationText(intent: string, known: string[] = []): string {
  const contoh = known.length ? ` Simpananmu: ${known.slice(0, 6).join(", ")}.` : "";
  const p = {
    rumor: "Contoh: “BRMS mau terbang?”",
    gerak: "Contoh: “kenapa ANTM naik?”",
    dividen: "Contoh: “yield BMRI aman?”",
    likuiditas: "Contoh: “likuiditas BRMS gimana?”",
    risiko: "Contoh: “risiko BUMI apa?”",
    fundamental: "Contoh: “PE ANTM berapa?” atau “laba SMAR gimana?”",
    barang: "Contoh: “coal naik kok ADRO turun?”",
    dna: "Contoh: “broker YP aman?”",
    kalender: "Contoh: “ex-date BMRI kapan?”",
    autopsi: "Contoh: “autopsi portofolio saya” setelah menyimpan daftar (mis. “portofolio saya: BBCA, BMRI, ANTM”)",
    banding: "Contoh: “banding ADRO vs PTBA”",
  }[intent] ?? "Contoh: “kenapa BRMS naik?”";
  return `Ticker belum disebut (atau belum dikenal). Sebut 4 huruf ticker IDX — ARUS tidak menebak supaya kartunya bukan tentang saham lain.${contoh} ${p}`;
}

/** "sebut ticker lain untuk ganti" — dipakai saat subjek datang dari memori, bukan dari pesan. */
export function portfolioSourceNote(source: Resolution["source"]): string | null {
  if (source === "portofolio") return "ticker tidak disebut di pesan → memakai portofolio tersimpan (sebut ticker lain untuk ganti)";
  return null;
}