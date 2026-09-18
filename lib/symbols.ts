// lib/symbols.ts — DATA, bukan gerbang: daftar simbol IDX likuid + stopword Indonesia.
// Aturan emas: token 4-huruf-kapital apa pun tetap kandidat ticker (universal);
// daftar ini hanya (1) menolong input huruf kecil, (2) membedakan kata Indonesia dari ticker.
export const KNOWN_SYMBOLS = new Set<string>([
  // bank & jasa keuangan
  "BBCA", "BBRI", "BMRI", "BBNI", "BRIS", "BBTN", "BJTM", "BJBR", "BDMN", "BNGA", "NISP", "MEGA", "PNBN", "BBKP",
  "AGRO", "BANK", "BTPS", "ARTO", "BBHI", "BBYB", "AMAR", "BCIC", "BINA", "BMAS", "BNLI", "BBIA", "BEKS", "BFIN",
  "ADMF", "MFIN", "PNLF", "WOMF", "VRNA", "ASBI", "ASDM", "TUGU", "LPGI", "PANS", "PNIN", "ABMM", "APIC", "MABA",
  // konsumer, ritel, makanan
  "UNVR", "ICBP", "INDF", "MYOR", "CPIN", "JPFA", "GGRM", "HMSP", "RMBA", "WIIM", "KLBF", "SIDO", "KAEF", "DVLA",
  "TSPC", "MERK", "ULTJ", "DLTA", "MLBI", "CAMP", "AISA", "FOOD", "PSDN", "ROTI", "STTP", "KEJU", "CLEO", "TBLA",
  "SIMP", "LSIP", "AALI", "DSNG", "SMAR", "ANJT", "BWPT", "CSRA", "PALM", "SSMS", "TLDN", "MAPA", "ACES", "MAPI",
  "RALS", "LPPF", "MATA", "CSAP", "HERO", "AMRT", "MIDI", "FAST", "PMJS", "SCMA", "KOIN", "RAAM",
  // telekomunikasi, teknologi, media
  "TLKM", "ISAT", "EXCL", "TOWR", "TBIG", "MTEL", "FREN", "GOTO", "BUKA", "EMTK", "MNCN", "SCMA", "MSIN", "MTDL",
  "DMMX", "WIFI", "TECH", "DCII", "MLPT", "BALI", "EDGE", "GLVA", "LMAS", "LUCK", "POWR", "KIJA",
  // energi, tambang, komoditas
  "ADRO", "PTBA", "ITMG", "UNTR", "BUMI", "BRMS", "ANTM", "INCO", "TINS", "MDKA", "MBMA", "NCKL", "HRTA", "HRUM",
  "MEDC", "PGAS", "AKRA", "ELSA", "ESSA", "INTP", "SMGR", "SMBR", "SMCB", "WSBP", "ARNA", "TOTO", "KIJA", "BRPT",
  "TPIA", "CUAN", "BREN", "RAJA", "PGEO", "CDIA", "KKGI", "PTRO", "DOID", "BYAN", "SGER", "TOBA", "BSSR", "MYOH",
  "GTBO", "FIRE", "DEWA", "ENRG", "MCOL", "SOCI", "WINS", "PSSI", "HITS", "AIMS", "CITA", "ZINC", "NIKL", "PSAB",
  "DKFT", "IFSH", "MDKA",
  // infrastruktur, konstruksi, properti
  "JSMR", "WIKA", "WSKT", "ADHI", "PTPP", "TOTL", "NRCA", "ACST", "MTLA", "CTRA", "BSDE", "LPKR", "PWON", "SMRA",
  "ASRI", "DILD", "APLN", "KIJA", "DMAS", "BEST", "PANI", "CBDK", "AREA", "DART", "GPRA", "SSIA", "MDLN", "OMRE",
  "RDTX", "PLIN", "KOTA", "BAPI",
  // industri & transportasi
  "ASII", "AUTO", "SMSM", "INDS", "GJTL", "NIPS", "HEXA", "IMAS", "BIRD", "ASSA", "TMAS", "SMDR", "HITS", "PSSI",
  "GIAA", "IATA", "SAFE", "BLTA", "SOCP", "IPCM", "PIRA", "NELY", "CMPP", "MAYA", "ALII", "IPCC", "BPTR", "MIRA",
  // kesehatan & lain-lain
  "MIKA", "SILO", "HEAL", "PRDA", "MEDC", "BACA", "MTMH", "SAME", "BMHS", "IRRA", "DGNS", "PRIM", "SRAJ", "HAIS",
  "BSIM", "MII", "BABP", "BNBR", "YULE", "BULL", "MDIY",
]);

// Kata umum yang bukan ticker. Ticker yang kebetulan sama (BUMI) lolos karena ada di KNOWN_SYMBOLS.
export const NOT_TICKER = new Set<string>([
  "ARUS", "SAYA", "KAMU", "KITA", "HALO", "BISA", "DONG", "SAJA", "KALO", "JUAL", "BELI", "CUAN", "NAIK", "RUGI",
  "LABA", "UANG", "DUIT", "HARI", "JADI", "SAMA", "MASA", "MAAF", "MARI", "CUMA", "DARI", "YANG", "KIRA", "STOP",
  "HOLD", "SELL", "WAIT", "BULL", "BEAR", "MOON", "PUMP", "DUMP", "REAL", "FAKE", "TRUE", "DEMO", "TEST", "LIKE",
  "THIS", "THAT", "WITH", "FROM", "WHAT", "WHEN", "GOOD", "NICE", "WELL", "AMAN", "BURUK", "MAHAL", "MURAH", "TURUN",
  "BAGI", "WAJAR", "KENA", "GIMANA", "BAGAIMANA", "MANTAP", "GAS", "GASS", "LANJUT", "TAKUT", "PANIK", "NYANGKUT",
  "MERAH", "HIJAU", "TANYA", "TOLONG", "BANTU", "LIHAT", "CEK", "COBA", "MULAI", "AKHIR", "AWAL", "NAMA", "KODE",
  "IHSG", "COAL", "GOLD", "TRAP", "RISK", "LQ45", "IDX30",
]);

export function isKnownSymbol(t: string): boolean {
  return KNOWN_SYMBOLS.has(t.toUpperCase());
}