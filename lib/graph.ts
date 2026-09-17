// GrupGraph — derived asset #2. Bipartite emiten↔pemegang dari data kepemilikan Sectors
// (company-report §ownership: major_shareholders + conglomerates_group; shareholders-composition
// utk komposisi kategori) → union-find lintas ticker = satu grup. Known-list 30 grup besar
// hanya untuk melabeli cluster hasil data — bukan sumber relasi. Semua berlabel "kemungkinan relasi".
import { sectorsGet } from "./sectors.ts";
import type { GraphPayload, AutopsiKartu, GroupRow } from "./types.ts";

export interface Holder { name: string; share_percentage: number }
export interface Ownership { ticker: string; group?: string; holders: Holder[] }

// known-list: label dari pengetahuan publik utk cluster hasil data — BUKAN sumber relasi.
// Disengaja konservatif (hanya keanggotaan yang mapan & sering dilaporkan); sisanya tetap
// ter-cluster lewat nama pengendali di company-report. Semua output berlabel "kemungkinan relasi".
export const KNOWN_GROUPS: Record<string, string[]> = {
  "Sinar Mas": ["SMAR", "BSDE", "INKP", "BMAS"],
  "Barito (Prajogo)": ["BRPT", "TPIA", "BREN", "CUAN"],
  "Salim": ["INDF", "ICBP", "ISAT", "DSSA"],
  "Bakrie": ["BNBR", "BABP", "YULE"],
  "Lippo": ["LPKR", "LPPF", "SILO", "MTLA"],
  "Djarum": ["BDMN"],
  "MNC": ["MNCN", "MSIN", "BTEL"],
  "Emtek": ["EMTK"],
  "Rajawali": ["RAJA"],
  "Astra": ["ASII", "UNTR", "AUTO", "SMBR"],
  "Merdeka": ["MDKA", "MBMA"],
  "Alamtri (Adaro)": ["ADRO"],
  "Harita": ["HRIT", "NATL", "HRTA"],
  "Bumi": ["BUMI", "BRMS"],
  "MIND ID (BUMM)": ["ANTM", "INCO", "TINS", "PTBA"],
  "BUMN karya": ["WIKA", "WSKT", "ADHI", "PTPP", "JSMR"],
  "BUMN telekom": ["TLKM", "PGAS"],
  "Gudang Garam": ["GGRM"],
  "Mayora": ["MYOR"],
  "Charoen Pokphand": ["CPIN"],
  "Japfa": ["JPFA"],
  "Kalbe": ["KLBF"],
  "Medco": ["MEDC", "OMED"],
  "Ciputra": ["CTRA"],
  "Agung Sedayu + Salim (PIK2)": ["PANI"],
  "Triputra": ["TBLA", "BTPS"],
};

const strip = (s: string) => s.toLowerCase()
  .replace(/\b(pt|tbk|persero|perseroan|cv|company|corporation|corp|tbd|holding|investments?|internasional|global|utama|sarana|sejati|koperasi|dana|pensiun)\b/g, " ")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function normalizeName(s: string): string { return strip(s) }

// token generik TIDAK boleh jadi bukti "sama" — "PT Masyarakat"/"Public" ada di hampir semua laporan
const GENERIC = new Set(["masyarakat", "public", "publik", "lain", "lain2", "lainnya", "others", "individual", "karyawan",
  "investama", "investment", "investments", "capital", "holdings", "holding", "company", "corp", "corporation", "global",
  "internasional", "utama", "resources", "resource", "dana", "sejahtera", "mandiri", "bersama", "seed"]);

// fuzzy: sama, atau salah satu awalan ≥8 char, atau overlap token NON-generik ≥ 60%
export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y || (x.length >= 8 && y.startsWith(x)) || (y.length >= 8 && x.startsWith(y))) return true;
  const tx = x.split(" ").filter((t) => t.length > 3 && !GENERIC.has(t));
  const ty = y.split(" ").filter((t) => t.length > 3 && !GENERIC.has(t));
  if (!tx.length || !ty.length) return false;
  const setx = new Set(tx);
  const hit = ty.filter((t) => setx.has(t)).length;
  return hit / Math.min(tx.length, ty.length) >= 0.6;
}

