// lib/router.ts — routing intent deterministik (keyword). LLM planner opsional di atasnya.
// ATURAN: router TIDAK memilih emiten. Ticker datang dari resolve.ts; tanpa ticker → klarifikasi/komoditas/screener.
import { parseScreen } from "./screener.js";
export type Intent =
  | "pasar" | "rumor" | "kenapa-gerak" | "barang" | "dna" | "kuasa" | "kalender" | "dividen"
  | "likuiditas" | "autopsi" | "banding" | "pagi" | "risiko" | "screener" | "fundamental" | "obrolan";

export const NEEDS_TICKER: Intent[] = ["rumor", "kenapa-gerak", "dividen", "likuiditas", "risiko", "fundamental"];

// Pertanyaan fundamental emiten (valuasi/laba/manajemen/segmen) — butuh subjek ticker.
const FUNDAMENTAL = /fundamental|valuasi|valuation|\bpe\b|\bpb\b|\broe\b|\bder\b|\beps\b|\bmurah\b|\bmahal\b|margin|laba|pendapatan|revenue|profit|ekuitas|\butang\b|kinerja|kuartal|quarter|laporan keuangan|\bsegmen\b|segmentasi|prospek|\banalis\b|siapa (pengurus|direksi|manajemen|komisaris)|susunan (direksi|pengurus)|\bmanajemen\b|\bpeer\b|pesaing|kompetitor|sebanding|tahunan|historis|profil|sekilas/;

export function route(q: string, tickers: string[]): Intent {
  const s = q.toLowerCase();
  if (/autopsi|bedah|portofolio|porto|diversif|sebaran/.test(s)) return "autopsi";
  if (/(banding|bandingkan|dibanding|komparasi|\bvs\b)/.test(s) && tickers.length >= 2) return "banding";
  if (/scan pagi|anomali|brief|pagi ini|sebelum buka/.test(s)) return "pagi";
  // Kata umum 4 huruf yang kebetulan ticker (mis. "bank" → BANK) tidak boleh membajak pertanyaan screener.
  // Ticker dianggap niat user hanya bila ditulis kapital (mis. "BANK"), selain itu kata biasa.
  if (parseScreen(q) && (tickers.length === 0 || !tickers.some((t) => q.includes(t)))) return "screener";
  if (tickers.length && FUNDAMENTAL.test(s)) return "fundamental";
  if (/coal|batubara|batu bara|nikel|nickel|tambang|komoditas|mining|smelter/.test(s)) return "barang";
  if (/broker|bandar/.test(s)) return "dna";
  if (/insider|direksi|komisaris|cluster|rights issue|right issue|rights/.test(s)) return "kuasa";
  if (/ex-?date|ex date|agm|rups|stock split|reverse stock|warrant/.test(s)) return "kalender";
  if (/yield|dividen|dividend|trap|payout/.test(s)) return "dividen";
  if (/likuid|volume|free float|float/.test(s)) return "likuiditas";
  if (/pompom|mau ke|katanya|betul\?|diserok|bakal terbang|terbang/.test(s)) return "rumor";
  if (/risiko|panik|anjlok|nyangkut|merah|takut/.test(s)) return "risiko";
  if (/pasar|ihsg|market|indeks|index/.test(s) && tickers.length === 0) return "pasar";
  if (tickers.length) return "kenapa-gerak";
  return "obrolan";
}

export function requiresTicker(intent: Intent): boolean {
  return NEEDS_TICKER.includes(intent);
}