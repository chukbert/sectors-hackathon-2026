import { chatJson } from "@/lib/llm/openrouter";
import type { Slots } from "@/lib/agent/types";
import { listMemory, putMemory } from "@/lib/db/session-store";

const ALIASES: Record<string, string> = {
  bca: "BBCA",
  bri: "BBRI",
  mandiri: "BMRI",
  bni: "BBNI",
  telkom: "TLKM",
  "telkom indonesia": "TLKM",
  goto: "GOTO",
  gojek: "GOTO",
  tokopedia: "GOTO",
  bukit: "PTBA",
  "bukit asam": "PTBA",
  adaro: "ADRO",
  alamtri: "ADRO",
  aneka: "ANTM",
  "aneka tambang": "ANTM",
  antam: "ANTM",
  inalum: "ANTM",
  freeport: "MDKA",
  merdeka: "MDKA",
  "merdeka copper": "MDKA",
  vale: "INCO",
  "vale indonesia": "INCO",
  timah: "TINS",
  "bank syariah": "BRIS",
  bsi: "BRIS",
  unilever: "UNVR",
  indofood: "INDF",
  "icbp": "ICBP",
  indomie: "ICBP",
  "gudang garam": "GGRM",
  "hm sampoerna": "HMSP",
  sampoerna: "HMSP",
  astra: "ASII",
  "astra international": "ASII",
  "bank jago": "ARTO",
  jago: "ARTO",
  "bank bjb": "BJBR",
  bjb: "BJBR",
  "bank bca": "BBCA",
  "bank mandiri": "BMRI",
  "bank bri": "BBRI",
  "bank bni": "BBNI",
  bumi: "BUMI",
  "bumi resources": "BUMI",
  "bumi resources minerals": "BRMS",
  brms: "BRMS",
  "barito renewables": "BREN",
  bren: "BREN",
  "barito pacific": "BRPT",
  brpt: "BRPT",
  "sumber alfaria": "AMRT",
  alfamart: "AMRT",
  "map aktif": "MAPI",
  "ace hardware": "ACES",
  aces: "ACES",
  "sido muncul": "SIDO",
  sido: "SIDO",
  kalbe: "KLBF",
  "mayora": "MYOR",
  "indah kiat": "INKP",
  "pabrik kertas": "INKP",
  "semen indonesia": "SMGR",
  semen: "SMGR",
  "indocement": "INTP",
  "petrokimia": "BRPT",
  "chandra asri": "TPIA",
  tpia: "TPIA",
  "pertamina": "PGAS",
  pgas: "PGAS",
  "perusahaan gas": "PGAS",
  medco: "MEDC",
  elsa: "ELSA",
  waskita: "WSKT",
  "wijaya karya": "WIKA",
  "jasa marga": "JSMR",
  "bank panin": "PNBN",
  panin: "PNBN",
  "bank danamon": "BDMN",
  "bank permata": "BNLI",
  "bank mega": "MEGA",
  mega: "MEGA",
  bmtr: "BMTR",
  "global mediacom": "BMTR",
  "mnc": "BHIT",
  "emtek": "EMTK",
  emtk: "EMTK",
  "surya citra": "SCMA",
  scma: "SCMA",
  "net tv": "NETV",
  "bank ocbc": "NISP",
  nisp: "NISP",
  "bank maybank": "BNII",
  bnii: "BNII",
  "central asia": "BBCA",
  "raja raja": "RAJA",
  "raja": "RAJA",
  "perusahaan listrik": "PGEO",
  pgeo: "PGEO",
  "barito": "BREN",
};

const INDEXES: Record<string, string> = {
  ihsg: "ihsg",
  "i h s g": "ihsg",
  lq45: "lq45",
  idx30: "idx30",
  idxbumn20: "idxbumn20",
  "bumn20": "idxbumn20",
  idxhidiv20: "idxhidiv20",
  kompas100: "kompas100",
  jii70: "jii70",
  sminfra18: "sminfra18",
  srikehati: "srikehati",
  idxesgl: "idxesgl",
  economic30: "economic30",
  idxvesta28: "idxvesta28",
  sti: "sti",
  ftse: "ftse",
};

const COMMODITIES: Record<string, string> = {
  batubara: "coal",
  "batu bara": "coal",
  coal: "coal",
  nikel: "nickel",
  nickel: "nickel",
  emas: "gold",
  gold: "gold",
  tembaga: "copper",
  copper: "copper",
  perak: "silver",
  silver: "silver",
  timah: "tin",
  tin: "tin",
  bauksit: "bauxite",
  bauxite: "bauxite",
  seng: "zinc",
  "zinc and lead": "zinc",
};

const RUMOR_PATTERNS = [/katanya/i, /kabarnya/i, /isunya/i, /benar\s*(gak|ga|tidak|nggak|engga)/i, /hoax/i, /beneran/i, /serius(an)?\?/i, /mau\s+(terbang|naik)/i, /auto\s*cuan/i, /pasti\s+(naik|cuank?)/i, /gaskeun/i, /goreng/i];
const ADVICE_PATTERNS = [/harus\s+(beli|jual)/i, /sebaiknya\s+(beli|jual)/i, /rekomendasi(kan)?\s+(beli|jual|saham)/i, /kasih\s+(saran|rekomendasi)/i, /(beli|jual)\s*(gak|ga|nggak|tidak)?\s*(sekarang|hari ini)/i, /target\s+harga\s+saya/i, /ikut\s+(beli|jual)/i, /bagus\s+gak\s+buat\s+(beli|jual)/i, /layak\s+(beli|jual)/i];

