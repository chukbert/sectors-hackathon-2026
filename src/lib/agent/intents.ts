import type { Domain } from "@/lib/config";
import type { Slots } from "@/lib/agent/types";

export type IntentRecipeStep = {
  endpoint: string;
  args: (ctx: { sym: string | undefined; symbols: string[]; days: number; slots: Slots }) => Record<string, unknown>;
  purpose: string;
  phase: 1 | 2 | 3;
  optional?: boolean;
};

export type IntentDef = {
  id: string;
  domain: Domain;
  label: string;
  criteria: string;
  triggers: string;
  section: string;
  recipe: IntentRecipeStep[];
};

const d = (days: number) => {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
};

export const INTENTS: IntentDef[] = [
  {
    id: "harga",
    triggers: "harga, price, berapa harganya, close, volume, kapitalisasi pasar, market cap, tren harga",
    domain: "harga",
    label: "harga & likuiditas",
    criteria: "asks for current or historical price, daily change, volume, transaction value, market capitalisation, or a price trend of one or more stocks",
    section: "Harga & pergerakan",
    recipe: [
      { endpoint: "daily", args: ({ sym, days }) => ({ symbol: sym, ...d(days) }), purpose: "Harga, volume, market cap", phase: 1 },
    ],
  },
  {
    id: "fundamental",
    triggers: "fundamental, laporan keuangan, laba, rugi, revenue, pendapatan, margin, utang, ekuitas, arus kas, ROE, DER, kinerja keuangan",
    domain: "fundamental",
    label: "fundamental & laporan keuangan",
    criteria: "asks about financial statement health: revenue, profit, margins, debt, equity, cash flow, ROE/ROA/DER, quarterly performance trends",
    section: "Kinerja & fundamental",
    recipe: [
      { endpoint: "report", args: ({ sym }) => ({ symbol: sym, sections: ["overview", "financials"] }), purpose: "Profil & laporan keuangan", phase: 1 },
      { endpoint: "quarterly", args: ({ sym }) => ({ symbol: sym, n_quarters: 8 }), purpose: "Kinerja kuartalan", phase: 2 },
      { endpoint: "segments", args: ({ sym }) => ({ symbol: sym }), purpose: "Segmen pendapatan", phase: 3, optional: true },
    ],
  },
  {
    id: "valuasi",
    triggers: "valuasi, murah, mahal, wajar, PER, PBV, PS, intrinsic, proyeksi, target analis, value trap",
    domain: "valuasi",
    label: "valuasi & skenario",
    criteria: "asks whether a stock is cheap/expensive/fairly valued, PER/PBV/PS/PCF, peer comparison, intrinsic value, analyst forecast, target scenarios",
    section: "Valuasi",
    recipe: [
      { endpoint: "report", args: ({ sym }) => ({ symbol: sym, sections: ["valuation", "future", "peers"] }), purpose: "Valuasi, proyeksi & peers", phase: 1 },
      { endpoint: "quarterly", args: ({ sym }) => ({ symbol: sym, n_quarters: 8 }), purpose: "Kinerja kuartalan pendukung", phase: 2, optional: true },
      { endpoint: "daily", args: ({ sym, days }) => ({ symbol: sym, ...d(days) }), purpose: "Harga terkini", phase: 2, optional: true },
    ],
  },
  {
    id: "dividen",
    triggers: "dividen, dividend, yield, payout, DPS, bagi hasil",
    domain: "dividen",
    label: "dividen",
    criteria: "asks about dividend yield, dividend per share, payout ratio, dividend history or safety of dividend payments",
    section: "Dividen & aksi korporasi",
    recipe: [
      { endpoint: "report", args: ({ sym }) => ({ symbol: sym, sections: ["dividend", "financials"] }), purpose: "Dividen & laba pendukung", phase: 1 },
      { endpoint: "corporate-actions-symbol", args: ({ sym }) => ({ symbol: sym }), purpose: "Riwayat & jadwal dividen emiten", phase: 2 },
    ],
  },
  {
    id: "aksi_korporasi",
    triggers: "aksi korporasi, stock split, bonus, rights issue, warrant, RUPS, jadwal laporan, ex-date, suspensi",
    domain: "kalender",
    label: "aksi korporasi & kalender event",
    criteria: "asks about corporate actions (stock split, bonus, rights issue, warrant, RUPS/AGM) or event calendar (earnings dates, ex-date schedule)",
    section: "Aksi korporasi & jadwal",
    recipe: [
      { endpoint: "corporate-actions-symbol", args: ({ sym }) => ({ symbol: sym }), purpose: "Aksi korporasi emiten", phase: 1, optional: true },
      { endpoint: "corporate-actions", args: () => ({ ...d(30), type: ["dividend"] }), purpose: "Kalender aksi korporasi pasar", phase: 1, optional: true },
      { endpoint: "financial-dates", args: ({ sym }) => ({ symbol: sym }), purpose: "Jadwal laporan kuartalan", phase: 2, optional: true },
      { endpoint: "suspensions", args: ({ sym }) => ({ symbol: sym }), purpose: "Riwayat suspensi", phase: 2, optional: true },
    ],
  },
  {
    id: "bandarmologi",
    triggers: "bandarmologi, bandar, akumulasi, distribusi, broker, net buy, net sell, siapa yang beli",
    domain: "bandarmologi",
    label: "bandarmologi / aktivitas broker",
    criteria: "asks who is accumulating or distributing a stock, broker activity, net buy/sell by brokers, concentration of buying/selling",
    section: "Aliran dana & bandarmologi",
    recipe: [
      { endpoint: "broker-summary-top", args: ({ sym, days }) => ({ symbol: sym, ...d(days) }), purpose: "Top buyer/seller emiten", phase: 1 },
      { endpoint: "brokers", args: () => ({}), purpose: "Registry broker (asing/domestik)", phase: 2 },
      { endpoint: "daily", args: ({ sym, days }) => ({ symbol: sym, ...d(days) }), purpose: "Harga & volume pendukung", phase: 2, optional: true },
    ],
  },
  {
    id: "aliran_asing",
    triggers: "aliran asing, net foreign, inflow, outflow, asing beli/jual, foreign flow",
    domain: "asing",
    label: "aliran dana asing",
    criteria: "asks about foreign investor flows: net foreign buy/sell, foreign inflow/outflow over a period, or market-wide foreign flow for a day",
    section: "Aliran dana asing",
    recipe: [
      { endpoint: "foreign-flow", args: ({ sym, days }) => ({ symbol: sym ?? "IHSG", ...d(days) }), purpose: "Net foreign flow", phase: 1 },
      { endpoint: "foreign-flow-universe", args: ({ days }) => ({ ...d(days), limit: 30 }), purpose: "Peringkat asing pasar", phase: 2, optional: true },
    ],
  },
  {
    id: "kepemilikan",
    triggers: "kepemilikan, pemegang saham, shareholder, struktur pemilik, porsi asing/lokal/institusi, free float, pengendali",
    domain: "asing",
    label: "struktur kepemilikan",
    criteria: "asks about ownership structure: who owns the company, percentage held by foreign/local/institutional/retail investors, controlling shareholder, free float, shareholder composition. NOT about trading flows.",
    section: "Kepemilikan & free float",
    recipe: [
      { endpoint: "shareholders", args: ({ sym }) => ({ symbol: sym }), purpose: "Komposisi pemegang saham (asing/lokal)", phase: 1 },
      { endpoint: "report", args: ({ sym }) => ({ symbol: sym, sections: ["ownership", "overview"] }), purpose: "Struktur kepemilikan & profil", phase: 1, optional: true },
      { endpoint: "free-float", args: ({ sym }) => ({ _symbol: sym }), purpose: "Free float", phase: 2, optional: true },
    ],
  },
  {
    id: "screening",
    triggers: "carikan, cari saham, screening, filter, daftar saham dengan kriteria",
    domain: "screening",
    label: "screening emiten",
    criteria: "asks to find/filter/list stocks matching criteria (cheap valuation, high dividend, large cap, growth, specific sector) rather than analysing one named stock",
    section: "Hasil screening",
    recipe: [
      { endpoint: "screener", args: () => ({}), purpose: "Screening emiten (where/order_by)", phase: 1 },
    ],
  },
  {
    id: "top_movers",
    triggers: "top gainer, top loser, paling naik, paling turun, paling ramai, most traded",
    domain: "screening",
    label: "top movers & most traded",
    criteria: "asks for top gainers/losers, most actively traded stocks, biggest price moves in a period",
    section: "Pergerakan teratas",
    recipe: [
      { endpoint: "top-changes", args: () => ({ classifications: ["top_gainers", "top_losers"], periods: ["1d"], n_stock: 5 }), purpose: "Top gainers/losers", phase: 1 },
      { endpoint: "most-traded", args: ({ days }) => ({ ...d(days), n_stock: 5 }), purpose: "Paling ramai diperdagangkan", phase: 1, optional: true },
    ],
  },
  {
    id: "komoditas",
    triggers: "komoditas, batubara, nikel, emas, tembaga, timah, produksi tambang, izin tambang, cadangan, ekspor",
    domain: "komoditas",
    label: "komoditas & tambang",
    criteria: "asks about commodity prices (coal, nickel, gold, copper, tin), national production, mining licences, resources/reserves, mining company operations or export destinations",
    section: "Komoditas & tambang",
    recipe: [
      { endpoint: "mining-commodities", args: () => ({}), purpose: "Daftar komoditas tersedia", phase: 1, optional: true },
      { endpoint: "mining-price", args: ({ slots }) => ({ commodity_name: slots.commodity ?? "coal", start_year: new Date().getUTCFullYear() - 2, end_year: new Date().getUTCFullYear() }), purpose: "Harga komoditas", phase: 1 },
      { endpoint: "mining-total-production", args: ({ slots }) => ({ commodity_type: commodityEnum(slots.commodity) }), purpose: "Produksi nasional", phase: 2, optional: true },
      { endpoint: "mining-licenses", args: ({ slots }) => ({ commodity_type: commodityEnum(slots.commodity), limit: 5 }), purpose: "Izin tambang & expiry", phase: 3, optional: true },
    ],
  },
  {
    id: "ipo",
    triggers: "IPO, listing, saham baru, gain sejak listing",
    domain: "ipo",
    label: "IPO & performa listing",
    criteria: "asks about IPO performance since listing, gain/loss vs listing price, newly listed stocks",
    section: "IPO & listing",
    recipe: [
      { endpoint: "listing-performance", args: ({ sym }) => ({ symbol: sym }), purpose: "Performa sejak listing", phase: 1, optional: true },
      { endpoint: "quarterly-dates-universe", args: () => ({ limit: 20 }), purpose: "Emiten dengan laporan terbaru", phase: 2, optional: true },
    ],
  },
  {
    id: "berita",
    triggers: "berita, news, sentimen, headline, kabar terbaru",
    domain: "klaim",
    label: "berita & sentimen",
    criteria: "asks for latest news, headlines, or general sentiment around a company or sector",
    section: "Berita & filings",
    recipe: [
      { endpoint: "news", args: ({ sym }) => ({ symbols: sym, ...d(30), limit: 8 }), purpose: "Berita terbaru", phase: 1 },
      { endpoint: "filings", args: ({ sym }) => ({ symbol: sym, ...d(30), limit: 10 }), purpose: "Filings insider", phase: 2, optional: true },
    ],
  },
  {
    id: "verifikasi_klaim",
    triggers: "katanya, kabarnya, benar gak, rumor, hoax, cek fakta, minta rekomendasi beli/jual",
    domain: "klaim",
    label: "verifikasi klaim/rumor",
    criteria: "user carries a claim, rumour or promise about a stock (will rise, is being pumped, guaranteed profit) and wants it checked against data, or asks for a buy/sell recommendation",
    section: "Verifikasi klaim",
    recipe: [
      { endpoint: "news", args: ({ sym }) => ({ symbols: sym, ...d(60), limit: 8 }), purpose: "Berita pendukung/penyanggah", phase: 1 },
      { endpoint: "filings", args: ({ sym }) => ({ symbol: sym, ...d(60), limit: 10 }), purpose: "Filings insider", phase: 1 },
      { endpoint: "suspensions", args: ({ sym }) => ({ symbol: sym }), purpose: "Riwayat suspensi", phase: 1, optional: true },
      { endpoint: "report", args: ({ sym }) => ({ symbol: sym, sections: ["valuation", "financials"] }), purpose: "Valuasi & fundamental", phase: 2 },
      { endpoint: "daily", args: ({ sym, days }) => ({ symbol: sym, ...d(days) }), purpose: "Harga terkini", phase: 2 },
      { endpoint: "broker-summary-top", args: ({ sym, days }) => ({ symbol: sym, ...d(days) }), purpose: "Siapa akumulasi/distribusi", phase: 3, optional: true },
    ],
  },
  {
    id: "tag",
    triggers: "tag, klasifikasi, indeks keanggotaan, papan listing, sektor industri",
    domain: "tag",
    label: "tag & klasifikasi",
    criteria: "asks about classification tags, indices membership, listing board, sector/industry classification of a stock, or wants stocks filtered by tags",
    section: "Tag & klasifikasi",
    recipe: [
      { endpoint: "report", args: ({ sym }) => ({ symbol: sym, sections: ["overview"] }), purpose: "Profil, sektor & tag", phase: 1, optional: true },
      { endpoint: "tags", args: () => ({}), purpose: "Daftar tag tersedia", phase: 2, optional: true },
    ],
  },
  {
    id: "sektor_indeks",
    triggers: "IHSG, LQ45, indeks, sektor, subsektor, rotasi sektor, kapitalisasi pasar IDX",
    domain: "sektor",
    label: "sektor, indeks & rotasi",
    criteria: "asks about index levels/moves (IHSG, LQ45), total market capitalisation, subsector strength/rotation, or which sector is strong",
    section: "Sektor & indeks",
    recipe: [
      { endpoint: "index-daily", args: ({ slots, days }) => ({ index_code: slots.indexCode ?? "ihsg", ...d(days) }), purpose: "Level & pergerakan indeks", phase: 1 },
      { endpoint: "idx-total", args: ({ days }) => ({ ...d(days) }), purpose: "Kapitalisasi pasar IDX", phase: 2, optional: true },
      { endpoint: "subsector-report", args: () => ({ sub_sector: "banks", sections: ["statistics", "valuation"] }), purpose: "Konteks subsektor", phase: 3, optional: true },
    ],
  },
  {
    id: "pasar_umum",
    triggers: "pasar hari ini, bagaimana pasar, ringkasan pasar",
    domain: "sektor",
    label: "ringkasan pasar umum",
    criteria: "asks a general market question without a specific stock, sector or data type (how is the market, what is happening today)",
    section: "Ringkasan pasar",
    recipe: [
      { endpoint: "most-traded", args: ({ days }) => ({ ...d(days), n_stock: 5 }), purpose: "Saham paling ramai", phase: 1 },
      { endpoint: "top-changes", args: () => ({ classifications: ["top_gainers"], periods: ["1d"], n_stock: 5 }), purpose: "Top gainers harian", phase: 1, optional: true },
      { endpoint: "idx-total", args: ({ days }) => ({ ...d(days) }), purpose: "Kapitalisasi pasar IDX", phase: 2, optional: true },
    ],
  },
];

export const INTENT_BY_ID = new Map(INTENTS.map((i) => [i.id, i]));

export function commodityEnum(slug: string | null): string {
  switch (slug) {
    case "coal":
      return "Coal";
    case "nickel":
      return "Nickel";
    case "gold":
      return "Gold";
    case "copper":
      return "Copper";
    case "tin":
      return "Tin";
    case "silver":
      return "Silver";
    case "bauxite":
      return "Bauxite";
    default:
      return "Coal";
  }
}

export function intentQuestions(): Record<string, { type: "noul"; instructions: string }> {
  const questions: Record<string, { type: "noul"; instructions: string }> = {};
  for (const intent of INTENTS) {
    questions[`intent_${intent.id}`] = {
      type: "noul",
      instructions: `The user's question requires this kind of data or analysis: ${intent.criteria}. Typical trigger words (Indonesian): ${intent.triggers}. If the question explicitly asks for this topic, answer true; if the topic is only mentioned in passing while another topic is the actual request, answer false. Judge independently from the other intent questions — several intents can be true at once.`,
    };
  }
  return questions;
}