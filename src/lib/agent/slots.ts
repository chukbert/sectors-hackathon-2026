import { chatStructured } from "@/lib/llm/openrouter";
import { z } from "zod";
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

const NAME_STOPWORDS = new Set([
  "berapa", "seberapa", "harga", "saham", "emiten", "kapitalisasi", "pasar", "sekarang", "kemarin", "hari", "ini", "itu", "yang", "apa", "apa saja", "dan", "atau",
  "bagaimana", "kenapa", "mengapa", "apakah", "tolong", "coba", "cek", "lihat", "tampilkan", "berita", "berita terbaru", "fundamental", "valuasi",
  "dividen", "tren", "perkembangan", "prospek", "bandarmologi", "asing", "broker", "laporan", "keuangan", "kinerja", "analisis", "data", "info",
  "kapan", "siapa", "mana", "bulan", "tahun", "hari ini", "minggu", "kuartal", "perusahaan", "grup", "group", "tbk", "indonesia", "jakarta",
  "carikan", "cari", "carilah", "bandingkan", "sebutkan", "rekomendasikan", "tentukan", "pilih", "hitung", "jelaskan", "cari tahu",
]);

function findUnresolvedNames(question: string, resolved: Set<string>, resolvedNames: Set<string>): string[] {
  const candidates: string[] = [];
  for (const match of question.matchAll(/(?:^|[^\w])([A-Z][a-zA-Z]{3,})/g)) {
    const word = match[1];
    const lower = word.toLowerCase();
    if (resolved.has(word.toUpperCase())) continue;
    if (resolvedNames.has(lower)) continue;
    if (/^[A-Z]{4}$/.test(word)) continue;
    if (NAME_STOPWORDS.has(lower)) continue;
    candidates.push(word);
  }
  return [...new Set(candidates)].slice(0, 3);
}

export function extractWithRules(question: string): Slots {
  const text = question.toLowerCase();
  const symbols = new Set<string>();
  const resolvedNames = new Set<string>();
  for (const [alias, ticker] of Object.entries(ALIASES)) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
      symbols.add(ticker);
      resolvedNames.add(alias.toLowerCase());
    }
  }
  const upperMatches = question.match(/\b[A-Z]{4}\b/g) ?? [];
  for (const m of upperMatches) symbols.add(m.toUpperCase());
  const lowerTickers = question.match(/\b(bbca|bbri|bmri|bbni|tlkm|goto|antm|adro|ptba|brms|bren|inco|asii|icbp|indf|unvr|hmad|hmsp|ggrm|arto|amrt|mapi|aces|sido|klbf|myor|inkp|smgr|intp|tpia|pgas|medc|elsa|wskr|wika|jsmr|pnbn|bdmn|mega|bmtr|emtk|scma|raja|pgeo|tins|mdka)\b/gi) ?? [];
  for (const m of lowerTickers) symbols.add(m.toUpperCase());
  const followUpLike = isFollowUp(question, symbols.size > 0);
  const fromMemory: string[] = [];
  if (followUpLike) {
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
  const sectorTerms = ["bank", "perbankan", "energi", "tambang", "pertambangan", "teknologi", "consumer", "konsumer", "properti", "kesehatan", "infrastruktur", "telekomunikasi", "transportasi", "industri", "keuangan", "rokok", "semen", "ritel", "media", "pariwisata", "agrikultur", "metal", "logam", "minyak", "gas", "otomotif", "tekstil", "perkebunan", "sawit", "pertanian", "agro"];
  const sectorText = sectorTerms.find((s) => text.includes(s)) ?? null;
  const unresolved = findUnresolvedNames(question, symbols, resolvedNames);
  return {
    symbols: Array.from(symbols),
    unresolved,
    symbolsFromMemory: symbols.size === 0 && fromMemory.length > 0,
    indexCode,
    sectorText,
    periodDays,
    isRumor: RUMOR_PATTERNS.some((r) => r.test(text)),
    wantsAdvice: ADVICE_PATTERNS.some((r) => r.test(text)),
    isComparison: /\bvs\b|banding|dibanding|versus|lebih baik|mana yang/i.test(text),
    commodity,
    sectorPredicate: null,
  };
}

const slotsSchema = z.strictObject({
  symbols: z.array(z.string()),
  index_code: z.string().nullable(),
  commodity: z.string().nullable(),
  sector: z.string().nullable(),
  period_days: z.number().nullable(),
  is_rumor: z.boolean(),
  wants_advice: z.boolean(),
  is_comparison: z.boolean(),
  sector_predicate: z.string().nullable(),
});

const PREDICATE_SHAPE = /^(sector|sub_sector|industry)\s*=\s*'[A-Za-z0-9_\-]+'$/;

export function isValidSectorPredicate(predicate: string | null | undefined): predicate is string {
  return typeof predicate === "string" && PREDICATE_SHAPE.test(predicate.trim());
}

const INDEX_CODES = new Set(Object.values(INDEXES));
const COMMODITY_SLUGS = new Set(Object.values(COMMODITIES));