export function extractWithRules(question: string): Slots {
  const text = question.toLowerCase();
  const symbols = new Set<string>();
  for (const [alias, ticker] of Object.entries(ALIASES)) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) symbols.add(ticker);
  }
  const upperMatches = question.match(/\b[A-Z]{4}\b/g) ?? [];
  for (const m of upperMatches) symbols.add(m.toUpperCase());
  const lowerTickers = question.match(/\b(bbca|bbri|bmri|bbni|tlkm|goto|antm|adro|ptba|brms|bren|inco|asii|icbp|indf|unvr|hmad|hmsp|ggrm|arto|amrt|mapi|aces|sido|klbf|myor|inkp|smgr|intp|tpia|pgas|medc|elsa|wskr|wika|jsmr|pnbn|bdmn|mega|bmtr|emtk|scma|raja|pgeo|tins|mdka)\b/gi) ?? [];
  for (const m of lowerTickers) symbols.add(m.toUpperCase());
  const fromMemory: string[] = [];
  if (symbols.size === 0) {
    const mem = listMemory().filter((m) => m.kind === "fact" && m.key === "symbol").slice(0, 3);
    for (const item of mem) fromMemory.push(String(item.value));
  }
  let indexCode: string | null = null;
  for (const [name, code] of Object.entries(INDEXES)) {
    if (text.includes(name)) {
      indexCode = code;
      break;
    }
  }
  let commodity: string | null = null;
  for (const [name, slug] of Object.entries(COMMODITIES)) {
    if (text.includes(name)) {
      commodity = slug;
      break;
    }
  }
  const periodMatch = text.match(/(\d+)\s*(hari|day|d)/);
  const monthMatch = text.match(/(\d+)\s*(bulan|month|mo)/);
  const yearMatch = text.match(/(\d+)\s*(tahun|year|y)/);
  const periodDays = periodMatch ? Number(periodMatch[1]) : monthMatch ? Number(monthMatch[1]) * 30 : yearMatch ? Number(yearMatch[1]) * 365 : null;
  const sectorTerms = ["bank", "perbankan", "energi", "tambang", "pertambangan", "teknologi", "consumer", "konsumer", "properti", "kesehatan", "infrastruktur", "telekomunikasi", "transportasi", "industri", "keuangan", "rokok", "semen", "ritel", "media", "pariwisata", "agrikultur", "metal", "logam", "minyak", "gas", "otomotif", "tekstil"];
  const sectorText = sectorTerms.find((s) => text.includes(s)) ?? null;
  return {
    symbols: Array.from(symbols),
    symbolsFromMemory: symbols.size === 0 && fromMemory.length > 0,
    indexCode,
    sectorText,
    periodDays,
    isRumor: RUMOR_PATTERNS.some((r) => r.test(text)),
    wantsAdvice: ADVICE_PATTERNS.some((r) => r.test(text)),
    isComparison: /\bvs\b|banding|dibanding|versus|lebih baik|mana yang/i.test(text),
    commodity,
  };
}

export async function extractSlots(question: string): Promise<Slots> {
  const rules = extractWithRules(question);
  if (rules.symbols.length > 0 || rules.indexCode || rules.commodity) return rules;
  try {
    const { data } = await chatJson<{ symbols: string[]; index_code: string | null; commodity: string | null; sector: string | null; period_days: number | null }>(
      "You extract stock entities from Indonesian investor questions. Reply ONLY JSON. Ticker format: 4 uppercase letters (IDX). If none, empty array.",
      `Question: "${question}"\n\nJSON schema: {"symbols": string[], "index_code": string|null, "commodity": string|null, "sector": string|null, "period_days": number|null}`,
      { temperature: 0, maxTokens: 200 },
    );
    const mem = listMemory().filter((m) => m.kind === "fact" && m.key === "symbol");
    const symbols = data.symbols.map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{4}$/.test(s));
    return {
      ...rules,
      symbols: symbols.length ? symbols : mem.slice(0, 2).map((m) => String(m.value)),
      symbolsFromMemory: symbols.length === 0 && mem.length > 0,
      indexCode: data.index_code ?? rules.indexCode,
      commodity: data.commodity ?? rules.commodity,
      sectorText: data.sector ?? rules.sectorText,
      periodDays: data.period_days ?? rules.periodDays,
    };
  } catch {
    const mem = listMemory().filter((m) => m.kind === "fact" && m.key === "symbol");
    return { ...rules, symbols: mem.slice(0, 2).map((m) => String(m.value)), symbolsFromMemory: mem.length > 0 };
  }
}

export function rememberSymbol(symbol: string, provenance: string): void {
  putMemory({
    scope: "global",
    kind: "fact",
    entity: symbol,
    key: "symbol",
    value: symbol,
    provenance,
    confidence: 0.9,
    expiresAt: null,
  });
}