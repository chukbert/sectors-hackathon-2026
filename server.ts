// server.ts — ARUS v7 web: chat HP-first + kartu + share /k/{id} + OG statis. Zero-login.
import "./lib/envfix.js";
import express from "express";
import cors from "cors";
import { CreditSession } from "./lib/credit.js";
import { chat } from "./lib/orchestrator.js";
import { summarizeMemory } from "./lib/synthesis.js";
import { saveCard, loadCard } from "./lib/share.js";
import { addPola, getMemory } from "./lib/memory.js";
import { getChat, listChats, appendMsg, newChatId, deleteChat } from "./lib/chats.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

// Rate-limit per-IP: 60 pesan/jam, benar-benar memblokir (bukan sekadar flag).
const hits = new Map<string, { n: number; reset: number }>();
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/chat")) return next();
  const ip = (req.headers["x-forwarded-for"] as string) ?? req.ip ?? "anon";
  const now = Date.now();
  const h = hits.get(ip) ?? { n: 0, reset: now + 3600_000 };
  if (now > h.reset) {
    h.n = 0;
    h.reset = now + 3600_000;
  }
  h.n++;
  hits.set(ip, h);
  if (h.n > 60) return res.status(429).json({ error: "Rate limit: 60 pesan/jam per IP. Coba lagi nanti." });
  next();
});

app.post("/api/chat", async (req, res) => {
  const q = String(req.body?.q ?? "").slice(0, 500);
  if (!q) return res.status(400).json({ error: "q kosong" });
  const chatId = String(req.body?.chatId ?? "").slice(0, 32) || newChatId();
  const session = new CreditSession(crypto.randomUUID());
  const now = new Date().toISOString();
  try {
    appendMsg(chatId, { role: "user", q, at: now }, q);
    const kartu = await chat(q, session);
    const id = saveCard(kartu);
    appendMsg(chatId, { role: "assistant", q, kartu: { ...kartu, share: `/k/${id}` }, at: new Date().toISOString() });
    addPola(q.slice(0, 80));
    res.json({ ...kartu, share: `/k/${id}`, chatId });
  } catch (e) {
    res.status(402).json({ error: String(e), seedMode: true, chatId });
  }
});

app.get("/api/chats", (_req, res) => {
  res.json(listChats());
});

app.get("/api/chats/:id", (req, res) => {
  const c = getChat(req.params.id);
  if (!c) return res.status(404).json({ error: "chat tidak ditemukan" });
  res.json(c);
});

app.delete("/api/chats/:id", (req, res) => {
  res.json({ ok: deleteChat(req.params.id) });
});

// Ringkasan memori: LLM (di-cache 10 menit per isi memori) dengan fallback deterministik — 0 kredit Sectors.
let memSum: { at: number; key: string; text: string } | null = null;
app.get("/api/memory", async (_req, res) => {
  const m = getMemory();
  const det = `${m.pola.length} pola ditangkap${m.watchlist.length ? ` · watch: ${m.watchlist.join(", ")}` : ""}`;
  const key = JSON.stringify({ n: m.pola.length, w: m.watchlist, p: m.portfolio.length, d: m.decisions.length });
  if (memSum && memSum.key === key && Date.now() - memSum.at < 600_000) {
    return res.json({ pola: m.pola.slice(-10), watchlist: m.watchlist, nPola: m.pola.length, ringkas: memSum.text, ringkasVia: "llm+cache" });
  }
  const llm = await summarizeMemory({ nPola: m.pola.length, watchlist: m.watchlist, portfolio: m.portfolio, decisions: m.decisions.slice(-3), pola: m.pola.slice(-5) }).catch(() => null);
  if (llm) memSum = { at: Date.now(), key, text: llm };
  res.json({ pola: m.pola.slice(-10), watchlist: m.watchlist, nPola: m.pola.length, ringkas: llm ?? det, ringkasVia: llm ? "llm" : "deterministik ↩" });
});