const SLOT_SYSTEM = `You extract structured slots from Indonesian stock-market questions about the IDX (Bursa Efek Indonesia).
- symbols: IDX tickers, exactly 4 uppercase letters. Resolve company names, brands and nicknames to their ticker (e.g. "BCA"/"bank biru"→BBCA, "Mandiri"→BMRI, "BRI"→BBRI, "Telkom"→TLKM, "Antam"→ANTM, "Astra"→ASII, "Indomie"→ICBP, "Alfamart"→AMRT, "Bukit Asam"→PTBA, "Freeport"→MDKA, "Vale"→INCO, "Gojek"/"Tokopedia"→GOTO, "Unilever"→UNVR, "Sido Muncul"→SIDO, "Wijaya Karya"→WIKA). Only include a ticker you are confident is IDX-listed; use [] for generic market/sector/screening questions.
- index_code: one of ${[...INDEX_CODES].join(", ")} — else null.
- commodity: one of ${[...COMMODITY_SLUGS].join(", ")} — else null.
- sector: one Indonesian sector keyword if mentioned (bank, energi, tambang, teknologi, consumer, properti, kesehatan, infrastruktur, telekomunikasi, transportasi, pertanian, perkebunan) — else null.
- period_days: implied lookback window in days ("kemarin"/"hari ini"=1, "seminggu"=7, "2 minggu"=14, "sebulan"=30, "3 bulan"=90, "6 bulan"=180, "setahun"=365, "2 tahun"=730) — else null.
- is_rumor: true if the user quotes or asks to verify a claim/rumour ("katanya", "benar gak", "auto cuan", promises of a pump).
- wants_advice: true if the user asks for a buy/sell recommendation or personal price target.
- is_comparison: true if comparing two or more stocks or asking "mana yang lebih ...".
- sector_predicate: a Sectors screener filter for the mentioned sector, EXACTLY in the form "sub_sector = 'banks'" or "industry = 'agricultural-products'" or "sector = 'finance'". Known mappings: bank/perbankan→sub_sector = 'banks', sawit/perkebunan/CPO/pertanian→industry = 'agricultural-products'. Use null if no sector is mentioned or you are unsure of the exact slug. NEVER invent slug values.
- symbols: if the user asks to FIND or IDENTIFY companies ("siapa mereka", "cari saham yang ...", "saham apa", "emiten mana") WITHOUT naming any company, symbols MUST be []. NEVER invent tickers for a discovery question.`;

export async function extractSlots(question: string): Promise<Slots> {
  const rules = extractWithRules(question);
  try {
    const { data } = await chatStructured("slots", slotsSchema, SLOT_SYSTEM, `Question: "${question}"`, {
      temperature: 0,
      maxTokens: 500,
      effort: "minimal",
    });
    const symbols = [...new Set(data.symbols.map((s) => s.toUpperCase().trim()).filter((s) => /^[A-Z]{4}$/.test(s)))].slice(0, 6);
    const followUpLike = isFollowUp(question, symbols.length > 0);
    // Guard discovery: pertanyaan "cari/siapa" tanpa nama eksplisit tidak boleh membawa
    // simbol karangan LLM MAUPUN simbol basi dari memory sesi lama.
    const discoveryNoEntity = isDiscoveryQuestion(question) && rules.symbols.length === 0;
    const memoryAllowed = followUpLike && !discoveryNoEntity;
    const mem = memoryAllowed ? listMemory().filter((m) => m.kind === "fact" && m.key === "symbol") : [];
    const finalSymbols = discoveryNoEntity ? [] : symbols.length ? symbols : mem.slice(0, 2).map((m) => String(m.value));
    const indexCode = data.index_code && INDEX_CODES.has(data.index_code.toLowerCase()) ? data.index_code.toLowerCase() : rules.indexCode;
    const commodity = data.commodity && COMMODITY_SLUGS.has(data.commodity.toLowerCase()) ? data.commodity.toLowerCase() : rules.commodity;
    return {
      symbols: finalSymbols,
      unresolved: memoryAllowed && finalSymbols.length === 0 ? [] : rules.unresolved,
      symbolsFromMemory: finalSymbols.length === 0 && mem.length > 0,
      indexCode,
      sectorText: data.sector ?? rules.sectorText,
      periodDays: data.period_days ?? rules.periodDays,
      isRumor: data.is_rumor || rules.isRumor,
      wantsAdvice: data.wants_advice || rules.wantsAdvice,
      isComparison: data.is_comparison || rules.isComparison,
      commodity,
      sectorPredicate: isValidSectorPredicate(data.sector_predicate) ? data.sector_predicate.trim() : null,
    };
  } catch {
    const memoryAllowed = isFollowUp(question, rules.symbols.length > 0) && !(isDiscoveryQuestion(question) && rules.symbols.length === 0);
    const mem = memoryAllowed ? listMemory().filter((m) => m.kind === "fact" && m.key === "symbol") : [];
    return { ...rules, symbols: rules.symbols.length ? rules.symbols : mem.slice(0, 2).map((m) => String(m.value)), symbolsFromMemory: rules.symbols.length === 0 && mem.length > 0 };
  }
}

export function isFollowUp(question: string, hasExplicitSymbols: boolean): boolean {
  if (hasExplicitSymbols) return false;
  return question.length < 48 || /\b(nya|itu|tadi|lagi|kalau|gimana dengan|bagaimana dengan|lanjut)\b/i.test(question);
}

const DISCOVERY_PATTERNS = [/cari(k(an|lah))?\s+saham/i, /saham (apa|saja|yang|mana)/i, /emiten (apa|mana|yang)/i, /\bsiapa\b.*(mereka|itu|saja)/i, /daftar saham/i, /ada saham/i];

export function isDiscoveryQuestion(question: string): boolean {
  return DISCOVERY_PATTERNS.some((p) => p.test(question));
}

export function looksFinancial(question: string): boolean {
  return /saham|emiten|ticker|harga|dividen|yield|laba|pendapatan|revenue|ekuitas|hutang|utang|margin|arus kas|fundamental|valuasi|per\b|pbv|pe\b|roe|der|broker|bandar|asing|foreign|akumulasi|distribusi|ipo|listing|suspensi|indeks|ihsg|lq45|kuartal|laporan|berita|tren|komoditas|batubara|nikel|emas|tembaga|tambang|sektor|subsektor|mayoritas|pemegang|kapitalisasi|volume|transaksi|gainer|loser|prospek|proyeksi|analis/i.test(question);
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