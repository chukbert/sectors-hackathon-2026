// lib/memory.ts — memori yang BENAR-BENAR dibaca: portofolio, watchlist, pola chase.
// JSON (tanpa native dep). Guard: file rusak → memori kosong, bukan crash.
import fs from "node:fs";
import path from "node:path";

export interface PortofolioItem { ticker: string; pct: number }
export interface Decision { at: number; ticker: string; action: string; price?: number; ret7?: number }
interface Memory { portfolio: PortofolioItem[]; watchlist: string[]; decisions: Decision[]; pola: string[] }

const FILE = () => path.join(process.env.ARUS_CACHE ?? path.join(process.cwd(), ".cache"), "memory.json");

function load(): Memory {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), "utf8")) as Partial<Memory>;
    return {
      portfolio: Array.isArray(raw.portfolio) ? raw.portfolio : [],
      watchlist: Array.isArray(raw.watchlist) ? raw.watchlist.map((t) => String(t).toUpperCase()) : [],
      decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
      pola: Array.isArray(raw.pola) ? raw.pola : [],
    };
  } catch {
    return { portfolio: [], watchlist: [], decisions: [], pola: [] };
  }
}
function save(m: Memory) {
  const f = FILE();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
}

export function setPortfolio(p: PortofolioItem[]) {
  const m = load();
  m.portfolio = p.slice(0, 10).map((x) => ({ ticker: x.ticker.toUpperCase(), pct: x.pct }));
  save(m);
}
export function getPortfolio(): PortofolioItem[] {
  return load().portfolio;
}
export function addWatch(symbol: string) {
  const m = load();
  const t = symbol.toUpperCase();
  if (!m.watchlist.includes(t)) m.watchlist.push(t);
  save(m);
}
export function getWatchlist(): string[] {
  return load().watchlist.slice(0, 20);
}
export function addDecision(d: Omit<Decision, "at">) {
  const m = load();
  m.decisions.push({ ...d, at: Date.now(), ticker: d.ticker.toUpperCase() });
  save(m);
}
export function addPola(p: string) {
  const m = load();
  m.pola.push(p.slice(0, 120));
  if (m.pola.length > 200) m.pola = m.pola.slice(-200);
  save(m);
}
export function chasePattern(ticker: string, currentRet7: number): { action: string; agoDays: number } | null {
  if (currentRet7 < 10) return null;
  const t = ticker.toUpperCase();
  for (const d of [...load().decisions].reverse()) {
    if (d.ticker === t && /(beli|nambah|masuk|average|avg|dca|gas)/i.test(d.action) && (d.ret7 ?? 0) > 10)
      return { action: d.action, agoDays: Math.round((Date.now() - d.at) / 864e5) };
  }
  return null;
}
export function getMemory() {
  const m = load();
  return { ...m, nPola: m.pola.length };
}