app.get("/k/:id", (req, res) => {
  const data = loadCard(req.params.id) as { card?: KartuLike } | null;
  if (!data) return res.status(404).send("kartu tidak ditemukan");
  const c = data.card ?? {};
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">
<meta property="og:title" content="ARUS — ${esc(String(c.verdict ?? "Kartu Arus"))} ${c.probability ?? ""}"><meta property="og:description" content="Verdict probabilistik dari join Sectors. Bukan nasihat keuangan."><meta property="og:image" content="/api/og?id=${req.params.id}">
<title>ARUS /k/${req.params.id} — ${esc(String(c.verdict ?? ""))}</title>
<style>
:root{--bg:#212121;--panel:#2f2f2f;--line:#424242;--txt:#ececec;--mut:#b4b4b4;--acc:#4da3ff;--grn:#3ddc84;--amb:#ffb020;--red:#ff6b6b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:28px 18px 60px}
.badge{display:inline-block;padding:4px 14px;border-radius:99px;font-weight:700;font-size:13px}
.card{background:#2f2f2f;border:1px solid #424242;border-radius:16px;padding:22px}
h1{font-size:22px;margin:6px 0 2px}h3{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:22px 0 8px}
ul{padding-left:20px}li{margin:6px 0}.meta{color:var(--mut);font-size:13px;margin-top:10px}.meta a{color:var(--acc)}
.callout{border-radius:12px;padding:12px 14px;margin:12px 0;font-size:14px}
.warn{background:rgba(255,176,32,.1);border:1px solid rgba(255,176,32,.35)}
.info{background:rgba(77,163,255,.09);border:1px solid rgba(77,163,255,.3)}
.bar{height:8px;background:#171717;border-radius:99px;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:var(--acc);border-radius:99px}
.flowbox{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0}.node{background:#171717;border:1px solid #424242;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600}.arrow{color:var(--mut)}
.anombar{display:grid;grid-template-columns:64px 1fr 48px;gap:10px;align-items:center;margin:6px 0;font-size:13px}.track{height:10px;background:#171717;border-radius:99px;overflow:hidden}.fill{height:100%;border-radius:99px}
.scrrow{display:grid;grid-template-columns:26px 70px 1fr auto;gap:8px;align-items:center;background:#171717;border:1px solid #424242;border-radius:9px;padding:7px 10px;margin:5px 0;font-size:13px}
.scrno{width:22px;height:22px;border-radius:50%;background:#2f2f2f;border:1px solid #424242;display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:#b4b4b4}
.scrname{color:#b4b4b4;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scrval{font-weight:700;color:#9cc8ff}
.frow{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#171717;border:1px solid #424242;border-radius:9px;padding:8px 11px;margin:5px 0;font-size:13px}
.frow .fmain{min-width:0}.frow .fmain b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.frow .fsub{color:#b4b4b4;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.frow .fval{font-weight:700;color:#9cc8ff;white-space:nowrap}
.citebox{border:1px solid #424242;border-radius:12px;margin:14px 0;background:#2a3342}
.citebox summary{cursor:pointer;padding:11px 14px;font-size:13.5px;font-weight:600;list-style:none}
.citebox summary::-webkit-details-marker{display:none}
.citebox summary:before{content:"▾ ";color:var(--mut)}
.citebox[open] summary:before{content:"▴ "}
.citebox .inner{padding:0 14px 14px}
.csect{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:12px 0 6px}
.eplist{display:flex;flex-direction:column;gap:6px}
.eprow{display:flex;align-items:center;gap:8px;background:#171717;border:1px solid #424242;border-radius:9px;padding:7px 10px}
.eprow code{flex:1;font-size:12px;color:#cfe3ff;font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.etag{font-size:11px;font-weight:700;border-radius:99px;padding:2px 9px;white-space:nowrap}
.etag.live{background:rgba(61,220,132,.13);color:#7bf1a8;border:1px solid rgba(61,220,132,.35)}
.etag.cache{background:rgba(77,163,255,.12);color:#9cc8ff;border:1px solid rgba(77,163,255,.35)}
a{color:var(--acc)}
.awamlist{display:flex;flex-direction:column;gap:10px}
.awamitem{background:#171717;border:1px solid #424242;border-radius:12px;padding:12px 14px}
.awamhead{display:flex;align-items:center;gap:8px;font-size:14.5px}
.awamnum{width:22px;height:22px;min-width:22px;border-radius:50%;background:#2f2f2f;border:1px solid #424242;display:inline-flex;align-items:center;justify-content:center;font-size:12px;color:#b4b4b4}
.awamarti{font-size:13.5px;color:#b4b4b4;line-height:1.65;margin:6px 0 8px}
.awamkondisi{font-size:14px;line-height:1.7;border-left:3px solid #4da3ff;padding-left:10px}
.klabel{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4da3ff;margin-bottom:2px}
.awamgroup{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#b4b4b4;margin:14px 0 6px}
.awamanalogi{font-size:13.5px;color:#ececec;line-height:1.65;margin:0 0 8px;padding:8px 10px;background:rgba(255,176,32,.07);border:1px dashed rgba(255,176,32,.3);border-radius:9px}
.awamintisari{background:rgba(61,220,132,.08);border:1px solid rgba(61,220,132,.3);border-radius:12px;padding:12px 14px;margin:12px 0;font-size:14px;line-height:1.7}
.furow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}
.fulabel{font-size:12.5px;color:#b4b4b4}
.fu{background:transparent;border:1px solid #4da3ff;color:#4da3ff;border-radius:99px;padding:5px 12px;font-size:12.5px;display:inline-block}
</style></head><body><div class="wrap">
<div style="color:var(--mut);font-size:13px">◍ ARUS · Kartu Arus · <a href="/">buka chat</a></div>
<h1>${esc(String(c.verdict ?? "-"))} · ${(c.probability as number) ?? "-"}</h1>
<div class="card">
<div><span class="badge" style="background:rgba(77,163,255,.15);color:var(--acc)">${esc(String(c.verdict ?? "-"))}</span>
<span class="meta"> prob ${c.probability ?? "-"} · ${esc(String(c.kredit ?? ""))}${c.seed ? " · SEED" : ""}</span></div>
<h3>📐 Bagian 1 · Data faktual — untuk yang sudah paham</h3>
${renderVisual(c.visual)}
<h3>Kesimpulan teknis</h3><p>${esc(String((c as { narasi?: unknown }).narasi ?? "-"))}</p>
<h3>Bukti</h3><ul>${((c.bukti as string[]) ?? []).map((b) => `<li>${esc(String(b))}</li>`).join("")}</ul>
<div class="callout warn"><b>Sisi lain:</b> ${esc(String(c.counter ?? "-"))}</div>
<div class="meta">Sitasi: ${esc(((c.sitasi as string[]) ?? []).join(", "))}</div>
<h3>🧑🏫 Bagian 2 · Pelan-pelan — artinya apa</h3>
${renderAwam(c.awam as AwamLike | undefined)}
${Array.isArray(c.lanjutan) && (c.lanjutan as string[]).length ? `<div class="furow"><span class="fulabel">💬 Lanjut tanya:</span>${(c.lanjutan as string[]).map((x) => `<span class="fu">${esc(x)}</span>`).join("")}</div>` : ""}
${renderLedger(c.ledger, c.kredit)}
<p class="meta">Alat riset &amp; edukasi. Bukan nasihat keuangan.</p>
</div></div></body></html>`);
});

interface AwamLike { pembuka?: unknown; penutup?: unknown; intisari?: unknown; bagian?: { istilah?: unknown; arti?: unknown; analogi?: unknown; kondisi?: unknown; nada?: unknown }[] }
function renderAwam(a: AwamLike | undefined): string {
  if (!a?.bagian?.length) return `<div class="meta">Kartu lama — bagian penjelasan belum tersimpan. Tanyakan ulang untuk versi lengkap.</div>`;
  const groups: [string, string][] = [["baik", " Sisi yang mendukung"], ["hati", "🟡 Yang perlu diperhatikan"], ["netral", "⚪ Istilah & konteks"]];
  let n = 0;
  let body = `<p>${esc(String(a.pembuka ?? ""))}</p>`;
  for (const [nada, label] of groups) {
    const items = (a.bagian ?? []).filter((b) => String(b.nada ?? "netral") === nada);
    if (!items.length) continue;
    body += `<div class="awamgroup">${label}</div><div class="awamlist">`;
    body += items.map((b) => {
      n++;
      return `<div class="awamitem"><div class="awamhead"><span class="awamnum">${n}</span><b>${esc(String(b.istilah ?? ""))}</b></div>`
        + `<div class="awamarti">${esc(String(b.arti ?? ""))}</div>`
        + `<div class="awamanalogi">Ibaratnya: ${esc(String(b.analogi ?? ""))}</div>`
        + `<div class="awamkondisi"><span class="klabel">Yang terbaca di kartu ini</span>${esc(String(b.kondisi ?? ""))}</div></div>`;
    }).join("");
    body += `</div>`;
  }
  if (a.intisari) body += `<div class="awamintisari">🎯 <b>Ringkas untuk yang masih baru:</b> ${esc(String(a.intisari))}</div>`;
  if (a.penutup) body += `<p class="meta">${esc(String(a.penutup))}</p>`;
  return body;
}

interface KartuLike {
  verdict?: unknown; probability?: unknown; kredit?: unknown; seed?: unknown;
  bukti?: unknown; counter?: unknown; sitasi?: unknown; visual?: unknown; narasi?: unknown;
  ledger?: unknown; awam?: unknown; lanjutan?: unknown;
}
interface LedgerRow { endpoint?: unknown; cost?: unknown; cached?: unknown; note?: unknown }
function renderLedger(ledger: unknown, kredit: unknown): string {
  const rows = (Array.isArray(ledger) ? ledger : []) as LedgerRow[];
  const items = rows.map((e) => {
    const ep = esc(String(e.endpoint ?? "-"));
    const tag = e.cached
      ? `<span class="etag cache">cache · 0kr</span>`
      : `<span class="etag live">${esc(String(e.cost ?? "?"))}kr</span>`;
    const note = e.note ? ` <span class="etag cache">${esc(String(e.note))}</span>` : "";
    return `<div class="eprow"><code title="${ep}">${ep}</code>${tag}${note}</div>`;
  }).join("");
  return `<details class="citebox"><summary>📎 Sitasi &amp; endpoint — ${rows.length} call ke Sectors API (klik untuk rincian)</summary><div class="inner">`
    + `<div class="csect">Endpoint Sectors yang ditembak</div>`
    + (rows.length
      ? `<div class="eplist">${items}</div>`
      : `<div class="meta">Kartu lama — rincian endpoint tidak tersimpan.</div>`)
    + `</div></details>`;
}
interface Sankey { nodes?: string[]; edges?: { from: string; to: string; label: string }[]; meta?: { topCountry?: string; prod?: string } }
function renderVisual(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const o = v as {
    sankey?: Sankey;
    radar?: { broker?: string; label?: string; repeat?: number };
    anoms?: { symbol: string; score: number }[];
    cluster?: { flag?: boolean; kind?: string; n?: number };
    flow?: { retailNetM: number; institusiNetM: number; asingNetM: number; windowDays?: number };
    groups?: { name: string; pct: number; tickers: string[] }[];
    groupScore?: number;
    compare?: { ticker: string; price: number; ret7: number; ret30: number; ret90: number; volMult: number; fomo?: number | null; liq?: string | null }[];
    screen?: { label?: string; where?: string; orderBy?: string; rows?: { symbol: string; name: string; disp?: string | null }[] };
    fund?: { title?: string; subtitle?: string; note?: string; rows?: { label?: string; name?: string; disp?: string }[] };
    entitas?: { title?: string; subtitle?: string; note?: string; rows?: { label?: string; name?: string; disp?: string }[] };
    rantai?: { title?: string; note?: string; edges?: { from: string; to: string; label: string }[] };
    ranking?: { title?: string; subtitle?: string; note?: string; rows?: { label?: string; name?: string; disp?: string }[] };
  };
  let h = "";
  if (o.sankey?.nodes?.length) {
    const nodes = o.sankey.nodes;
    const edges = o.sankey.edges ?? [];
    // Flow horizontal responsif: node pills + edge berlabel (bisa dibaca di HP & desktop)
    const flow = nodes.map((n) => `<span class="node">${esc(n)}</span>`).join(`<span class="arrow">→</span>`);
    const elist = edges.map((e) => `<li><b>${esc(e.from)} → ${esc(e.to)}</b> · ${esc(e.label)}</li>`).join("");
    const meta = o.sankey.meta ? `<div class="meta">Top buyer: <b>${esc(o.sankey.meta.topCountry ?? "?")}</b> · ${esc(o.sankey.meta.prod ?? "")}</div>` : "";
    h += `<h3>⛓️ Rantai barang</h3><div class="flowbox">${flow}</div><ul>${elist}</ul>${meta}`;
  }
  if (o.radar) {
    const r = o.radar;
    const w = Math.min(10, r.repeat ?? 0) / 10;
    h += `<h3>🕵️ DNA broker ${esc(r.broker ?? "")}</h3><div class="bar"><i style="width:${Math.round(w * 100)}%"></i></div><div class="meta">${esc(r.label ?? "")} · repeat ${r.repeat ?? 0}x</div>`;
  }
  if (o.anoms?.length) {
    h += `<h3>📡 Anomali GNN-lite</h3>${o.anoms.slice(0, 5).map((a) => {
      const pct = Math.round(Math.min(1, a.score) * 100);
      const col = a.score >= 0.7 ? "var(--red)" : a.score >= 0.4 ? "var(--amb)" : "var(--grn)";
      return `<div class="anombar"><b>${esc(a.symbol)}</b><div class="track"><div class="fill" style="width:${pct}%;background:${col}"></div></div><span>${a.score}</span></div>`;
    }).join("")}`;
  }
  if (o.cluster) {
    h += `<div class="callout ${o.cluster.flag ? "warn" : "info"}"><b>⚑ Cluster insider:</b> ${o.cluster.flag ? esc(o.cluster.kind ?? "") : "tidak ada"} (${o.cluster.n ?? 0} sell)</div>`;
  }
  if (o.flow) {
    const f = o.flow;
    const rows: [string, number][] = [["Ritel", f.retailNetM], ["Institusi/asing", f.institusiNetM], ["Asing 90hr", f.asingNetM]];
    const max = Math.max(1, ...rows.map(([, x]) => Math.abs(x)));
    h += `<h3>💸 Arus uang (${f.windowDays ?? 0} hari)</h3>` + rows.map(([label, x]) => {
      const pct = Math.round((Math.abs(x) / max) * 100);
      const col = x >= 0 ? "var(--grn)" : "var(--red)";
      return `<div class="anombar" style="grid-template-columns:110px 1fr 64px"><b style="font-size:12px">${label}</b><div class="track"><div class="fill" style="width:${pct}%;background:${col}"></div></div><span style="font-size:12px">${x >= 0 ? "+" : ""}${x}M</span></div>`;
    }).join("");
  }
  if (o.groups?.length) {
    h += `<h3>🏢 Grup kepemilikan — Group Score ${o.groupScore ?? 0}</h3>` + o.groups.map((g) =>
      `<div class="anombar" style="grid-template-columns:110px 1fr 44px"><b style="font-size:12px">${esc(g.name)}</b><div class="track"><div class="fill" style="width:${Math.min(100, g.pct)}%;background:var(--amb)"></div></div><span style="font-size:12px">${g.pct}%</span></div><div style="font-size:12px;color:var(--mut);margin:-4px 0 8px 118px">${esc(g.tickers.join(", "))}</div>`).join("");
  }
  if (o.compare?.length) {
    const max = Math.max(1, ...o.compare.map((x) => Math.abs(x.ret30)));
    h += `<h3>⚖️ Banding</h3>` + o.compare.map((x) => {
      const pct = Math.round((Math.abs(x.ret30) / max) * 100);
      const col = x.ret30 >= 0 ? "var(--grn)" : "var(--red)";
      return `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><b>${esc(x.ticker)}</b><span>${x.price} · 30hr ${x.ret30 >= 0 ? "+" : ""}${x.ret30}%</span></div><div class="track"><div class="fill" style="width:${pct}%;background:${col}"></div></div><div style="font-size:12px;color:var(--mut)">7hr ${x.ret7}% · 90hr ${x.ret90}% · vol ${x.volMult}x · FOMO ${x.fomo ?? "-"} · ${esc(x.liq ?? "")}</div></div>`;
    }).join("");
  }
  if (o.screen?.rows?.length) {
    h += `<h3>🔎 Screener Sectors — ${esc(o.screen.label ?? "")}</h3>` + o.screen.rows.map((r, i) =>
      `<div class="scrrow"><span class="scrno">${i + 1}</span><b>${esc(r.symbol)}</b><span class="scrname">${esc(r.name)}</span><span class="scrval">${esc(r.disp ?? "-")}</span></div>`).join("")
      + `<div class="meta">Urut ${esc(o.screen.orderBy ?? "")} · where "${esc(o.screen.where || "-")}" · angka apa adanya dari Sectors screener, bukan hitungan ARUS.</div>`;
  }
  const fblock = o.fund ?? o.entitas ?? o.ranking;
  if (fblock?.rows?.length) {
    const icon = o.ranking ? "🏆" : o.entitas ? "🧩" : "";
    h += `<h3>${icon} ${esc(fblock.title ?? "Fundamental")}</h3>`;
    if (fblock.subtitle) h += `<div class="meta">${esc(fblock.subtitle)}</div>`;
    h += fblock.rows.map((r) =>
      `<div class="frow"><div class="fmain"><b>${esc(r.label ?? "")}</b>${r.name ? `<div class="fsub">${esc(r.name)}</div>` : ""}</div>${r.disp ? `<span class="fval">${esc(r.disp)}</span>` : ""}</div>`).join("");
    if (fblock.note) h += `<div class="meta">${esc(fblock.note)}</div>`;
  }
  if (o.rantai?.edges?.length) {
    h += `<h3>🔗 ${esc(o.rantai.title ?? "Rantai relasi")}</h3>` + o.rantai.edges.map((e) =>
      `<div class="frow"><div class="fmain"><b>${esc(e.from)} → ${esc(e.to)}</b><div class="fsub">${esc(e.label)}</div></div></div>`).join("");
    if (o.rantai.note) h += `<div class="meta">${esc(o.rantai.note)}</div>`;
  }
  return h;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
const esc = escapeHtml;

app.get("/api/og", (req, res) => {
  // OG dinamis per kartu (?id=) — murni baca .cache/share, 0 kredit Sectors. Fallback statis.
  const id = String(req.query.id ?? "");
  let title = "ARUS — lihat arus";
  let sub = "uang · barang · kuasa — bukan nasihat keuangan";
  if (id) {
    const data = loadCard(id) as { card?: KartuLike } | null;
    const c = data?.card;
    if (c) {
      title = `ARUS — ${String(c.verdict ?? "")} ${c.probability ?? ""}`;
      sub = String(((c.bukti as string[]) ?? [])[0] ?? sub).slice(0, 90);
    }
  }
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b0f17"/><text x="60" y="200" fill="#fff" font-size="72">${esc(title)}</text><text x="60" y="300" fill="#9fb3c8" font-size="36">${esc(sub)}</text></svg>`);
});

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">
<title>ARUS — Asisten Riset IDX</title>
<style>
:root{--bg:#212121;--side:#171717;--panel:#2f2f2f;--panel2:#2f2f2f;--line:#424242;--txt:#ececec;--mut:#b4b4b4;--acc:#4da3ff;--grn:#3ddc84;--amb:#ffb020;--red:#ff6b6b;--rad:16px}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif;display:flex}
#side{width:260px;min-width:260px;background:var(--side);display:flex;flex-direction:column;height:100vh}
#brand{padding:14px 14px 6px;font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px}
#brand .dot{width:26px;height:26px;border-radius:50%;background:#fff;color:#000;display:inline-flex;align-items:center;justify-content:center;font-weight:800}
#brand small{color:var(--mut);font-weight:400;font-size:12px}
#newchat{margin:8px 12px;padding:10px;border:none;background:transparent;color:var(--txt);border-radius:10px;cursor:pointer;font-size:14px;text-align:left}
#newchat:hover{background:var(--panel)}
#search{margin:0 12px 6px;background:var(--panel);border:1px solid transparent;border-radius:10px;padding:8px 12px;color:var(--txt);font-size:13px;outline:none;width:calc(100% - 24px)}
#hist{flex:1;overflow-y:auto;padding:4px 8px}
.day{color:var(--mut);font-size:11px;font-weight:600;margin:14px 8px 4px}
.hitem{display:flex;align-items:center;gap:6px;padding:9px 10px;border-radius:10px;cursor:pointer;color:var(--txt);font-size:14px;white-space:nowrap;overflow:hidden;border:none;background:none;width:100%;text-align:left}
.hitem:hover{background:var(--panel)}.hitem.on{background:var(--panel)}
.hitem span{flex:1;overflow:hidden;text-overflow:ellipsis}
.hdel{background:none;border:none;color:var(--mut);cursor:pointer;font-size:15px;padding:2px 6px;border-radius:6px}
.hdel:hover{color:var(--red)}
#mem{border-top:1px solid var(--line);padding:10px 14px;font-size:12px;color:var(--mut);max-height:110px;overflow-y:auto}
#main{flex:1;display:flex;flex-direction:column;height:100vh;min-width:0}
#top{display:flex;align-items:center;gap:10px;padding:10px 18px}
#burger{display:none;background:none;border:none;color:var(--txt);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:18px}
#modelpill{font-size:15px;font-weight:600;color:var(--txt);background:none;border:none;cursor:pointer;padding:6px 8px;border-radius:8px}
#modelpill:hover{background:var(--panel)}
#modelpill span{color:var(--mut);font-weight:400;font-size:12px;margin-left:6px}
#msgs{flex:1;overflow-y:auto;padding:10px 18px 20px;display:flex;flex-direction:column;gap:22px;max-width:768px;width:100%;margin:0 auto}
.msg{max-width:100%;line-height:1.7}
.u{align-self:flex-end;background:var(--panel);padding:10px 16px;border-radius:20px;max-width:80%;font-size:15px}
.a{align-self:stretch}
.arow{display:flex;gap:12px}
.avatar{width:28px;height:28px;min-width:28px;border-radius:50%;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:14px;margin-top:2px}
.abody{flex:1;min-width:0}
/* ===== Kartu Arus ===== */
.card{background:transparent;border:none;padding:0;font-size:15px}
.chead{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.vbadge{display:inline-block;padding:4px 14px;border-radius:99px;font-weight:700;font-size:13px;letter-spacing:.01em}
.v-didukung,.v-layak-didalami,.v-sehat,.v-akumulasi{background:rgba(61,220,132,.14);color:#7bf1a8;border:1px solid rgba(61,220,132,.35)}
.v-campuran,.v-waspada,.v-pantau,.v-indikasi-trap{background:rgba(255,176,32,.13);color:#ffd66e;border:1px solid rgba(255,176,32,.35)}
.v-tak-didukung,.v-distribusi{background:rgba(255,107,107,.12);color:#ff9c9c;border:1px solid rgba(255,107,107,.35)}
.v-data-kurang{background:rgba(180,180,180,.12);color:var(--mut);border:1px solid var(--line)}
.v-info{background:rgba(77,163,255,.12);color:#9cc8ff;border:1px solid rgba(77,163,255,.35)}
.seedpill{font-size:11.5px;color:var(--mut);border:1px solid var(--line);border-radius:99px;padding:3px 10px}
.probwrap{display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:12px 0}
.donut{position:relative;width:52px;height:52px;min-width:52px}
.donut b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px}
.probtxt{font-size:13.5px;color:var(--txt)}.probtxt small{color:var(--mut);display:block;font-size:12px;margin-top:2px}
.narr{font-size:15px;line-height:1.8;color:var(--txt)}
.narr p{margin:8px 0}
.interp{background:rgba(77,163,255,.08);border:1px solid rgba(77,163,255,.28);border-radius:12px;padding:12px 14px;margin:12px 0;font-size:14px;line-height:1.7}
.interp b{color:var(--acc)}
.acaption{font-size:12.5px;color:var(--mut);margin:-2px 0 10px;line-height:1.6}
.sect2{color:var(--acc)}
.sect2:after{background:rgba(77,163,255,.3)}
.awamlist{display:flex;flex-direction:column;gap:10px;margin:10px 0}
.awamitem{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.awamhead{display:flex;align-items:center;gap:8px;font-size:14.5px}
.awamnum{width:22px;height:22px;min-width:22px;border-radius:50%;background:#171717;border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-size:12px;color:var(--mut)}
.awamarti{font-size:13.5px;color:var(--mut);line-height:1.65;margin:6px 0 8px}
.awamkondisi{font-size:14px;line-height:1.7;border-left:3px solid var(--acc);padding-left:10px}
.klabel{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--acc);margin-bottom:2px}
.awamgroup{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:14px 0 6px}
.awamanalogi{font-size:13.5px;color:var(--txt);line-height:1.65;margin:0 0 8px;padding:8px 10px;background:rgba(255,176,32,.07);border:1px dashed rgba(255,176,32,.3);border-radius:9px}
.awamintisari{background:rgba(61,220,132,.08);border:1px solid rgba(61,220,132,.3);border-radius:12px;padding:12px 14px;margin:12px 0;font-size:14px;line-height:1.7}
.furow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}
.fulabel{font-size:12.5px;color:var(--mut)}
.fu{background:transparent;border:1px solid var(--acc);color:var(--acc);border-radius:99px;padding:5px 12px;cursor:pointer;font-size:12.5px}
.fu:hover{background:rgba(77,163,255,.12)}
.sect{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin:20px 0 8px;display:flex;align-items:center;gap:8px}
.sect:after{content:"";flex:1;height:1px;background:var(--line)}
.viz{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin:8px 0}
.vizcap{font-size:13px;color:var(--mut);margin-top:8px;line-height:1.6}
.flow{display:flex;align-items:stretch;gap:0;margin:6px 0 4px;overflow-x:auto;padding-bottom:4px}
.fnode{background:#171717;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;text-align:center;min-width:96px}
.fnode small{display:block;font-weight:400;color:var(--mut);font-size:11px;margin-top:2px}
.fedge{flex:1;min-width:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 4px}
.fedge svg{width:100%;height:26px;display:block}
.fedge span{font-size:11px;color:var(--mut);text-align:center;line-height:1.4}
.anomrow{display:grid;grid-template-columns:62px 1fr 44px;gap:10px;align-items:center;margin:8px 0;font-size:13px}
.scrrow{display:grid;grid-template-columns:26px 70px 1fr auto;gap:8px;align-items:center;background:#171717;border:1px solid var(--line);border-radius:9px;padding:7px 10px;margin:5px 0;font-size:13px}
.scrno{width:22px;height:22px;border-radius:50%;background:var(--panel);border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:var(--mut)}
.scrname{color:var(--mut);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scrval{font-weight:700;color:#9cc8ff}
.frow{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#171717;border:1px solid var(--line);border-radius:9px;padding:8px 11px;margin:5px 0;font-size:13px}
.frow .fmain{min-width:0}
.frow .fmain b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.frow .fsub{color:var(--mut);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.frow .fval{font-weight:700;color:#9cc8ff;white-space:nowrap}
.track{height:10px;background:#171717;border-radius:99px;overflow:hidden}.fill{height:100%;border-radius:99px}
.ev{margin:6px 0;padding:0;list-style:none}
.ev li{display:flex;gap:10px;margin:9px 0;font-size:14px;line-height:1.65;color:#e2e2e2}
.ev .ico{min-width:22px;text-align:center}
.counter{background:rgba(255,176,32,.08);border:1px solid rgba(255,176,32,.3);border-radius:12px;padding:12px 14px;margin:10px 0;font-size:14px;line-height:1.7}
.chipsrow{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.sit{font-size:12px;color:var(--txt);background:#171717;border:1px solid var(--line);border-radius:99px;padding:4px 11px}
.cite{margin:8px 0}
.citebtn{background:var(--panel);border:1px solid var(--line);color:var(--txt);border-radius:11px;padding:9px 13px;cursor:pointer;font-size:13px;width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px}
.citebtn:hover{border-color:var(--mut)}
.citebtn .car{color:var(--mut);font-size:12px}
.cite.open .citebtn{border-radius:11px 11px 0 0;border-bottom:none}
.citepanel{background:var(--panel);border:1px solid var(--line);border-radius:0 0 11px 11px;padding:4px 14px 12px;margin-top:0}
.csect{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:12px 0 6px}
.eplist{display:flex;flex-direction:column;gap:6px}
.eprow{display:flex;align-items:center;gap:8px;background:#171717;border:1px solid var(--line);border-radius:9px;padding:7px 10px}
.eprow code{flex:1;font-size:12px;color:#cfe3ff;font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.etag{font-size:11px;font-weight:700;border-radius:99px;padding:2px 9px;white-space:nowrap}
.etag.live{background:rgba(61,220,132,.13);color:#7bf1a8;border:1px solid rgba(61,220,132,.35)}
.etag.cache{background:rgba(77,163,255,.12);color:#9cc8ff;border:1px solid rgba(77,163,255,.35)}
.cardfoot{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
.abtn{background:none;border:1px solid var(--line);color:var(--mut);border-radius:9px;padding:6px 11px;cursor:pointer;font-size:12.5px}
.abtn:hover{color:var(--txt);border-color:var(--mut)}
.disc{color:#8a8a8a;font-size:11.5px;margin-top:10px}
.meterdots{display:flex;gap:6px;margin:8px 0}.mdot{width:22px;height:8px;border-radius:99px;background:#171717;border:1px solid var(--line)}.mdot.on{background:var(--red);border-color:var(--red)}.mdot.mid{background:var(--amb);border-color:var(--amb)}
/* composer ala ChatGPT */
#box{padding:8px 18px 14px;max-width:768px;width:100%;margin:0 auto}
#suggrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.sug{background:transparent;border:1px solid var(--line);color:var(--txt);border-radius:14px;padding:12px 14px;cursor:pointer;font-size:13.5px;text-align:left;line-height:1.5}
.sug:hover{background:var(--panel)}
.sug small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
#form{display:flex;gap:10px;background:var(--panel);border:none;border-radius:26px;padding:10px 10px 10px 18px;align-items:flex-end;box-shadow:0 2px 12px rgba(0,0,0,.3)}
#q{flex:1;background:none;border:none;color:var(--txt);font-size:15px;resize:none;outline:none;max-height:160px;font-family:inherit;line-height:1.6;padding:8px 0}
#send{background:#fff;border:none;color:#000;font-weight:700;border-radius:50%;width:34px;height:34px;min-width:34px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center}
#send:disabled{opacity:.35}
#disc{text-align:center;color:#8a8a8a;font-size:11.5px;margin-top:10px}
.typing i{display:inline-block;width:7px;height:7px;background:var(--mut);border-radius:50%;margin-right:4px;animation:bl 1s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes bl{0%,100%{opacity:.3}50%{opacity:1}}
.hero{margin:auto;text-align:center;max-width:600px;padding:30px 10px}
.hero .logo{width:52px;height:52px;border-radius:50%;border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:14px}
.hero h2{font-size:26px;font-weight:600;margin:0 0 8px;letter-spacing:-.01em}
.hero p{color:var(--mut);font-size:14.5px;margin:0 0 20px}
.hero .pillrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:18px}
.pill{font-size:12px;border:1px solid var(--line);border-radius:99px;padding:5px 12px;color:var(--mut)}
@media(max-width:760px){#side{position:fixed;z-index:10;height:100vh;transform:translateX(-100%);transition:.2s;width:270px}#side.open{transform:none}#burger{display:block}.u{max-width:92%}#suggrid{grid-template-columns:1fr}}
</style></head><body>
<aside id="side">
<div id="brand"><span class="dot">◍</span> ARUS <small>uang · barang · kuasa</small></div>
<button id="newchat" onclick="newChat()">✎ &nbsp;Chat baru</button>
<input id="search" placeholder="Cari chat…" oninput="filterHist(this.value)">
<div id="hist"></div>
<div id="mem"></div>
</aside>
<div id="main">
<div id="top"><button id="burger" onclick="document.getElementById('side').classList.toggle('open')">☰</button><button id="modelpill">ARUS v7 <span>uang · barang · kuasa ▾</span></button></div>
<div id="msgs"></div>
<div id="box">
<div id="suggrid"></div>
<div id="form"><textarea id="q" rows="1" placeholder="Tanya ticker IDX apa pun… (mis. gimana kabar SMAR? / banding ADRO vs PTBA)"></textarea><button id="send" onclick="send()">↑</button></div>
<div id="disc">ARUS alat riset &amp; edukasi. Bukan nasihat keuangan. Tanpa eksekusi order.</div>
</div>
</div>
<script>
var chatId=null;var ALL=[];
var SUG=[["gimana kabar SMAR?","ticker apa pun, bukan cuma yang demo"],["kenapa ANTM naik dan ex-date kapan?","multi-intent: gerak + kalender"],["banding ADRO vs PTBA","komparasi angka, bukan rekomendasi"],["autopsi portofolio saya","group score dari ownership (simpan dulu daftarnya)"]];
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function cls(v){return "v-"+String(v||"").toLowerCase().replace(/[^a-z-]/g,"")}
function pct01(p){var n=Number(p);if(!isFinite(n))return 0;if(n>1)n=n/100;return Math.max(0,Math.min(1,n))}
function donut(p){var v=pct01(p);var C=2*Math.PI*20;var off=(C*(1-v)).toFixed(1);var col=v>=0.7?"#3ddc84":v>=0.5?"#4da3ff":v>=0.35?"#ffb020":"#ff6b6b";return '<div class="donut"><svg width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="20" fill="none" stroke="#171717" stroke-width="6"/><circle cx="26" cy="26" r="20" fill="none" stroke="'+col+'" stroke-width="6" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off+'" transform="rotate(-90 26 26)"/></svg><b>'+Math.round(v*100)+'%</b></div>'}
function fmtNarr(t){var s=esc(t||"").slice(0,2000);var parts=s.split(/\\.\\s+|\\n+/).filter(function(x){return x.trim().length>0});if(!parts.length)return "<p>—</p>";return parts.slice(0,6).map(function(p){return "<p>"+p.trim()+"</p>"}).join("")}
function verdictTone(v){v=String(v||"").toLowerCase();if(/didukung|layak|sehat|akumulasi/.test(v))return "pos";if(/tak-didukung|distribusi|trap/.test(v))return "neg";return "net"}
function awamBlock(a){
  if(!a||!a.bagian||!a.bagian.length)return '<div class="vizcap">Kartu lama — bagian penjelasan pelan-pelan belum tersimpan. Tanyakan ulang untuk versi lengkap.</div>';
  var h='<div class="interp"> '+esc(a.pembuka||"")+'</div>';
  var groups=[["baik","🟢 Sisi yang mendukung"],["hati","🟡 Yang perlu diperhatikan"],["netral","⚪ Istilah & konteks"]];
  var n=0;
  groups.forEach(function(g){
    var items=(a.bagian||[]).filter(function(x){return (x.nada||"netral")===g[0]});
    if(!items.length)return;
    h+='<div class="awamgroup">'+g[1]+'</div><div class="awamlist">';
    items.forEach(function(x){
      n++;
      h+='<div class="awamitem"><div class="awamhead"><span class="awamnum">'+n+'</span><b>'+esc(x.istilah)+'</b></div>'
        +'<div class="awamarti">'+esc(x.arti)+'</div>'
        +'<div class="awamanalogi">Ibaratnya: '+esc(x.analogi||"")+'</div>'
        +'<div class="awamkondisi"><span class="klabel">Yang terbaca di kartu ini</span>'+esc(x.kondisi)+'</div></div>';
    });
    h+='</div>';
  });
  if(a.intisari)h+='<div class="awamintisari">🎯 <b>Ringkas untuk yang masih baru:</b> '+esc(a.intisari)+'</div>';
  if(a.penutup)h+='<div class="disc">'+esc(a.penutup)+'</div>';
  return h;
}
function sankeySVG(sk,meta){
  var nodes=sk.nodes||[];var edges=sk.edges||[];
  var labels={"commodity":"Komoditas","emiten":"Emiten","kontraktor":"Kontraktor","buyer":"Buyer"};
  var subs={"commodity":(edges[0]&&edges[0].label)||"harga","emiten":"volume","kontraktor":(edges[1]&&edges[1].label)||"","buyer":(meta&&meta.topCountry)||""};
  var h='<div class="flow">';
  nodes.forEach(function(n,i){
    var lb=labels[n]||n;var sb=subs[n]||"";
    h+='<div class="fnode">'+esc(lb)+'<small>'+esc(sb)+'</small></div>';
    if(i<nodes.length-1){h+='<div class="fedge"><svg viewBox="0 0 60 26" preserveAspectRatio="none"><path d="M2 13 C 20 13, 40 13, 58 13" fill="none" stroke="#4da3ff" stroke-width="2.5" stroke-linecap="round"/><path d="M52 8 L58 13 L52 18" fill="none" stroke="#4da3ff" stroke-width="2.5" stroke-linecap="round"/></svg><span>'+esc((edges[i]&&edges[i].label)||"")+'</span></div>'}
  });
  h+='</div>';
  return h}
function dnaViz(r){
  var rep=Math.min(10,Number(r.repeat||0));var h='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="vbadge '+cls(r.label)+'">'+esc(r.label)+'</span><span style="font-size:13px;color:var(--mut)">broker <b style="color:var(--txt)">'+esc(r.broker)+'</b> · repeat <b style="color:var(--txt)">'+esc(r.repeat)+'x</b> / 90 hari</span></div>';
  h+='<div class="meterdots">';for(var i=0;i<10;i++){var on=i<rep;var mid=rep<3&&on;h+='<div class="mdot'+(on?(mid?" mid":" on"):"")+'"></div>'}h+='</div>';
  h+='<div class="vizcap">Makin banyak kotak menyala = makin sering pola jualan berulang. 3x atau lebih = <b>mesin distribusi</b> — perlakukan setiap net-buy-nya dengan curiga.</div>';
  return h}
function anomViz(list){
  var h="";list.slice(0,5).forEach(function(a){var v=Math.max(0,Math.min(1,Number(a.score)||0));var pct=Math.round(v*100);var col=v>=0.7?"var(--red)":v>=0.4?"var(--amb)":"var(--grn)";h+='<div class="anomrow"><b>'+esc(a.symbol)+'</b><div class="track"><div class="fill" style="width:'+pct+'%;background:'+col+'"></div></div><span>'+esc(a.score)+'</span></div>'});return h}
function clusterViz(cl){
  var n=Number(cl.n||0);var dots="";for(var i=0;i<Math.min(7,n);i++){dots+='<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:'+(cl.flag?"var(--red)":"var(--grn)")+';margin-right:6px"></span>'}
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="vbadge '+(cl.flag?"v-distribusi":"v-sehat")+'">'+(cl.flag?"⚑ "+esc(cl.kind||"cluster"):"✓ tidak ada cluster")+'</span><span style="font-size:13px;color:var(--mut)">'+n+' insider-sell terpantau</span></div><div style="margin-top:8px">'+dots+'</div>'}
function flowViz(f){
  var rows=[["Ritel",f.retailNetM],["Institusi/asing",f.institusiNetM],["Asing 90hr",f.asingNetM]];
  var max=1;rows.forEach(function(r){max=Math.max(max,Math.abs(Number(r[1])||0))});
  return rows.map(function(r){var v=Number(r[1])||0;var pct=Math.round(Math.abs(v)/max*100);var col=v>=0?"var(--grn)":"var(--red)";
    return '<div class="anomrow"><b style="font-size:12px">'+r[0]+'</b><div class="track"><div class="fill" style="width:'+pct+'%;background:'+col+'"></div></div><span style="font-size:12px">'+(v>=0?"+":"")+v+'M</span></div>'}).join("")
    +'<div class="vizcap">Net buy hijau / net sell merah (Rp juta) · window broker '+(f.windowDays||0)+' hari · asing 90 hari. Angka dari broker-summary + foreign-flow.</div>'}
function groupsViz(gs,score){
  var h='<div class="meta">Group Score <b>'+(score||0)+'</b> — % nilai portofolio yang ternyata satu pengendali</div>';
  (gs||[]).forEach(function(g){h+='<div class="anomrow" style="grid-template-columns:110px 1fr 44px"><b style="font-size:12px">'+esc(g.name)+'</b><div class="track"><div class="fill" style="width:'+Math.min(100,g.pct||0)+'%;background:var(--amb)"></div></div><span style="font-size:12px">'+(g.pct||0)+'%</span></div><div style="font-size:12px;color:var(--mut);margin:-4px 0 8px 118px">'+esc((g.tickers||[]).join(", "))+'</div>'});
  return h}
function compareViz(list){
  var max=1;(list||[]).forEach(function(x){max=Math.max(max,Math.abs(Number(x.ret30)||0))});
  return (list||[]).map(function(x){var v=Number(x.ret30)||0;var pct=Math.round(Math.abs(v)/max*100);var col=v>=0?"var(--grn)":"var(--red)";
    return '<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><b>'+esc(x.ticker)+'</b><span>'+esc(x.price)+' · 30hr '+(v>=0?"+":"")+v+'%</span></div><div class="track"><div class="fill" style="width:'+pct+'%;background:'+col+'"></div></div><div style="font-size:12px;color:var(--mut)">7hr '+((x.ret7>=0)?"+":"")+x.ret7+'% · 90hr '+((x.ret90>=0)?"+":"")+x.ret90+'% · vol '+x.volMult+'x · FOMO '+(x.fomo==null?"-":x.fomo)+' · '+esc(x.liq||"")+'</div></div>'}).join("")}
function screenViz(s){
  return (s.rows||[]).map(function(r,i){
    return '<div class="scrrow"><span class="scrno">'+(i+1)+'</span><b>'+esc(r.symbol)+'</b><span class="scrname">'+esc(r.name)+'</span><span class="scrval">'+esc(r.disp==null?"-":r.disp)+'</span></div>';
  }).join("")+'<div class="vizcap">Urut '+esc(s.orderBy||"")+' · where "'+esc(s.where||"-")+'" · angka apa adanya dari Sectors screener (include_query_values), 1kr, bukan hitungan ARUS.</div>';}
function fundViz(f){
  var rows=(f.rows||[]).map(function(r){
    return '<div class="frow"><div class="fmain"><b>'+esc(r.label||"")+'</b>'+(r.name?'<div class="fsub">'+esc(r.name)+'</div>':'')+'</div>'+(r.disp?'<span class="fval">'+esc(r.disp)+'</span>':'')+'</div>';
  }).join("");
  var head=f.subtitle?'<div class="vizcap" style="margin-top:0">'+esc(f.subtitle)+'</div>':'';
  return head+rows+(f.note?'<div class="vizcap">'+esc(f.note)+'</div>':'');
}
function rantaiViz(r){
  var rows=(r.edges||[]).map(function(e){
    return '<div class="frow"><div class="fmain"><b>'+esc(e.from)+' → '+esc(e.to)+'</b><div class="fsub">'+esc(e.label)+'</div></div></div>';
  }).join("");
  return rows+(r.note?'<div class="vizcap">'+esc(r.note)+'</div>':'');
}
function metricPills(bukti){
  var pills=[];var j=bukti.join("\\n");
  var m3=j.match(/FOMO\\s+(\\d+)/);if(m3)pills.push("🔥 FOMO "+m3[1]);
  var m4=j.match(/Yield terakhir\\s+([0-9.]+)%/);if(m4)pills.push("💰 Yield "+m4[1]+"%");
  var m2=j.match(/→\\s*(sangat likuid|likuid|cukup|tipis)/);if(m2)pills.push("≈ "+m2[1]);
  var m1=j.match(/broker kohort ritel net-(buy|sell)\\s+Rp\\s*([0-9.]+)\\s*([MT])/);if(m1)pills.push("◉ Ritel "+m1[1]+" Rp"+m1[2]+m1[3]);
  var m5=j.match(/institusi\\/asing net-(buy|sell)\\s+Rp\\s*([0-9.]+)\\s*([MT])/);if(m5)pills.push(" Institusi "+m5[1]+" Rp"+m5[2]+m5[3]);
  if(!pills.length)return "";
  return '<div class="chipsrow">'+pills.map(function(p){return '<span class="sit">'+esc(p)+'</span>'}).join("")+'</div>'}
function citeDropdown(k){
  var sits=k.sitasi||[];var led=k.ledger||[];
  var h='<div class="cite"><button class="citebtn" onclick="toggleCite(this)"><span>📎 Sitasi &amp; endpoint · '+sits.length+' sitasi · '+led.length+' call Sectors</span><span class="car">▾</span></button><div class="citepanel" style="display:none">';
  h+='<div class="csect">Sitasi — data yang dikutip di kartu</div>';
  h+=sits.length?('<div class="chipsrow">'+sits.map(function(s){return '<span class="sit">📎 '+esc(s)+'</span>'}).join("")+'</div>'):'<div class="vizcap">—</div>';
  h+='<div class="csect">Endpoint Sectors yang ditembak ('+led.length+')</div>';
  if(led.length){
    h+='<div class="eplist">'+led.map(function(e){var tag=e.cached?'<span class="etag cache">cache · 0kr</span>':'<span class="etag live">'+esc(e.cost)+'kr</span>';var note=e.note?' <span class="etag cache">'+esc(e.note)+'</span>':'';return '<div class="eprow"><code title="'+esc(e.endpoint)+'">'+esc(e.endpoint)+'</code>'+tag+note+'</div>'    }).join("")+'</div>';
  }else{h+='<div class="vizcap">Respons lama — rincian endpoint tidak tersimpan. Sitasi di atas tetap menunjukkan sumber datanya.</div>'}
  h+='</div></div>';
  return h;
}
function toggleCite(btn){var box=btn.parentElement;var p=btn.nextElementSibling;var open=p.style.display!=="none";p.style.display=open?"none":"block";box.classList.toggle("open",!open);var c=btn.querySelector(".car");if(c)c.textContent=open?"▾":"▴"}
function renderKartu(k){
  var tone=verdictTone(k.verdict);
  var h='<div class="chead"><span class="vbadge '+cls(k.verdict)+'">'+esc(k.verdict)+'</span>';
  if(k.subjek)h+='<span class="seedpill">'+esc(k.subjek)+'</span>';
  if(k.seed)h+='<span class="seedpill">SEED · data contoh</span>';
  h+='<span style="font-size:12.5px;color:var(--mut)">'+esc(k.kredit||"")+' · '+esc(k.narrator||"")+(k.audit&&k.audit.router?' · router '+esc(k.audit.router)+(k.audit.intents?' ['+esc((k.audit.intents||[]).join("+"))+']':''):'')+'</span></div>';
  h+='<div class="probwrap">'+donut(k.probability)+'<div class="probtxt"><b>Keyakinan model '+Math.round(pct01(k.probability)*100)+'%</b><small>'+(tone==="pos"?"Arus cenderung mendukung cerita.":tone==="neg"?"Arus tidak mendukung cerita yang beredar.":"Sinyal campur — belum ada arah dominan.")+' Probabilitas = kekuatan bukti, bukan ramalan harga.</small></div></div>';
  h+='<div class="sect sect1">📐 Bagian 1 · Data faktual — untuk yang sudah paham</div>';
  h+='<div class="acaption">Angka, aliran, dan sitasi apa adanya untuk dibaca dengan istilah pasar. Bagian 2 di bawah menjelaskan tiap istilahnya pelan-pelan.</div>';
  h+='<div class="narr">'+fmtNarr(k.narasi||"")+'</div>';
  var v=k.visual||{};var hasViz=false;var vh="";
  if(v.sankey&&v.sankey.nodes){hasViz=true;vh+='<div class="sect">⛓️ Rantai barang</div><div class="viz">'+sankeySVG(v.sankey,v.sankey.meta||null)+'<div class="vizcap">Alur komoditas → emiten → kontraktor → buyer. '+(v.sankey.meta?('Pembeli terbesar: <b>'+esc(v.sankey.meta.topCountry||"?")+'</b> · '+esc(v.sankey.meta.prod||"")):"")+'</div></div>'}
  if(v.radar){hasViz=true;vh+='<div class="sect">🕵️ DNA broker</div><div class="viz">'+dnaViz(v.radar)+'</div>'}
  if(v.anoms&&v.anoms.length){hasViz=true;vh+='<div class="sect">📡 Anomali pasar (GNN-lite)</div><div class="viz">'+anomViz(v.anoms)+'<div class="vizcap">Skor 0–1: makin tinggi = makin jalan sendiri dibanding kohortnya. Di atas 0,7 layak diwaspadai.</div></div>'}
  if(v.cluster){hasViz=true;vh+='<div class="sect">⚑ Arus kuasa</div><div class="viz">'+clusterViz(v.cluster)+'</div>'}
  if(v.flow){hasViz=true;vh+='<div class="sect">💸 Arus uang</div><div class="viz">'+flowViz(v.flow)+'</div>'}
  if(v.groups){hasViz=true;vh+='<div class="sect">🏢 Grup kepemilikan</div><div class="viz">'+groupsViz(v.groups,v.groupScore)+'</div>'}
  if(v.compare&&v.compare.length){hasViz=true;vh+='<div class="sect">⚖️ Banding</div><div class="viz">'+compareViz(v.compare)+'</div>'}
  if(v.screen){hasViz=true;vh+='<div class="sect">🔎 Screener Sectors — '+esc(v.screen.label||"")+'</div><div class="viz">'+screenViz(v.screen)+'</div>'}
  if(v.fund){hasViz=true;vh+='<div class="sect">📊 '+esc(v.fund.title||"Fundamental")+'</div><div class="viz">'+fundViz(v.fund)+'</div>'}
  if(v.entitas){hasViz=true;vh+='<div class="sect">🧩 '+esc(v.entitas.title||"Cari emiten")+'</div><div class="viz">'+fundViz(v.entitas)+'</div>'}
  if(v.rantai&&v.rantai.edges&&v.rantai.edges.length){hasViz=true;vh+='<div class="sect">🔗 '+esc(v.rantai.title||"Rantai relasi")+'</div><div class="viz">'+rantaiViz(v.rantai)+'</div>'}
  if(v.ranking){hasViz=true;vh+='<div class="sect">🏆 '+esc(v.ranking.title||"Peringkat")+'</div><div class="viz">'+fundViz(v.ranking)+'</div>'}
  var mp=metricPills(k.bukti||[]);if(mp){hasViz=true;vh+='<div class="sect">📊 Metrik arus</div><div class="viz">'+mp+'<div class="vizcap">Ringkasan angka kunci dari bukti di bawah — kohort (uang), likuiditas, FOMO, yield, dan aliran asing.</div></div>'}
  if(hasViz)h+=vh;
  if(k.bukti&&k.bukti.length){h+='<div class="sect">🧾 Bukti berbasis data</div><ul class="ev">'+k.bukti.map(function(b,i){var ic=/Divergence|⚑|trap|distribusi/i.test(b)?"⚠️":/\\+|akumulasi|sehat|likuid/i.test(b)?"✅":"•";return '<li><span class="ico">'+ic+'</span><span>'+esc(b)+'</span></li>'}).join("")+'</ul>'}
  h+='<div class="counter">🥊 <b>Sisi lain (bantahan):</b> '+esc(k.counter||"-")+'</div>';
  h+=citeDropdown(k);
  h+='<div class="sect sect2">🧑🏫 Bagian 2 · Pelan-pelan — artinya apa</div>';
  h+='<div class="acaption">Penjelasan per istilah untuk yang baru ikut investasi: maksudnya apa, dan apa yang terbaca dari kondisi ini. Berisi penjelasan, bukan ajakan beli/jual.</div>';
  h+=awamBlock(k.awam);
  if(k.lanjutan&&k.lanjutan.length)h+='<div class="furow"><span class="fulabel">💬 Lanjut tanya:</span>'+k.lanjutan.map(function(x){return '<button class="fu" data-q="'+esc(x)+'" onclick="ask(this.dataset.q)">'+esc(x)+'</button>'}).join("")+'</div>';
  h+='<div class="cardfoot"><button class="abtn" onclick="copyCard(this)">&#128203; Salin</button>';
  if(k.share)h+='<a class="abtn" style="text-decoration:none" href="'+esc(k.share)+'" target="_blank">🔗 Bagikan kartu</a>';
  h+='</div><div class="disc">Alat riset &amp; edukasi. Bukan nasihat keuangan. Verdict probabilistik dari join data Sectors.</div>';
  return h;
}
function addMsg(role,html){var m=document.getElementById("msgs");var d=document.createElement("div");d.className="msg "+(role==="user"?"u":"a");if(role==="user"){d.innerHTML=html}else{d.innerHTML='<div class="arow"><div class="avatar">◍</div><div class="abody"><div class="card">'+html+'</div></div></div>'}m.appendChild(d);m.scrollTop=m.scrollHeight;return d}
function showEmpty(){document.getElementById("msgs").innerHTML='<div class="hero"><div class="logo">◍</div><h2>Ikan kecil lihat harga.<br>ARUS lihat arus.</h2><p>uang · barang · kuasa — dari data Sectors, dengan sitasi.<br>Tanya rumor, broker, dividen, atau rantai komoditas.</p><div class="pillrow"><span class="pill">tanpa login</span><span class="pill">&lt; 60 detik</span><span class="pill">dengan sitasi</span><span class="pill">ada bantahan</span></div></div>';paintSug()}
function paintSug(){var el=document.getElementById("suggrid");if(document.querySelector("#msgs .msg")){el.innerHTML="";el.style.display="none";return}el.style.display="grid";el.innerHTML=SUG.map(function(s){return '<button class="sug" onclick="ask(this.dataset.q)" data-q="'+esc(s[0])+'">'+esc(s[0])+'<small>'+esc(s[1])+'</small></button>'}).join("")}
function paintChips(){}
function groupDay(ts){var d=new Date(ts);var now=new Date();var y=new Date(now);y.setDate(now.getDate()-1);var ds=d.toISOString().slice(0,10);if(ts.slice(0,10)===now.toISOString().slice(0,10))return "Hari ini";if(ts.slice(0,10)===y.toISOString().slice(0,10))return "Kemarin";return ds}
async function refreshHist(){
  try{var r=await fetch("/api/chats");var list=await r.json();ALL=list;
  var h="",lastDay="";
  list.forEach(function(c){
    var day=groupDay(c.updatedAt||"");
    if(day!==lastDay){h+='<div class="day">'+esc(day)+'</div>';lastDay=day}
    h+='<button class="hitem'+(c.id===chatId?" on":"")+'" onclick="openChat(\\''+c.id+'\\')"><span>'+esc(c.title||"Chat")+'</span><span class="hdel" onclick="event.stopPropagation();delChat(\\''+c.id+'\\')">×</span></button>';
  });
  document.getElementById("hist").innerHTML=h||'<div class="day">belum ada riwayat</div>';
  var m=await (await fetch("/api/memory")).json();
  document.getElementById("mem").innerHTML="🧠 memori: "+esc(m.ringkas||(m.nPola+" pola ditangkap"))+(m.watchlist&&m.watchlist.length&&!m.ringkas?" · watch: "+esc(m.watchlist.join(", ")):"");
  }catch(e){}
}
function filterHist(q){q=(q||"").toLowerCase();var btns=document.querySelectorAll(".hitem");btns.forEach(function(b){b.style.display=b.textContent.toLowerCase().indexOf(q)>=0?"":"none"})}
function newChat(){chatId=null;document.getElementById("ctitle");var t=document.getElementById("modelpill");if(t)t.innerHTML='ARUS v7 <span>uang · barang · kuasa ▾</span>';showEmpty();refreshHist();if(window.innerWidth<760)document.getElementById("side").classList.remove("open")}
async function openChat(id){
  var r=await fetch("/api/chats/"+id);if(!r.ok)return;var c=await r.json();
  chatId=c.id;var m=document.getElementById("msgs");m.innerHTML="";
  c.messages.forEach(function(x){
    if(x.role==="user")addMsg("user",esc(x.q));
    else if(x.kartu)addMsg("assistant",renderKartu(x.kartu));
  });
  paintSug();refreshHist();if(window.innerWidth<760)document.getElementById("side").classList.remove("open");
}
async function delChat(id){if(!confirm("Hapus chat ini?"))return;await fetch("/api/chats/"+id,{method:"DELETE"});if(id===chatId)newChat();else refreshHist()}
function ask(t){document.getElementById("q").value=t;send()}
function copyCard(btn){try{var txt=btn.closest(".card").innerText;navigator.clipboard.writeText(txt);btn.textContent="✓ Tersalin";setTimeout(function(){btn.textContent="⧉ Salin"},1500)}catch(e){}}
async function send(){
  var ta=document.getElementById("q");var q=ta.value.trim();if(!q)return;
  ta.value="";ta.style.height="auto";document.getElementById("send").disabled=true;
  if(!document.querySelector("#msgs .msg"))document.getElementById("msgs").innerHTML="";
  paintSug();
  addMsg("user",esc(q));
  var tp=addMsg("assistant",'<span class="typing"><i></i><i></i><i></i></span> <span style="color:var(--mut);font-size:13px">menganalisis arus uang · barang · kuasa…</span>');
  try{
    var r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({q:q,chatId:chatId})});
    var k=await r.json();
    if(k.chatId){chatId=k.chatId}
    var card=tp.querySelector(".card");if(card){card.innerHTML=r.ok?renderKartu(k):("⚠️ "+esc(k.error||"gagal"))}else{tp.innerHTML=r.ok?renderKartu(k):("⚠️ "+esc(k.error||"gagal"))}
  }catch(e){var card2=tp.querySelector(".card");if(card2)card2.innerHTML="⚠️ jaringan bermasalah";else tp.innerHTML="⚠️ jaringan bermasalah"}
  document.getElementById("send").disabled=false;refreshHist();
}
document.getElementById("q").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}});
document.getElementById("q").addEventListener("input",function(){this.style.height="auto";this.style.height=Math.min(160,this.scrollHeight)+"px"});
showEmpty();refreshHist();
</script></body></html>`);
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.VITEST !== "1") {
  app.listen(port, () => console.log(`ARUS v7 di :${port}`));
}
export default app;