// known ticker → nama grup
const tickerKnown = new Map<string, string>();
for (const [g, list] of Object.entries(KNOWN_GROUPS)) for (const t of list) if (/^[A-Z]{2,6}$/.test(t)) tickerKnown.set(t, g);

export function knownGroup(ticker: string): string | undefined { return tickerKnown.get(ticker.toUpperCase()) }

interface DSU { find(x: string): string; union(a: string, b: string): void }
function dsu(): DSU {
  const p = new Map<string, string>();
  const find = (x: string) => { let r = x; while (p.get(r) && p.get(r) !== r) r = p.get(r)!; if (p.get(x)) p.set(x, r); return r };
  return { find, union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) p.set(ra, rb) } };
}

// ambang "mengendalikan" — ponytail: 20% konstanta, turunkan ke 10 bila banyak grup besar lolos cluster
const CONTROL_PCT = 20;

/** cluster antar ticker dalam satu set kepemilikan (hasil dari company-report §ownership) */
export function clusterOwnerships(own: Ownership[]): Map<string, string> {
  const d = dsu(); const tickers = own.map((o) => o.ticker);
  const seen = new Set(tickers.map((t) => t.toUpperCase()));
  for (const t of tickers) d.union(t, t);
  // 1) label — ticker masuk ke SEMUA bucket yang berlaku (label API DAN known-list),
  //    karena API bisa memberi label berbeda-string untuk grup yang sama (INDF "Salim Group" vs ICBB "…")
  const byGroup = new Map<string, string[]>();
  const bucket = (g: string, t: string) => { (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(t) };
  for (const o of own) {
    if (o.group) bucket(o.group, o.ticker);
    const k = knownGroup(o.ticker);
    if (k) bucket(k, o.ticker);
  }
  for (const list of byGroup.values()) for (let i = 1; i < list.length; i++) d.union(list[0], list[i]);
  // 2) pemegang kendali sama (normalisasi+fuzzy) → union; simpan nama pengendali utk label
  const ctrl: { t: string; n: string }[] = [];
  for (const o of own) for (const h of o.holders) if (h.share_percentage >= CONTROL_PCT) ctrl.push({ t: o.ticker, n: h.name });
  for (let i = 0; i < ctrl.length; i++) for (let j = i + 1; j < ctrl.length; j++)
    if (ctrl[i].t !== ctrl[j].t && sameName(ctrl[i].n, ctrl[j].n)) d.union(ctrl[i].t, ctrl[j].t);
  // label cluster
  const out = new Map<string, string>();
  const rootName = new Map<string, string>();
  for (const o of own) {
    const r = d.find(o.ticker);
    if (o.group && !rootName.has(r)) rootName.set(r, o.group);
  }
  for (const { t, n } of ctrl) { const r = d.find(t); if (!rootName.has(r)) rootName.set(r, `via ${normalizeName(n)}`); }
  for (const t of tickers) {
    const r = d.find(t);
    const members = tickers.filter((x) => d.find(x) === r);
    out.set(t, members.length > 1 ? rootName.get(r) ?? `Grup ${r}` : "");
  }
  return out; // ticker → nama grup ("" = independen di set ini)
}

/** anggota known-grup dari label (untuk ekspansi ego-graph) */
export function knownMembers(groupLabel: string): string[] {
  for (const [g, list] of Object.entries(KNOWN_GROUPS))
    if (sameName(g, groupLabel) || groupLabel.startsWith(g)) return list;
  return [];
}

/** fetch kepemilikan (cache 1×/minggu) lalu cluster */
export async function loadOwnerships(tickers: string[]): Promise<Ownership[]> {
  const own: Ownership[] = [];
  await Promise.all(tickers.map(async (t) => {
    try {
      const rep = await sectorsGet("company_report", { symbol: t, sections: "ownership" }) as
        { ownership?: { major_shareholders?: Holder[]; conglomerates_group?: string } };
      own.push({
        ticker: t.toUpperCase(),
        group: (rep.ownership?.conglomerates_group as string) ?? undefined,
        holders: (rep.ownership?.major_shareholders ?? []).map((h) => ({ name: h.name, share_percentage: Number(h.share_percentage) || 0 })),
      });
    } catch { /* ticker mati/suspend tanpa data → tetap jalan, independen */ }
  }));
  return own;
}

export function egoGraph(asked: string, clusters: Map<string, string>, all: Ownership[]): GraphPayload {
  const g = clusters.get(asked.toUpperCase()) ?? "";
  const nodes: GraphPayload["nodes"] = [];
  const links: GraphPayload["links"] = [];
  const members = g ? all.filter((o) => (clusters.get(o.ticker) ?? "") === g).map((o) => o.ticker) : [];
  if (g) {
    nodes.push({ id: `H:${g}`, label: g.toUpperCase(), hub: 1, group: 0 });
    for (const m of members.slice(0, 8)) {
      nodes.push({ id: m, group: 0, me: m === asked.toUpperCase() ? undefined : 1, flag: m === asked.toUpperCase() ? 1 : undefined });
      links.push([`H:${g}`, m]);
    }
  } else nodes.push({ id: asked.toUpperCase(), group: -1, flag: 1, me: 1 });
  return { nodes, links };
}

export function autopsiKartu(portfolio: { ticker: string; pct: number }[], own: Ownership[]): AutopsiKartu {
  const clusters = clusterOwnerships(own);
  const byG = new Map<string, { tickers: string[]; pct: number }>();
  for (const p of portfolio) {
    const g = clusters.get(p.ticker.toUpperCase()) ?? "";
    if (!g) { (byG.get("__indep") ?? byG.set("__indep", { tickers: [], pct: 0 }).get("__indep")!).tickers.push(p.ticker); continue }
    const e = byG.get(g) ?? { tickers: [], pct: 0 }; e.tickers.push(p.ticker); e.pct += p.pct; byG.set(g, e);
  }
  const multi = [...byG.entries()].filter(([g, e]) => g !== "__indep" && e.tickers.length >= 2).sort((a, b) => b[1].pct - a[1].pct);
  const shared = Math.round(multi.reduce((s, [, e]) => s + e.pct, 0));
  const indep = byG.get("__indep");
  const groups: GroupRow[] = multi.map(([name, e]) => ({
    name, tickers: e.tickers, pct: Math.round(e.pct),
    note: `satu pengendali — saat induk kena isu, posisi ini bergerak sebagai satu paket`,
  }));
  if (indep?.tickers.length) groups.push({ name: "Independen", tickers: indep.tickers, pct: Math.round(100 - shared), note: "sisanya memang terdiversifikasi" });

  // graph penuh: hub tiap grup multi + anggota (w = % portofolio, me) + ticker luar-grup netral
  const nodes: GraphPayload["nodes"] = []; const links: GraphPayload["links"] = [];
  multi.forEach(([name, e], gi) => {
    nodes.push({ id: `H:${name}`, label: name.toUpperCase(), hub: 1, group: gi });
    for (const t of e.tickers) {
      const p = portfolio.find((x) => x.ticker.toUpperCase() === t);
      nodes.push({ id: t, group: gi, w: p ? Math.round(p.pct) : undefined, me: 1 });
      links.push([`H:${name}`, t]);
    }
    // tetangga grup yang TIDAK di portofolio = risiko yang belum terlihat
    for (const o of own) if ((clusters.get(o.ticker) ?? "") === name && !e.tickers.includes(o.ticker))
      { nodes.push({ id: o.ticker, group: gi }); links.push([`H:${name}`, o.ticker]) }
  });
  for (const t of indep?.tickers ?? []) nodes.push({ id: t, group: -1, w: Math.round(portfolio.find((x) => x.ticker.toUpperCase() === t)?.pct ?? 0), me: 1 });

  return {
    group_score: shared,
    headline: multi.length ? `${shared}% nilaimu dipegang ${multi.length} grup` : "Tidak ada pasangan satu grup dalam portofolio ini (di universe yang dicek)",
    groups, graph: { nodes, links },
    bullets: [
      `${portfolio.length} saham terasa seperti ${portfolio.length} keputusan. Group Score = % nilai yang ternyata satu pengendali.`,
      `dihitung dari company-report §ownership ×${portfolio.length} ticker · known-list 30 grup · ambang kendali ${CONTROL_PCT}%`,
      `label "kemungkinan relasi" — kepemilikan per laporan terakhir`,
    ],
  };
}
