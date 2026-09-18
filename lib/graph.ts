// lib/graph.ts — GrupGraph: bipartite emiten↔pemegang dari company-report §ownership → union-find.
// Known-list hanya MELABELI cluster hasil data — bukan sumber relasi. Semua label "kemungkinan relasi".
import type { Getter } from "./evidence.js";
import { seedReport } from "./seed.js";

export interface GraphNode { id: string; label?: string; hub?: 1; group: number; w?: number; me?: 1; flag?: 1 }
export interface GraphPayload { nodes: GraphNode[]; links: [string, string][] }
export interface GroupRow { name: string; tickers: string[]; pct: number; note: string }
export interface AutopsiKartu { group_score: number; headline: string; groups: GroupRow[]; graph?: GraphPayload; bullets: string[] }
export interface Holder { name: string; share_percentage: number }
export interface Ownership { ticker: string; group?: string; holders: Holder[] }

export const KNOWN_GROUPS: Record<string, string[]> = {
  "Sinar Mas": ["SMAR", "BSDE", "INKP", "BMAS"],
  "Barito (Prajogo)": ["BRPT", "TPIA", "BREN", "CUAN"],
  Salim: ["INDF", "ICBP", "ISAT", "DSSA"],
  Bakrie: ["BNBR", "BABP", "YULE"],
  Lippo: ["LPKR", "LPPF", "SILO", "MTLA"],
  Djarum: ["BDMN"],
  MNC: ["MNCN", "MSIN"],
  Astra: ["ASII", "UNTR", "AUTO", "SMBR"],
  Merdeka: ["MDKA", "MBMA"],
  "Alamtri (Adaro)": ["ADRO"],
  Harita: ["HRTA", "NATL"],
  Bumi: ["BUMI", "BRMS"],
  "MIND ID (BUMM)": ["ANTM", "INCO", "TINS", "PTBA"],
  "BUMN karya": ["WIKA", "WSKT", "ADHI", "PTPP", "JSMR"],
  "BUMN telekom": ["TLKM", "PGAS"],
};

const strip = (s: string) => s.toLowerCase()
  .replace(/\b(pt|tbk|persero|perseroan|cv|company|corporation|corp|holding|investments?|internasional|global|utama|sarana|sejati|koperasi|dana|pensiun)\b/g, " ")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export const normalizeName = (s: string) => strip(s);

const GENERIC = new Set(["masyarakat", "public", "publik", "lain", "lainnya", "others", "individual", "karyawan",
  "investama", "investment", "investments", "capital", "holdings", "holding", "company", "corp", "corporation", "global",
  "internasional", "utama", "resources", "resource", "dana", "sejahtera", "mandiri", "bersama", "founders", "seed"]);

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

const tickerKnown = new Map<string, string>();
for (const [g, list] of Object.entries(KNOWN_GROUPS)) for (const t of list) tickerKnown.set(t, g);
export const knownGroup = (ticker: string): string | undefined => tickerKnown.get(ticker.toUpperCase());

function dsu() {
  const p = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (p.get(r) && p.get(r) !== r) r = p.get(r)!; if (p.get(x)) p.set(x, r); return r };
  return { find, union(a: string, b: string) { const ra = find(a), rb = find(b); if (ra !== rb) p.set(ra, rb) } };
}

const CONTROL_PCT = 20;

export function clusterOwnerships(own: Ownership[]): Map<string, string> {
  const d = dsu();
  const tickers = own.map((o) => o.ticker);
  for (const t of tickers) d.union(t, t);
  const byGroup = new Map<string, string[]>();
  const bucket = (g: string, t: string) => { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g)!.push(t) };
  for (const o of own) {
    if (o.group) bucket(o.group, o.ticker);
    const k = knownGroup(o.ticker);
    if (k) bucket(k, o.ticker);
  }
  for (const list of byGroup.values()) for (let i = 1; i < list.length; i++) d.union(list[0]!, list[i]!);
  // "Masyarakat"/"Public" ada di hampir semua laporan dan bisa ≥20% — JANGAN dianggap pengendali yang sama.
