// mcp/server.ts — 8 tools dengan parameter yang BENAR-BENAR dipakai. Pipeline sama dengan chat:
// resolusi → evidence Sectors → compute code → credit guard. Cabut Sectors = MCP mati (kill test).
import "../lib/envfix.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CreditSession } from "../lib/credit.js";
import { chat } from "../lib/orchestrator.js";
import { getterFor, fetchBrokerActivity, fetchCommodityPrice, fetchDaily, fetchFilings, fetchMiningPerformance, fetchReport, fetchSalesDestination } from "../lib/evidence.js";
import { computeBarang, pctFromDailyVolume, pctFromPriceSeries } from "../lib/barang.js";
import { fingerprintBroker, touchesFromActivity } from "../lib/dna.js";
import { detectCluster, eventsFromFilings } from "../lib/kuasa.js";
import { fomoMeter, returnsFromDaily } from "../lib/metrics.js";
import { autopsiKartu, clusterOwnerships, egoGraph, knownMembers, loadOwnerships } from "../lib/graph.js";
import { miningSlug, resolveSlug } from "../lib/slugs.js";

const server = new McpServer({ name: "arus", version: "6.0.0" });
const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }) }], isError: true });

async function runChat(q: string) {
  const s = new CreditSession("mcp-" + Date.now());
  return chat(q, s);
}

server.tool("kohort_flow", { symbol: z.string().describe("ticker IDX, mis. SMAR") }, async ({ symbol }) => {
  try { return text(await runChat(`kenapa ${symbol} gerak?`)); } catch (e) { return fail(e); }
});

server.tool("group_neighborhood", { symbol: z.string().describe("ticker IDX") }, async ({ symbol }) => {
  try {
    const s = new CreditSession("mcp-" + Date.now());
    const get = getterFor(s);
    const sym = symbol.toUpperCase();
    const { own } = await loadOwnerships(get, [sym]);
    const clusters = clusterOwnerships(own);
    const label = clusters.get(sym) ?? "";
    const peers = label ? knownMembers(label).filter((t) => t !== sym).slice(0, 4) : [];
    const peerOwn = peers.length ? (await loadOwnerships(get, peers)).own : [];
    return text({ symbol: sym, group: label || null, graph: egoGraph(sym, clusters, [...own, ...peerOwn]), kredit: s.badge(), seed: false, catatan: "kemungkinan relasi dari company-report §ownership; bukan sumber relasi selain data" });
  } catch (e) { return fail(e); }
});

server.tool("fomo_meter", { symbol: z.string().describe("ticker IDX") }, async ({ symbol }) => {
  try {
    const s = new CreditSession("mcp-" + Date.now());
    const get = getterFor(s);
    const d = await fetchDaily(get, symbol.toUpperCase(), 90);
    if (!d.data) return text({ ok: false, error: d.err ?? "data harian tidak tersedia" });
    const f = fomoMeter({ daily: d.data });
    return text({ symbol: symbol.toUpperCase(), fomo: f, returns: returnsFromDaily(d.data), kredit: s.badge(), seed: d.seed });
  } catch (e) { return fail(e); }
});

server.tool("rumor_verdict", { text: z.string().describe("teks rumor/pompom apa adanya") }, async ({ text: rumor }) => {
  try { return text(await runChat(rumor)); } catch (e) { return fail(e); }
});

server.tool("portfolio_group_score", { symbols: z.string().describe("ticker dipisah spasi/koma, maks 5") }, async ({ symbols }) => {
  try {
    const s = new CreditSession("mcp-" + Date.now());
    const get = getterFor(s);
    const list = symbols.toUpperCase().split(/[\s,]+/).filter((t) => /^[A-Z]{4}$/.test(t)).slice(0, 5);
    if (list.length < 2) return text({ ok: false, error: "butuh ≥2 ticker" });
    const { own, seed } = await loadOwnerships(get, list);
    return text({ ...autopsiKartu(list.map((t) => ({ ticker: t, pct: Math.round((100 / list.length) * 10) / 10 })), own), kredit: s.badge(), seed });
  } catch (e) { return fail(e); }
});

