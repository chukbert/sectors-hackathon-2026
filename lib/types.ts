// Kontrak bersama: pipeline ↔ frontend. Semua angka yang sampai ke user wajib lewat
// jalur deterministik (lib/flow, lib/graph, lib/fomo) atau tool JSON (diverifikasi lib/ground).

export type PillarId = "mover" | "katalis" | "flow" | "grup" | "fundamental";
export type Intent = "kenapa-gerak" | "evaluasi-beli" | "autopsi-portofolio" | "pagi" | "risiko" | "obrolan";

export interface GraphNode {
  id: string;            // ticker atau id hub
  label?: string;        // nama grup utk hub
  hub?: 1;               // simpul pengendali/induk
  group: number;         // indeks grup (0..n-1) atau -1 independen
  w?: number;            // % portofolio
  me?: 1;                // ada di portofolio/tanya user
  flag?: 1;              // ticker yang ditanyakan
}
export interface GraphPayload { nodes: GraphNode[]; links: [string, string][] }

export interface FlowDay { d: string; retail: number; institusi: number } // Rp juta, net
export interface FlowIndex {
  ticker: string;
  window: string;        // mis. "2026-09-08..2026-09-15"
  retail_net_m: number;
  institusi_net_m: number;
  asing_net_m: number;
  days: FlowDay[];
  retail_streak: number;    // hari beruntun ritel net-buy
  asing_sell_streak: number;
  distribusi_ritel: boolean; // harga naik + asing/institusi jual + ritel beli
  insider_sold: boolean;     // filing direktur/komut jual → ⚑ merah
  top_buyers: { code: string; name: string; net_m: number }[];
  top_sellers: { code: string; name: string; net_m: number }[];
}

export interface FomoMeter {
  score: number;         // 0-100
  label: string;         // dingin|mendekati panas|panas|sangat panas
  components: { label: string; value: string; bad?: boolean }[];
  raw?: { ret7: number; ret30: number; volz: number; dev_sma20: number; vol_mult: number };
}

export interface KartuPillar { id: PillarId; ic: string; label: string; title: string; ok?: boolean; bullets: string[] }

export interface Kartu {
  ticker: string;
  company: string;
  price: number;
  change_pct: number;    // 7d
  vol_mult: number;      // volume / rata-rata 30d
  fomo: FomoMeter;
  pillars: KartuPillar[];
  flow?: FlowIndex;
  graph?: GraphPayload;
  bantah: { user_case: string; rebuttal: string };
  question: string;      // pertanyaan yang dikembalikan ARUS
  flags: string[];
  memory?: { title: string; bullets: string[]; reflection: string };
  stamp: string;         // waktu data, mis. "17 Sep 08:41 WIB"
}

export interface GroupRow { name: string; tickers: string[]; pct: number; note: string }
export interface AutopsiKartu {
  group_score: number;   // 0-100, tinggi = ilusi diversifikasi parah
  headline: string;      // "43% nilaimu dipegang 2 grup"
  groups: GroupRow[];
  graph: GraphPayload;
  bullets: string[];
}

// peristiwa stream /api/chat (NDJSON satu objek per baris)
export type ChatEvent =
  | { type: "trace"; line: string; ok?: boolean; ms?: number; cached?: boolean }
  | { type: "kartu"; kartu: Kartu }
  | { type: "autopsi"; autopsi: AutopsiKartu }
  | { type: "pagi"; brief: { jam: string; date?: string; scanned: number; entries: { ticker: string; delta: number; one: string; sev: string; body: string; counter: string }[] } }
  | { type: "teks"; text: string }
  | { type: "error"; text: string };