const isGenericHolder = (name: string) => {
  const toks = normalizeName(name).split(" ").filter((t) => t.length > 3 && !GENERIC.has(t));
  return toks.length === 0;
};
const ctrl: { t: string; n: string }[] = [];
  for (const o of own) for (const h of o.holders) if (h.share_percentage >= CONTROL_PCT && !isGenericHolder(h.name)) ctrl.push({ t: o.ticker, n: h.name });
  for (let i = 0; i < ctrl.length; i++) for (let j = i + 1; j < ctrl.length; j++)
    if (ctrl[i]!.t !== ctrl[j]!.t && sameName(ctrl[i]!.n, ctrl[j]!.n)) d.union(ctrl[i]!.t, ctrl[j]!.t);
  const out = new Map<string, string>();
  const rootName = new Map<string, string>();
  for (const o of own) {
    const r = d.find(o.ticker);
    if (o.group && !rootName.has(r)) rootName.set(r, o.group);
  }
  for (const { t, n } of ctrl) { const r = d.find(t); if (!rootName.has(r)) rootName.set(r, `via ${normalizeName(n)}`) }
  for (const t of tickers) {
    const r = d.find(t);
    const members = tickers.filter((x) => d.find(x) === r);
    out.set(t, members.length > 1 ? (rootName.get(r) ?? `Grup ${r}`) : "");
  }
  return out;
}

export function knownMembers(groupLabel: string): string[] {
  for (const [g, list] of Object.entries(KNOWN_GROUPS)) if (sameName(g, groupLabel) || groupLabel.startsWith(g)) return list;
  return [];
}

export async function loadOwnerships(get: Getter, tickers: string[]): Promise<{ own: Ownership[]; seed: boolean }> {
  const own: Ownership[] = [];
  let seed = false;
  await Promise.all(tickers.map(async (t) => {
    try {
      const rep = await get<{ ownership?: { major_shareholders?: Holder[]; conglomerates_group?: string } }>(`/company/report/${t}?sections=ownership`, seedReport(t, ["ownership"]));
      if (rep.seed) seed = true;
      own.push({
        ticker: t.toUpperCase(),
        group: rep.data.ownership?.conglomerates_group ?? undefined,
        holders: (rep.data.ownership?.major_shareholders ?? []).map((h) => ({ name: h.name, share_percentage: Number(h.share_percentage) || 0 })),
      });
    } catch { /* ticker tanpa data → independen, tidak dikarang */ }
  }));
  return { own, seed };
}

export function egoGraph(asked: string, clusters: Map<string, string>, all: Ownership[]): GraphPayload {
  const g = clusters.get(asked.toUpperCase()) ?? "";
  const nodes: GraphNode[] = [];
  const links: [string, string][] = [];
  if (g) {
    const members = all.filter((o) => (clusters.get(o.ticker) ?? "") === g).map((o) => o.ticker);
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
    if (!g) { if (!byG.has("__indep")) byG.set("__indep", { tickers: [], pct: 0 }); byG.get("__indep")!.tickers.push(p.ticker); continue }
    const e = byG.get(g) ?? { tickers: [], pct: 0 };
    e.tickers.push(p.ticker); e.pct += p.pct; byG.set(g, e);
  }
  const multi = [...byG.entries()].filter(([g, e]) => g !== "__indep" && e.tickers.length >= 2).sort((a, b) => b[1].pct - a[1].pct);
  const shared = Math.round(multi.reduce((s, [, e]) => s + e.pct, 0));
  const indep = byG.get("__indep");
  const groups: GroupRow[] = multi.map(([name, e]) => ({
    name, tickers: e.tickers, pct: Math.round(e.pct),
    note: "satu pengendali — saat induk kena isu, posisi ini bergerak sebagai satu paket",
  }));
  if (indep?.tickers.length) groups.push({ name: "Independen", tickers: indep.tickers, pct: Math.round(100 - shared), note: "sisanya relatif terpisah di universe yang dicek" });
  return {
    group_score: shared,
    headline: multi.length ? `${shared}% nilaimu dipegang ${multi.length} grup` : "Tidak ada pasangan satu grup dalam universe yang dicek",
    groups,
    bullets: [
      `${portfolio.length} saham terasa seperti ${portfolio.length} keputusan. Group Score = % nilai yang ternyata satu pengendali.`,
      `dihitung dari company-report §ownership ×${portfolio.length} ticker · known-list 15 grup · ambang kendali ${CONTROL_PCT}%`,
      `label "kemungkinan relasi" — kepemilikan per laporan terakhir`,
    ],
  };
}