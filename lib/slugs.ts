// lib/slugs.ts — mapping slug tambang ↔ symbol IDX. Tanpa mapping → klarifikasi, 0 kredit.
const SLUG_TO_SYMBOL: Record<string, string> = {
  adaro: "ADRO",
  "adaro-energy": "ADRO",
  antam: "ANTM",
  aneka: "ANTM",
  brms: "BRMS",
  "bumi-resources-minerals": "BRMS",
  bumi: "BUMI",
  ptba: "PTBA",
  "bukit-asam": "PTBA",
  untr: "UNTR",
  "united-tractors": "UNTR",
  inco: "INCO",
  vale: "INCO",
  itmg: "ITMG",
  "indo-tambangraya": "ITMG",
  coal: "COAL",
  batubara: "COAL",
  nickel: "NICKEL",
  nikel: "NICKEL",
  gold: "GOLD",
  copper: "COPPER",
  tin: "TIN",
};

const SYMBOL_TO_SLUG: Record<string, string> = {
  ADRO: "adaro",
  ANTM: "antam",
  BRMS: "brms",
  BUMI: "bumi",
  PTBA: "ptba",
  UNTR: "united-tractors",
  INCO: "vale",
  ITMG: "indo-tambangraya",
};

export function resolveSlug(input: string): { symbol: string; slug: string } | null {
  const key = input.trim().toLowerCase();
  if (SLUG_TO_SYMBOL[key]) {
    const symbol = SLUG_TO_SYMBOL[key];
    return { symbol, slug: key };
  }
  const upper = input.trim().toUpperCase();
  if (SYMBOL_TO_SLUG[upper]) return { symbol: upper, slug: SYMBOL_TO_SLUG[upper] };
  return null;
}

export function needClarification(input: string) {
  return `Slug/simbol "${input}" tidak dikenal. Pilih salah satu: ADRO, ANTM, BRMS, PTBA, UNTR (0 kredit, tidak menebak).`;
}

// Slug mining-company Sectors per simbol (untuk sales-destination/performance).
const MINING_SLUG: Record<string, string> = {
  ADRO: "pt-alamtri-resources-indonesia-tbk",
  ANTM: "pt-aneka-tambang-tbk",
  BRMS: "pt-bumi-resources-minerals-tbk",
  BUMI: "pt-bumi-resources-tbk",
  PTBA: "pt-bukit-asam-tbk",
  UNTR: "pt-united-tractors-tbk",
  INCO: "pt-vale-indonesia",
  ITMG: "pt-indo-tambangraya-megah-tbk",
};

export function miningSlug(symbol: string): string | null {
  return MINING_SLUG[symbol.toUpperCase()] ?? null;
}