server.tool("commodity_chain", { slug: z.string().describe("slug emiten (adaro/antam/...) atau komoditas (coal/nickel)") }, async ({ slug }) => {
  try {
    const s = new CreditSession("mcp-" + Date.now());
    const get = getterFor(s);
    const ref = resolveSlug(slug);
    const sym = ref && /^[A-Z]{4}$/.test(ref.symbol) ? ref.symbol : ref?.symbol === "COAL" ? "ADRO" : ref?.symbol === "NICKEL" ? "ANTM" : null;
    const commodity: "coal" | "nickel" = slug.match(/nikel|nickel/i) || sym === "ANTM" || sym === "INCO" ? "nickel" : "coal";
    const priceE = await fetchCommodityPrice(get, commodity);
    let pct = 0;
    try { pct = priceE.data ? pctFromPriceSeries(priceE.data) : 0; } catch { pct = 0; }
    if (!sym) return text({ ok: false, error: `slug "${slug}" tidak dikenal (contoh: adaro, antam, brms, coal, nickel)` });
    const dailyE = await fetchDaily(get, sym, 90);
    let volPct = 0;
    try { volPct = pctFromDailyVolume(dailyE.data ?? []); } catch { volPct = 0; }
    const mslug = miningSlug(sym);
    const [salesE, perfE] = mslug ? await Promise.all([fetchSalesDestination(get, mslug), fetchMiningPerformance(get, mslug)]) : [null, null];
    let topCountryShare: number | undefined;
    if (salesE?.data) {
      let best = 0;
      for (const v of Object.values(salesE.data.data ?? {})) { const p = v.percentage_of_sales_volume ?? v.percentage_of_total_revenue ?? 0; if ((p ?? 0) > best) best = p ?? 0; }
      if (best > 0) topCountryShare = Math.round(best) / 100;
    }
    let stripDelta: number | undefined;
    const rows = [...(perfE?.data?.data ?? [])].filter((r) => typeof r.strip_ratio === "number").sort((a, b) => a.year - b.year);
    if (rows.length >= 2) stripDelta = Math.round(((rows[rows.length - 1]!.strip_ratio ?? 0) - (rows[rows.length - 2]!.strip_ratio ?? 0)) * 100) / 100;
    return text({ slug, symbol: sym, commodity, ...computeBarang({ commodityPct12m: pct, volumePct: volPct, stripDelta, topCountryShare }), kredit: s.badge(), seed: priceE.seed || dailyE.seed || (salesE?.seed ?? false) || (perfE?.seed ?? false) });
  } catch (e) { return fail(e); }
});

server.tool("broker_dna", { code: z.string().describe("kode broker 2 huruf, mis. YP") }, async ({ code }) => {
  try {
    const s = new CreditSession("mcp-" + Date.now());
    const get = getterFor(s);
    const c = code.toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return text({ ok: false, error: "kode broker harus 2 huruf" });
    const actE = await fetchBrokerActivity(get, c, 14);
    if (!actE.data) return text({ ok: false, error: actE.err ?? "broker-activity tidak tersedia" });
    const { touches, foreignShare } = touchesFromActivity(c, actE.data);
    const repeatDays = (actE.data.data ?? []).filter((d) => (d.summary ?? []).some((x) => (x.nval ?? 0) < 0)).length;
    return text({ ...fingerprintBroker(c, touches, { foreignShare, historyRepeat: repeatDays, windowDays: 14 }), kredit: s.badge(), seed: actE.seed });
  } catch (e) { return fail(e); }
});

server.tool("event_cluster", { sector: z.string().describe("slug sektor, mis. bank / mining / plantation") }, async ({ sector }) => {
  try {
    const s = new CreditSession("mcp-" + Date.now());
    const get = getterFor(s);
    const filE = await fetchFilings(get, null, 14);
    if (!filE.data) return text({ ok: false, error: filE.err ?? "filings tidak tersedia" });
    const want = sector.toLowerCase();
    const all = eventsFromFilings(filE.data);
    const scoped = all.filter((e) => e.sector === want);
    return text({ sector: want, ...detectCluster(scoped), n: scoped.length, n_universe: all.length, kredit: s.badge(), seed: filE.seed });
  } catch (e) { return fail(e); }
});

const transport = new StdioServerTransport();
await server.connect(transport);