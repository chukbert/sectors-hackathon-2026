// lib/orchestrator.ts — resolusi subjek → evidence → compute → verifier → decider → bantah → sintesis → guard → memori.
// Aturan: LLM tidak pernah menghitung; setiap klaim angka diuji ulang; live gagal = "data tidak tersedia", bukan karangan.
import { CreditSession } from "./credit.js";
import type { Intent } from "./router.js";
import { heuristicPlan, planQuery, type Plan } from "./planner.js";
import { clarificationText, parsePortfolio, plausibleTickers, portfolioSourceNote, resolveTickers } from "./resolve.js";
import {
  evidenceOk, fetchBrokerActivity, fetchBrokerSummary, fetchCommodityPrice, fetchCorporateActions, fetchDaily, fetchFilings,
  fetchForeignFlow, fetchIndexDaily, fetchIndustries, fetchMiningPerformance, fetchNews, fetchQuarterly, fetchRegistry,
  fetchReport, fetchSalesDestination, fetchScreener, fetchSegments, fetchSubindustries, fetchSubsectors, fetchSuspensions,
  getterFor, type CorporateActions,
} from "./evidence.js";
import { computeFlow, dividendFromReport, fomoMeter, lastTradingDay, liquidityFromDaily, maxDrawdownPct, returnsFromDaily, type DailyRow, type FilingRow } from "./metrics.js";
import { autopsiKartu, loadOwnerships } from "./graph.js";
import { computeBarang, pctFromDailyVolume, pctFromPriceSeries } from "./barang.js";
import { fingerprintBroker, touchesFromActivity } from "./dna.js";
import { detectCluster, detectRightsWave, eventsFromFilings } from "./kuasa.js";
import { anomalyScores } from "./gnn.js";
import { verifyGrounding } from "./ground.js";
import { bantah } from "./decider.js";
import { DISCLAIMER, guardText } from "./guard.js";
import { counterLlm, followUps, MODEL, narrate, tutorAwam } from "./synthesis.js";
import { miningSlug } from "./slugs.js";
import { fmtNum, fmtRatioPct, fmtRp, fundQueryFor, latestValuation, parseFundamental, quarterLabel, type FundMode, type ValuationLike } from "./fundamental.js";
import { detectSectorWord, fmtScreenValue, matchSector, parseScreen, screenFromCompiled, SCREEN_LABELS, sectorLabel, type ScreenInput, type SectorFilter } from "./screener.js";
import { addDecision, addPola, addWatch, chasePattern, getPortfolio, getWatchlist, setPortfolio } from "./memory.js";
import {
  anomaliPart, bandingPart, buildAwam, buyerPart, clusterPart, dividenPart, dnaPart, drawdownPart, fomoPart, grupPart,
  hargaVolumePart, ihsgPart, kalenderPart, kinerjaPart, kohortPart, komoditasPart, lanjutanFor, likuiditasPart, manajemenPart,
  peerPart, p, produksiPart, prospekPart, segmenPart, suspensiPart, tentangPart, tahunanPart, valuasiPart, volumeEmitenPart,
  type Awam, type AwamBagian,
} from "./awam.js";

export interface Kartu {
  verdict: string;
  probability: number;
  conf: number;
  narasi: string;
  narrator: string;
  bukti: string[];
  counter: string;
  counterVia?: string;
  sitasi: string[];
  visual?: unknown;
  kredit: string;
  ledger: unknown[];
  seed: boolean;
  disclaimer: string;
  subjek?: string;
  awam?: Awam;
  awamVia?: string;
  lanjutan?: string[];
  audit?: {
    sumber: number; gagal: number; grounded: boolean; router?: string; intents?: string[]; catatan?: string; ungrounded?: string[];
    llmTutor?: string; llmCounter?: string; llmLanjutan?: string;
  };
}

const COAL_SYMBOLS = new Set(["ADRO", "PTBA", "ITMG", "BUMI", "BYAN", "HRUM", "SGER", "TOBA", "BSSR", "MYOH", "GTBO", "INDY"]);
const NICKEL_SYMBOLS = new Set(["ANTM", "INCO", "NCKL", "MBMA", "NIKL", "PSAB"]);
const commodityFor = (sym: string, q: string): "coal" | "nickel" => {
  if (q.match(/nikel|nickel/i) || NICKEL_SYMBOLS.has(sym)) return "nickel";
  if (q.match(/coal|batubara|batu bara/i) || COAL_SYMBOLS.has(sym)) return "coal";
  return "coal";
};

function counterFor(verdict: string, ctx: { sym?: string; dist?: boolean; asingStreak?: number; mdd?: number }): string {
  if (verdict === "distribusi")
    return `Bantahan: bisa jadi rotasi sektoral biasa — asing net-jual ${ctx.asingStreak ?? 0} hari beruntun; cek kalender ex-date ${ctx.sym ?? ""} sebelum vonis.`;
  if (verdict === "tak-didukung")
    return `Bantahan: euforia bisa lanjut lebih lama dari dugaan; ukuran volume EOD mungkin tertinggal — cek filing insider ${ctx.sym ?? ""} terbaru.`;
  if (verdict === "indikasi-trap")
    return `Bantahan: yield tinggi bisa valid bila laba pulih — cek laporan kuartal terbaru sebelum menyimpulkan.`;
  if (verdict === "waspada")
    return `Bantahan: tekanan bisa berbalik bila asing kembali masuk; drawdown 90hr ${ctx.mdd ?? 0}% bukan ramalan ke depan.`;
  return "Bantahan: data EOD, bukan realtime — keputusan final tetap di tanganmu.";
}

interface Build {
  verdict: string;
  probability: number;
  confHint: number;
  bukti: string[];
  sitasi: string[];
  visual?: unknown;
  pool: unknown[];
  needs: number;
  ok: number;
  counterCtx?: { sym?: string; dist?: boolean; asingStreak?: number; mdd?: number };
  info?: boolean;
  seed?: boolean;
  awam?: AwamBagian[];
}

function flowSentences(f: ReturnType<typeof computeFlow>): string[] {
  if (!f) return [];
  const out: string[] = [];
  const Mx = (x: number) => (Math.abs(x) >= 1000 ? `Rp ${Math.round(x / 10) / 100} T` : `Rp ${Math.abs(x)} M`);
  out.push(`broker kohort ritel net-${f.retailNetM >= 0 ? "buy" : "sell"} ${Mx(f.retailNetM)} · institusi/asing net-${f.institusiNetM >= 0 ? "buy" : "sell"} ${Mx(Math.abs(f.institusiNetM))} (${f.windowDays} hari, ${f.nBrokers} broker)`);
  if (f.asingSellStreak >= 3) out.push(`asing net-jual ${f.asingSellStreak} hari beruntun (90hr: ${f.asingNetM >= 0 ? "+" : "−"}${Mx(Math.abs(f.asingNetM))})`);
  if (f.distribusiRitel) out.push(`⚑ harga naik + uang besar keluar + ritel masuk = pola distribusi ke kohort ritel`);
  if (f.insiderSold) out.push(`⚑ filing insider menjual terdeteksi dalam window`);
  if (f.topBuyers[0]) out.push(`top net-buy: ${f.topBuyers[0].code} ${Mx(f.topBuyers[0].netM)} · top net-sell: ${f.topSellers[0]?.code ?? "-"} ${Mx(Math.abs(f.topSellers[0]?.netM ?? 0))}`);
  return out;
}

async function buildGerak(intent: Intent, sym: string, q: string, session: CreditSession): Promise<Build> {
  const get = getterFor(session);
  const [dailyE, regE, brokerE, foreignE, filingsE, suspE] = await Promise.all([
    fetchDaily(get, sym, 90),
    fetchRegistry(get),
    fetchBrokerSummary(get, sym, 7),
    fetchForeignFlow(get, sym, 90),
    fetchFilings(get, sym, 14),
    intent === "risiko" ? fetchSuspensions(get, sym) : Promise.resolve({ data: null, seed: false, ok: false } as const),
  ]);
  const daily = dailyE.data ?? [];
  const ret = returnsFromDaily(daily);
  const flow = computeFlow({
    summary: brokerE.data?.data ?? [], registry: regE.data ?? [], foreign: foreignE.data?.data ?? [],
    filings: (filingsE.data?.results ?? []) as FilingRow[], priceUp: (ret?.ret7 ?? 0) > 0,
  });
  const fomo = fomoMeter({ daily, asingSellStreak: flow?.asingSellStreak, insiderSold: flow?.insiderSold });
  const bukti: string[] = [];
  const sitasi: string[] = [];
  if (ret) bukti.push(`${sym} ${ret.price} (${ret.ret7 >= 0 ? "+" : ""}${ret.ret7}% 7hr · ${ret.ret30 >= 0 ? "+" : ""}${ret.ret30}% 30hr · ${ret.ret90 >= 0 ? "+" : ""}${ret.ret90}% 90hr), volume ${ret.volMult}x rerata (daily/${sym} 90hr)`);
  sitasi.push(`daily/${sym}/ 90hr`);
  if (flow) {
    bukti.push(...flowSentences(flow));
    sitasi.push(`broker-summary/${sym}/ 7hr`, `foreign-flow/${sym}/ 90hr`);
  }
  if (fomo) bukti.push(`FOMO ${fomo.score} (${fomo.label}) — ${fomo.components.map((c) => `${c.label} ${c.value}`).join(", ")}`);
  if (filingsE.ok) sitasi.push(`filings/?symbol=${sym}`);
  const chase = ret ? chasePattern(sym, ret.ret7) : null;
  if (chase) bukti.push(`Pola perilaku: ${chase.agoDays} hari lalu kamu menulis "${chase.action.slice(0, 60)}" saat harga juga naik — cermin, bukan nasihat`);
  const awam: AwamBagian[] = [];
  if (ret) awam.push(hargaVolumePart(sym, ret));
  if (flow) awam.push(kohortPart(flow));
  if (fomo) awam.push(fomoPart(fomo));
  let verdict = "campuran";
  let probability = 0.6;
  if (flow?.distribusiRitel) { verdict = "distribusi"; probability = 0.7; }
  else if (flow && flow.retailNetM < 0 && flow.institusiNetM > 0) { verdict = "akumulasi"; probability = 0.65; }
  else if ((ret?.ret7 ?? 0) > 10 && fomo && fomo.score >= 65) { verdict = "waspada"; probability = 0.62; }
  if (intent === "risiko") {
    const mdd = maxDrawdownPct(daily, 90);
    bukti.push(`Drawdown 90hr ${mdd}% (daily/${sym})`);
    const nSusp = suspE.ok ? (suspE.data?.results ?? []).filter((s) => !s.symbol || s.symbol.startsWith(sym)).length : null;
    if (nSusp !== null) {
      bukti.push(nSusp ? `⚑ ${nSusp} catatan suspensi ${sym} di sumber (suspensions/)` : `Tidak ada suspensi ${sym} di sumber (suspensions/)`);
      sitasi.push(`suspensions/?symbol=${sym}`);
    }
    if (flow?.distribusiRitel || (flow?.asingSellStreak ?? 0) >= 5 || (nSusp ?? 0) > 0) { verdict = "waspada"; probability = 0.68; }
    else { verdict = "pantau"; probability = 0.58; }
    awam.push(drawdownPart(sym, mdd), suspensiPart(sym, nSusp));
    return pack({ verdict, probability, confHint: 0.7, bukti, sitasi, awam, visual: flow ? { flow: { retailNetM: flow.retailNetM, institusiNetM: flow.institusiNetM, asingNetM: flow.asingNetM, windowDays: flow.windowDays } } : undefined, pool: [dailyE.data, regE.data, brokerE.data, foreignE.data, filingsE.data, suspE.data, ret, flow, fomo, { mdd, nSusp }], needs: 6, ok: [dailyE, regE, brokerE, foreignE, filingsE, suspE].filter((e) => evidenceOk(e)).length, seed: [dailyE, regE, brokerE, foreignE, filingsE, suspE].some((e) => e.seed), counterCtx: { sym, dist: flow?.distribusiRitel, asingStreak: flow?.asingSellStreak, mdd } });
  }
  return pack({
    verdict, probability, confHint: 0.7, bukti, sitasi, awam,
    visual: flow ? { flow: { retailNetM: flow.retailNetM, institusiNetM: flow.institusiNetM, asingNetM: flow.asingNetM, windowDays: flow.windowDays } } : undefined,
    pool: [dailyE.data, regE.data, brokerE.data, foreignE.data, filingsE.data, ret, flow, fomo],
    needs: 5, ok: [dailyE, regE, brokerE, foreignE, filingsE].filter((e) => evidenceOk(e)).length,
    seed: [dailyE, regE, brokerE, foreignE, filingsE].some((e) => e.seed),
    counterCtx: { sym, dist: flow?.distribusiRitel, asingStreak: flow?.asingSellStreak },
  });
}

async function buildRumor(sym: string, session: CreditSession): Promise<Build> {
  const get = getterFor(session);
  const [dailyE, brokerE, foreignE, filingsE, newsE] = await Promise.all([
    fetchDaily(get, sym, 90),
    fetchBrokerSummary(get, sym, 7),
    fetchForeignFlow(get, sym, 90),
    fetchFilings(get, sym, 14),
    fetchNews(get, sym, 14),
  ]);
  const daily = dailyE.data ?? [];
  const ret = returnsFromDaily(daily);
  const flow = computeFlow({
    summary: brokerE.data?.data ?? [], registry: [], foreign: foreignE.data?.data ?? [],
    filings: (filingsE.data?.results ?? []) as FilingRow[], priceUp: (ret?.ret7 ?? 0) > 0,
  });
  const newsN = newsE.data?.results?.length ?? 0;
  const insiderN = (filingsE.data?.results ?? []).length;
  const fomo = fomoMeter({ daily, asingSellStreak: flow?.asingSellStreak, insiderSold: insiderN > 0, newsNoFiling: newsN > 0 && insiderN === 0 });
  const bukti: string[] = [];
  if (ret) bukti.push(`${sym} ${ret.price} (${ret.ret7 >= 0 ? "+" : ""}${ret.ret7}% 7hr), volume ${ret.volMult}x rerata (daily/${sym})`);
  if (fomo) bukti.push(`FOMO ${fomo.score} (${fomo.label}) — ${fomo.components.map((c) => `${c.label} ${c.value}`).join(", ")}`);
  bukti.push(`${newsN} berita 14hr · ${insiderN} filing insider-sell 14hr (news + filings)`);
  if (flow) bukti.push(...flowSentences(flow).slice(0, 3));
  const awam: AwamBagian[] = [];
  if (ret) awam.push(hargaVolumePart(sym, ret));
  if (flow) awam.push(kohortPart(flow));
  if (fomo) awam.push(fomoPart(fomo));
  awam.push(p(
    "Berita vs filing",
    "Filing = laporan resmi orang dalam (direksi/komisaris) ke bursa. Berita tanpa filing masih bisa rumor; filing adalah jejak tindakan nyata.",
    "Ibarat kabar dari mulut ke mulut dibanding surat resmi: kabar bisa ramai, surat resmi menunjukkan tindakan nyatanya.",
    `Dalam 14 hari: ${newsN} berita dan ${insiderN} filing insider-sell. Artinya saham ini ${newsN ? "ramai dibicarakan" : "tidak banyak dibicarakan"}${insiderN ? " dan ada jejak orang dalam melepas saham" : ", tapi belum ada filing orang dalam yang mengonfirmasi ceritanya"}.`,
    insiderN > 0 ? "hati" : "netral",
  ));
  let verdict = "pantau";
  let probability = 0.55;
  if ((fomo?.score ?? 0) >= 65 && (flow?.distribusiRitel || (flow?.asingSellStreak ?? 0) >= 3)) { verdict = "tak-didukung"; probability = Math.min(0.86, 0.7 + (fomo!.score - 65) / 300); }
  else if ((fomo?.score ?? 0) >= 65) { verdict = "campuran"; probability = 0.6; }
  return pack({
    verdict, probability, confHint: 0.72, bukti, awam,
    sitasi: [`daily/${sym}/`, `broker-summary/${sym}/`, `foreign-flow/${sym}/`, `filings/?symbol=${sym}`, `news/?symbols=${sym}`],
    visual: undefined,
    pool: [dailyE.data, brokerE.data, foreignE.data, filingsE.data, newsE.data, ret, flow, fomo, { newsN, insiderN }],
    needs: 5, ok: [dailyE, brokerE, foreignE, filingsE, newsE].filter((e) => evidenceOk(e)).length,
    seed: [dailyE, brokerE, foreignE, filingsE, newsE].some((e) => e.seed),
    counterCtx: { sym, dist: flow?.distribusiRitel, asingStreak: flow?.asingSellStreak },
  });
}

function pack(b: Build): Build { return b; }

async function buildDividen(sym: string, session: CreditSession): Promise<Build> {
  const get = getterFor(session);
  const [repE, caE, dailyE] = await Promise.all([fetchReport(get, sym, ["dividend"]), fetchCorporateActions(get), fetchDaily(get, sym, 30)]);
  const div = dividendFromReport(repE.data);
  const bukti: string[] = [];
  const sitasi: string[] = [`company/report/${sym}?sections=dividend`, "corporate-actions/", `daily/${sym}/`];
  if (!div) return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [`Riwayat dividen ${sym} tidak tersedia di Sectors — tidak menebak`], sitasi, pool: [repE.data], needs: 3, ok: [repE, caE, dailyE].filter((e) => evidenceOk(e)).length });
  const ca = caE.data;
  const nextDiv = [...(ca?.upcoming_dividend ?? []), ...(ca?.dividend ?? [])]
    .filter((d) => d.symbol?.startsWith(sym))
    .sort((a, b) => (a.ex_date ?? "").localeCompare(b.ex_date ?? ""));
  const future = nextDiv.find((d) => d.ex_date >= lastTradingDay());
  const price = returnsFromDaily(dailyE.data ?? [])?.price;
  bukti.push(`Yield terakhir ${div.latestYieldPct}% (${div.latestYear}) · rerata 5thn ${div.avgYieldPct}% · konsistensi ${div.consistency}% (company/report/${sym} §dividend)`);
  if (price) bukti.push(`Harga ${sym} ${price} — yield = dividen/harga, bukan jaminan pembayaran (daily/${sym})`);
  if (future) bukti.push(`Ex-date berikutnya ${future.ex_date}${future.payment_date ? ` · pembayaran ${future.payment_date}` : ""}${future.dividend_amount ? ` · Rp ${future.dividend_amount}/saham` : ""} (corporate-actions/)`);
  else bukti.push(`Tidak ada ex-date ${sym} terjadwal di window kalender Sectors saat ini (corporate-actions/)`);
  const awam: AwamBagian[] = [
    dividenPart(sym, div, price),
    kalenderPart("dividen", sym, future ? [`Ex-date ${future.ex_date}${future.payment_date ? ` · pembayaran ${future.payment_date}` : ""}${future.dividend_amount ? ` · Rp ${future.dividend_amount}/saham` : ""}`] : []),
  ];
  let verdict = "sehat";
  let probability = Math.min(0.8, 0.5 + div.consistency / 200);
  if (div.latestYieldPct >= 10 && div.consistency < 60) { verdict = "indikasi-trap"; probability = 0.78; }
  else if (div.latestYieldPct >= 7 || div.consistency < 50) { verdict = "waspada"; probability = 0.62; }
  return pack({
    verdict, probability, confHint: 0.75, bukti, sitasi, awam,
    pool: [repE.data, caE.data, dailyE.data, div, price],
    needs: 3, ok: [repE, caE, dailyE].filter((e) => evidenceOk(e)).length, seed: [repE, caE, dailyE].some((e) => e.seed),
  });
}

async function buildKalender(sym: string | null, session: CreditSession): Promise<Build> {
  const get = getterFor(session);
  const caE = await fetchCorporateActions(get);
  const ca = caE.data;
  if (!ca) return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: ["Kalender aksi korporasi Sectors tidak tersedia"], sitasi: ["corporate-actions/"], pool: [caE.data], needs: 1, ok: 0 });
  const match = (s?: string) => !sym || (s ?? "").toUpperCase().startsWith(sym);
  const div = [...(ca.dividend ?? []), ...(ca.upcoming_dividend ?? [])].filter((d) => match(d.symbol));
  const ri = (ca.right_issue ?? []).filter((d) => match(d.symbol));
  const ss = (ca.stock_split ?? []).filter((d) => match(d.symbol));
  const agm = (ca.agm ?? []).filter((d) => match(d.symbol));
  const bukti: string[] = [];
  const label = sym ?? "pasar";
  if (div.length) bukti.push(`Dividen/ex-date ${label}: ${div.slice(0, 5).map((d) => `${d.symbol} ${d.ex_date}${d.dividend_amount ? ` (Rp ${d.dividend_amount})` : ""}`).join(" · ")} (corporate-actions/)`);
  if (ri.length) bukti.push(`Rights issue ${label}: ${ri.slice(0, 4).map((d) => `${d.symbol} ex ${d.ex_date ?? d.cum_date ?? "-"} rasio ${d.old_ratio ?? "?"}:${d.new_ratio ?? "?"} harga ${d.price ?? "?"}`).join(" · ")} (corporate-actions/)`);
  if (ss.length) bukti.push(`Stock split ${label}: ${ss.slice(0, 4).map((d) => `${d.symbol} ${d.date ?? "-"} rasio ${d.split_ratio ?? d.ratio ?? "?"}`).join(" · ")} (corporate-actions/)`);
  if (agm.length) bukti.push(`AGM/RUPS ${label}: ${agm.slice(0, 4).map((d) => `${d.symbol} ${d.agm_date}`).join(" · ")} (corporate-actions/)`);
  if (!bukti.length) bukti.push(`Tidak ada aksi korporasi ${label} di window kalender Sectors (${ca.start ?? "?"}..${ca.end ?? "?"}) — bukan berarti tidak ada, hanya tidak terjadwal di sumber (corporate-actions/)`);
  const rightsResult = detectRightsWave((ca.right_issue ?? []).length, 30);
  if (rightsResult.flag) bukti.push(`⚑ ${rightsResult.detail} (rights wave pasar)`);
  const awam: AwamBagian[] = [];
  if (div.length) awam.push(kalenderPart("dividen", label, div.slice(0, 5).map((d) => `${d.symbol} ${d.ex_date}${d.dividend_amount ? ` (Rp ${d.dividend_amount})` : ""}`)));
  if (ri.length) awam.push(kalenderPart("rights", label, ri.slice(0, 4).map((d) => `${d.symbol} ex ${d.ex_date ?? d.cum_date ?? "-"} rasio ${d.old_ratio ?? "?"}:${d.new_ratio ?? "?"}`), rightsResult.flag));
  if (ss.length) awam.push(kalenderPart("split", label, ss.slice(0, 4).map((d) => `${d.symbol} ${d.date ?? "-"} rasio ${d.split_ratio ?? d.ratio ?? "?"}`)));
  if (agm.length) awam.push(kalenderPart("agm", label, agm.slice(0, 4).map((d) => `${d.symbol} ${d.agm_date}`)));
  if (!awam.length) awam.push(p(
    "Kalender aksi korporasi",
    "Aksi korporasi = tindakan emiten yang mengubah jumlah saham, kepemilikan, atau jadwal pembayaran (dividen, rights issue, stock split, RUPS).",
    "Ibarat pengumuman acara di papan pasar: yang tidak terpampang bukan berarti tidak ada acara.",
    `Tidak ada aksi korporasi ${label} di window kalender ${ca.start ?? "?"}..${ca.end ?? "?"} — bukan berarti tidak ada, hanya tidak terjadwal di sumber.`,
  ));
  const counts = { dividends: div.length, rights: ri.length, splits: ss.length, agms: agm.length, rightsWindow: 30 };
  return pack({
    verdict: "info", probability: 0.6, confHint: 0.7, bukti, awam,
    sitasi: ["corporate-actions/"], pool: [caE.data, rightsResult, counts], needs: 1, ok: 1, info: true, seed: caE.seed,
  });
}

async function buildLikuiditas(sym: string, session: CreditSession): Promise<Build> {
  const get = getterFor(session);
  const dailyE = await fetchDaily(get, sym, 90);
  const liq = liquidityFromDaily(dailyE.data ?? []);
  if (!liq) return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [`Data harian ${sym} tidak cukup untuk menilai likuiditas`], sitasi: [`daily/${sym}/`], pool: [dailyE.data], needs: 1, ok: dailyE.ok ? 1 : 0 });
  const bukti = [
    `Nilai transaksi rerata 20hr Rp ${liq.avgValueB} M/hari → ${liq.label} (daily/${sym})`,
    `Kapitalisasi pasar Rp ${liq.marketCapB} M · hari volume nol (20hr): ${liq.zeroVolDays}`,
    `Free float tidak diambil (hemat kredit) — likuiditas dinilai dari nilai transaksi nyata, bukan asumsi`,
  ];
  const awam = [likuiditasPart(sym, liq)];
  return pack({ verdict: "info", probability: Math.min(0.85, 0.5 + liq.score / 2), confHint: 0.7, bukti, awam, sitasi: [`daily/${sym}/`], pool: [dailyE.data, liq], needs: 1, ok: dailyE.ok ? 1 : 0, info: true, seed: dailyE.seed });
}

async function buildPasar(session: CreditSession): Promise<Build> {
  const get = getterFor(session);
  const idxE = await fetchIndexDaily(get);
  const rows = idxE.data?.data ?? [];
  if (rows.length < 8) return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: ["Data indeks tidak tersedia"], sitasi: ["index-daily/IDXCOMPOSITE/"], pool: [idxE.data], needs: 1, ok: idxE.ok ? 1 : 0 });
  const last = rows[rows.length - 1]!.close;
  const at = (k: number) => rows[Math.max(0, rows.length - 1 - k)]!.close;
  const ret7 = Math.round(((last - at(7)) / at(7)) * 1000) / 10;
  const ret30 = Math.round(((last - at(30)) / at(30)) * 1000) / 10;
  return pack({
    verdict: "info", probability: 0.6, confHint: 0.7,
    bukti: [`IHSG ${last} (${ret7 >= 0 ? "+" : ""}${ret7}% 7hr · ${ret30 >= 0 ? "+" : ""}${ret30}% 30hr) — index-daily/IDXCOMPOSITE/`, `Untuk aksi korporasi pasar: sebut ticker atau tanya "ex-date <ticker> kapan?"`],
    awam: [ihsgPart(last, ret7, ret30)],
    sitasi: ["index-daily/IDXCOMPOSITE/"], pool: [idxE.data, { last, ret7, ret30 }], needs: 1, ok: idxE.ok ? 1 : 0, info: true, seed: idxE.seed,
  });
}

const yoyPct = (cur: number | null | undefined, prev: number | null | undefined): number | null =>
  cur === null || cur === undefined || prev === null || prev === undefined || prev === 0
    ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;

async function buildScreener(q: string, session: CreditSession, input?: ScreenInput): Promise<Build> {
  const screen = input ? screenFromCompiled(input) : parseScreen(q);
  if (!screen) {
    return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: ["Screener butuh kriteria: murah (PE), PB, yield, ROE, DER, market cap, atau pertumbuhan laba — tanpa itu ARUS tidak menyaring asal-asalan"], sitasi: [], pool: [], needs: 1, ok: 0 });
  }
  const get = getterFor(session);
  const preBukti: string[] = [];
  const sitasi: string[] = [];
  // Filter sektor: kata sektor divalidasi ke daftar slug Sectors (bukan daftar hardcode ARUS).
  let where = screen.where;
  let sector: SectorFilter | null = null;
  const word = input?.sectorWord ?? detectSectorWord(q);
  if (word) {
    const subE = await fetchSubsectors(get);
    sitasi.push("subsectors/");
    if (!subE.ok) {
      preBukti.push(`Kata sektor "${word}" terdeteksi, tapi daftar slug Sectors gagal diambil — filter sektor dilewati (tidak menebak slug)`);
    } else {
      sector = matchSector(word, subE.data ?? [], [], []);
      if (!sector) {
        const [indE, subindE] = await Promise.all([fetchIndustries(get), fetchSubindustries(get)]);
        sitasi.push("industries/", "subindustries/");
        sector = matchSector(word, subE.data ?? [], indE.data ?? [], subindE.data ?? []);
        if (!sector && (indE.ok || subindE.ok))
          preBukti.push(`Kata sektor "${word}" tidak ada di daftar slug Sectors (subsectors/industries/subindustries dicek) — filter sektor tidak dipasang, bukan pura-pura diterapkan`);
      }
      if (sector) {
        where = where ? `${where} and ${sector.field} = '${sector.slug}'` : `${sector.field} = '${sector.slug}'`;
        preBukti.push(`Filter sektor ${sectorLabel(sector)} — keanggotaan sektor milik Sectors, bukan klasifikasi ARUS`);
      }
    }
  }
  const e = await fetchScreener(get, where, screen.orderBy, 5);
  const rows = e.data?.results ?? [];
  sitasi.push(`companies/?where=${where || "-"}&order_by=${screen.orderBy}`);
  if (!rows.length) {
    return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [...preBukti, `Screener "${screen.label}" tidak mengembalikan baris (respons kosong yang valid, bukan error)`], sitasi, pool: [e.data], needs: 1, ok: e.ok ? 1 : 0, seed: e.seed });
  }
  const bukti = [...preBukti, ...rows.map((r) => `${r.symbol} ${r.company_name} — ${SCREEN_LABELS[screen.metric] ?? screen.metric}: ${fmtScreenValue(screen.metric, r.query_values?.[screen.metric])}`)];
  bukti.push(`Angka langsung dari Sectors screener (where="${where || "-"}", order_by=${screen.orderBy}, include_query_values) — 1kr per screen, bukan hitungan ARUS`);
  const kondisi = `${screen.label}${sector ? ` · filter ${sector.field}='${sector.slug}'` : ""}: ${rows.slice(0, 3).map((r) => r.symbol).join(", ")}${rows.length > 3 ? ", dst" : ""} (${rows.length} baris, urut ${screen.orderBy}). Nilai tiap baris diambil apa adanya dari respons Sectors.`;
  const awam: AwamBagian[] = [p(
    "Screener (menyaring daftar saham)",
    "Screener = menyaring seluruh emiten IDX dengan kriteria angka (PE, PB, yield, ROE, DER, market cap, growth) lalu mengurutkannya. Hasilnya daftar kandidat untuk diperiksa, bukan rekomendasi.",
    "Ibarat menyaring daftar toko se-pasar dengan kriteria 'paling murah' atau 'paling royal bagi hasil' — yang muncul adalah situasi angkanya, bukan suruhan membeli.",
    kondisi,
  )];
  return pack({
    verdict: "info", probability: 0.6, confHint: 0.7, bukti, sitasi, awam,
    visual: { screen: { label: screen.label, metric: screen.metric, where, orderBy: screen.orderBy, sector: sector ? { field: sector.field, slug: sector.slug } : null, rows: rows.map((r) => ({ symbol: r.symbol, name: r.company_name, value: r.query_values?.[screen.metric] ?? null, disp: fmtScreenValue(screen.metric, r.query_values?.[screen.metric]) })) } },
    pool: [e.data, screen, sector], needs: 1, ok: e.ok ? 1 : 0, info: true, seed: e.seed,
  });
}

// — fundamental: valuasi / kinerja kuartalan / tahunan / segmen / prospek / manajemen / peer / profil —
// Angka & section apa adanya dari Sectors (report 1kr/section; quarterly 1kr/kuartal; segmen 1kr).
async function buildFundamental(sym: string, q: string, session: CreditSession, mode?: FundMode): Promise<Build> {
  const fq = mode ? fundQueryFor(mode) : parseFundamental(q);
  const get = getterFor(session);

  if (fq.mode === "kinerja") {
    const n = 5;
    const e = await fetchQuarterly(get, sym, n);
    const sitasi = [`financials/quarterly/${sym}?n_quarters=${n}`];
    const rows = (e.data ?? []).filter((r) => typeof r.date === "string").sort((a, b) => b.date.localeCompare(a.date));
    if (!rows.length) {
      return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [`Financials kuartalan ${sym} tidak tersedia di Sectors (bisa jadi belum lapor / simbol salah) — tidak menebak`], sitasi, pool: [e.data], needs: 1, ok: e.ok ? 1 : 0, seed: e.seed });
    }
    const latest = rows[0]!;
    const sameQ = rows.find((r) => r.date.slice(5, 10) === latest.date.slice(5, 10) && Number(r.date.slice(0, 4)) === Number(latest.date.slice(0, 4)) - 1) ?? null;
    const revYoY = yoyPct(latest.revenue, sameQ?.revenue);
    const labaYoY = yoyPct(latest.earnings, sameQ?.earnings);
    const bukti = [
      `${sym} ${quarterLabel(latest.date)}: pendapatan ${fmtRp(latest.revenue)} · laba ${fmtRp(latest.earnings)} — financials/quarterly (${rows.length} kuartal × 1kr, angka apa adanya)`,
      rekapYoY("Pendapatan", revYoY, labaYoY) ?? `Pembanding kuartal sama tahun lalu tidak ikut terambil (${rows.length} kuartal diminta)`,
      `Deret ${rows.length} kuartal: ${rows.map((r) => `${quarterLabel(r.date)} ${fmtRp(r.revenue)}`).join(" · ")}`,
      `Aset ${fmtRp(latest.total_assets)} · ekuitas ${fmtRp(latest.total_equity)} · utang ${fmtRp(latest.total_debt)} · arus kas operasi ${fmtRp(latest.operating_cash_flow)}`,
    ];
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.7, bukti, sitasi,
      awam: [kinerjaPart(sym, { quarter: quarterLabel(latest.date), revenue: latest.revenue ?? 0, earnings: latest.earnings ?? 0, revYoY, labaYoY })],
      visual: { fund: { mode: "kinerja", title: `Kinerja kuartalan ${sym}`, subtitle: `${rows.length} kuartal terakhir · pendapatan (kanan) & laba (nama) · financials/quarterly`, rows: rows.map((r) => ({ label: r.date.slice(2, 7), name: `laba ${fmtRp(r.earnings)}`, disp: fmtRp(r.revenue) })), note: "Diambil apa adanya dari Sectors (1kr/kuartal), bukan hitungan ARUS. Laporan masa lalu, bukan jaminan kuartal depan." } },
      pool: [e.data, { revYoY, labaYoY }], needs: 1, ok: e.ok ? 1 : 0, info: true, seed: e.seed,
    });
  }

  if (fq.mode === "segmen") {
    const e = await fetchSegments(get, sym);
    const sitasi = [`company/get-segments/${sym}`];
    const rb = e.data?.revenue_breakdown ?? [];
    if (!rb.length) {
      return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [`Segmen pendapatan ${sym} tidak tersedia di Sectors (tidak semua emiten punya data segmen) — tidak menebak`], sitasi, pool: [e.data], needs: 1, ok: e.ok ? 1 : 0, seed: e.seed });
    }
    const total = rb.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1;
    const bySource = new Map<string, number>();
    for (const x of rb) bySource.set(String(x.source || "-"), (bySource.get(String(x.source || "-")) ?? 0) + (Number(x.value) || 0));
    const segs = [...bySource.entries()].map(([name, value]) => ({ name, value, share: Math.round((value / total) * 1000) / 10 })).sort((a, b) => b.value - a.value);
    const bukti = [
      `Segmen pendapatan ${sym} ${e.data?.financial_year ?? "-"}: ${segs.slice(0, 3).map((s) => `${s.name} ${s.share}%`).join(" · ")} (company/get-segments — 1kr)`,
      `Total nilai segmen terdata ${fmtRp(total)} · porsi dihitung dari nilai yang dikembalikan Sectors, bukan estimasi ARUS`,
    ];
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.7, bukti, sitasi,
      awam: [segmenPart(sym, e.data?.financial_year ?? 0, segs)],
      visual: { fund: { mode: "segmen", title: `Segmen pendapatan ${sym} ${e.data?.financial_year ?? ""}`, subtitle: "Sankey-ready source/target dari Sectors; porsi dihitung ARUS dari nilai yang dikembalikan", rows: segs.map((s) => ({ label: `${s.share}%`, name: s.name, disp: fmtRp(s.value) })), note: "Segmen = dari mana pendapatan berasal. Tidak semua emiten punya data ini di Sectors." } },
      pool: [e.data, segs], needs: 1, ok: e.ok ? 1 : 0, info: true, seed: e.seed,
    });
  }

  const rep = await fetchReport(get, sym, fq.sections);
  const sitasi = [`company/report/${sym}?sections=${fq.sections.join(",")}`];
  const d = (rep.data ?? null) as Record<string, unknown> | null;
  const hasSection = (k: string) => !!d && d[k] !== null && d[k] !== undefined;
  if (!hasSection(fq.sections[0]!)) {
    return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [`Section "${fq.sections.join(",")}" ${sym} tidak tersedia di Sectors — live gagal = data tidak tersedia, bukan dikarang`], sitasi, pool: [rep.data], needs: 1, ok: rep.ok ? 1 : 0, seed: rep.seed });
  }
  const common = { sitasi, pool: [rep.data] as unknown[], needs: 1, ok: rep.ok ? 1 : 0, info: true as const, seed: rep.seed };

  if (fq.mode === "valuasi") {
    const v = d!.valuation as ValuationLike;
    const { year, pe, pb } = latestValuation(v);
    const bukti = [
      `${sym} valuasi: forward PE ${fmtNum(v?.forward_pe)} · PE ${fmtNum(pe)}${year ? ` (${year})` : ""} · PB ${fmtNum(pb)} — company/report §valuation (1kr)`,
      v?.intrinsic_value != null ? `Sectors menampilkan intrinsic_value ${fmtNum(v.intrinsic_value)} — angka model pihak ketiga, bukan target harga ARUS` : `Intrinsic value tidak tersedia di laporan`,
      `Harga terakhir di laporan ${fmtNum(v?.last_close_price)}${v?.latest_close_date ? ` (${v.latest_close_date})` : ""} — harga pasar, bukan penilaian ARUS`,
    ];
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.7, bukti, ...common,
      awam: [valuasiPart(sym, { forwardPe: v?.forward_pe ?? null, pe, pb, year, price: v?.last_close_price ?? null })],
      visual: { fund: { mode: "valuasi", title: `Valuasi ${sym}`, subtitle: `Rasio dari company/report §valuation (1kr)${year ? ` · historic terakhir ${year}` : ""}`, rows: [
        { label: "Forward PE", name: "proyeksi laba ke depan", disp: fmtNum(v?.forward_pe) },
        { label: `PE ${year ?? ""}`, name: "harga / laba aktual", disp: fmtNum(pe) },
        { label: `PB ${year ?? ""}`, name: "harga / nilai buku", disp: fmtNum(pb) },
        { label: "Intrinsic", name: "model pihak ketiga, bukan target ARUS", disp: fmtNum(v?.intrinsic_value) },
      ], note: "PE rendah belum berarti murah (bisa karena laba sedang puncak); bandingkan dengan sektor. Angka apa adanya dari Sectors." } },
    });
  }

  if (fq.mode === "tahunan") {
    const fin = d!.financials as { eps?: number | null; historical_financials?: { year?: number; revenue?: number | null; earnings?: number | null; total_assets?: number | null; total_equity?: number | null }[] };
    const rows = (fin?.historical_financials ?? []).filter((r) => typeof r.year === "number").sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    const bukti = [
      rows.length ? `${sym} ${rows[0]!.year}: pendapatan ${fmtRp(rows[0]!.revenue)} · laba ${fmtRp(rows[0]!.earnings)} · EPS ${fmtNum(fin?.eps)} (company/report §financials — 1kr)` : `Riwayat finansial tahunan ${sym} kosong di respons Sectors`,
      `Deret tahunan: ${rows.slice(0, 5).map((r) => `${r.year} ${fmtRp(r.revenue)}`).join(" · ") || "-"}`,
    ];
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.7, bukti, ...common,
      awam: [tahunanPart(sym, rows.map((r) => ({ year: r.year!, revenue: r.revenue ?? null, earnings: r.earnings ?? null })))],
      visual: { fund: { mode: "tahunan", title: `Kinerja tahunan ${sym}`, subtitle: "Pendapatan (kanan) & laba (nama) per tahun fiskal · company/report §financials (1kr)", rows: rows.map((r) => ({ label: String(r.year), name: `laba ${fmtRp(r.earnings)}`, disp: fmtRp(r.revenue) })), note: "Data tahunan lebih jarang diperbarui daripada kuartalan. Angka apa adanya dari Sectors." } },
    });
  }

  if (fq.mode === "prospek") {
    const f = d!.future as {
      company_value_forecasts?: { estimate_year?: number; eps_estimate?: number | null; revenue_estimate?: number | null }[];
      company_growth_forecasts?: { base_year?: number; estimate_year?: number; eps_growth?: number | null; revenue_growth?: number | null }[];
      analyst_rating_breakdown?: { strong_buy?: number; buy?: number; hold?: number; sell?: number; strong_sell?: number; n_analyst?: number; updated_on?: string };
    };
    const val = f?.company_value_forecasts?.[0];
    const g = f?.company_growth_forecasts?.[0];
    const r = f?.analyst_rating_breakdown;
    const bukti = [
      `${sym} prospek ${g?.estimate_year ?? val?.estimate_year ?? "-"}: estimasi EPS ${fmtNum(val?.eps_estimate)} · revenue ${fmtRp(val?.revenue_estimate)} — company/report §future (1kr)`,
      `Estimasi pertumbuhan laba ${fmtRatioPct(g?.eps_growth)} · pendapatan ${fmtRatioPct(g?.revenue_growth)} (dari base ${g?.base_year ?? "-"})`,
      `Rating analis: ${(r?.strong_buy ?? 0) + (r?.buy ?? 0)} beli / ${r?.hold ?? 0} tahan / ${(r?.sell ?? 0) + (r?.strong_sell ?? 0)} jual — ${r?.n_analyst ?? "-"} analis${r?.updated_on ? `, per ${r.updated_on}` : ""}`,
      "Seluruh angka di sini proyeksi pihak ketiga yang dikutip Sectors — bukan ramalan ARUS dan bukan ajakan",
    ];
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.7, bukti, ...common,
      awam: [prospekPart(sym, { year: g?.estimate_year ?? val?.estimate_year ?? 0, epsGrowth: g?.eps_growth ?? null, revenueGrowth: g?.revenue_growth ?? null, nAnalyst: r?.n_analyst ?? null, buy: (r?.strong_buy ?? 0) + (r?.buy ?? 0), hold: r?.hold ?? null, sell: (r?.sell ?? 0) + (r?.strong_sell ?? 0) })],
      visual: { fund: { mode: "prospek", title: `Prospek ${sym}`, subtitle: "Estimasi & rating pihak ketiga via company/report §future (1kr)", rows: [
        { label: `EPS ${val?.estimate_year ?? ""}E`, name: "estimasi analis", disp: fmtNum(val?.eps_estimate) },
        { label: `Revenue ${val?.estimate_year ?? ""}E`, name: "estimasi analis", disp: fmtRp(val?.revenue_estimate) },
        { label: "Growth laba", name: `estimasi vs ${g?.base_year ?? "-"}`, disp: fmtRatioPct(g?.eps_growth) },
        { label: "Growth revenue", name: `estimasi vs ${g?.base_year ?? "-"}`, disp: fmtRatioPct(g?.revenue_growth) },
        { label: "Rating", name: `${r?.n_analyst ?? "-"} analis`, disp: `${(r?.strong_buy ?? 0) + (r?.buy ?? 0)}/${r?.hold ?? 0}/${(r?.sell ?? 0) + (r?.strong_sell ?? 0)}` },
      ], note: "B/B/T = beli/tahan/jual. Proyeksi pihak ketiga, bukan rekomendasi ARUS." } },
    });
  }

  if (fq.mode === "manajemen") {
    const m = d!.management as { key_executives?: { name?: string; position?: string }[]; executives_shareholdings?: { name?: string; position?: string; share_amount?: number | null; share_percentage?: number | null }[] };
    const execs = (m?.key_executives ?? []).filter((x) => x.name).map((x) => ({ name: String(x.name), position: String(x.position ?? "-") }));
    const holders = (m?.executives_shareholdings ?? []).filter((x) => x.name).map((x) => ({ name: String(x.name), pct: x.share_percentage ?? null, amount: x.share_amount ?? null }));
    const bukti = [
      `${sym} direksi (${execs.length} terdata): ${execs.slice(0, 4).map((x) => `${x.name} — ${x.position}`).join(" · ") || "-"} (company/report §management — 1kr)`,
      holders.length ? `Kepemilikan eksekutif: ${holders.slice(0, 3).map((x) => `${x.name} ${x.pct ?? "-"}%${x.amount != null ? ` (${fmtNum(x.amount)} saham)` : ""}`).join(" · ")}` : `Tidak ada data kepemilikan eksekutif di laporan`,
    ];
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.7, bukti, ...common,
      awam: [manajemenPart(sym, execs, holders.map((x) => ({ name: x.name, pct: x.pct })))],
      visual: { fund: { mode: "manajemen", title: `Manajemen ${sym}`, subtitle: "Key executives & shareholding via company/report §management (1kr)", rows: [...execs.map((x) => ({ label: x.name, name: x.position, disp: "" })), ...holders.map((x) => ({ label: x.name, name: "kepemilikan eksekutif", disp: x.pct != null ? `${x.pct}%` : "-" }))], note: "Profil pengurus dari sumber — bukan penilaian kualitas manajemen." } },
    });
  }

  if (fq.mode === "peer") {
    const blocks = (d!.peers ?? []) as { peers_data?: { companies?: { symbol?: string; company_name?: string; group?: unknown; year?: number; pe_ttm?: number | null; pb_mrq?: number | null; market_cap?: number | null }[]; group_name?: { sub_sector?: string } } }[];
    const companies = blocks[0]?.peers_data?.companies ?? [];
    const selfRow = companies.find((c) => Array.isArray(c.group) && c.group.includes("self")) ?? companies.find((c) => c.symbol?.startsWith(sym)) ?? null;
    const others = companies.filter((c) => c !== selfRow && c.symbol).sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0)).slice(0, 6);
    const pes = others.map((c) => c.pe_ttm).filter((x): x is number => x != null).sort((a, b) => a - b);
    const bukti = [
      `${sym} PE ${fmtNum(selfRow?.pe_ttm)} · PB ${fmtNum(selfRow?.pb_mrq)} vs ${others.length} peer${blocks[0]?.peers_data?.group_name?.sub_sector ? ` sub_sector ${blocks[0]!.peers_data!.group_name!.sub_sector}` : ""} (company/report §peers — 1kr)`,
      pes.length ? `Rentang PE peer: ${fmtNum(pes[0])}–${fmtNum(pes[pes.length - 1])} · median ${fmtNum(pes[Math.floor(pes.length / 2)])}` : `Rentang PE peer tidak tersedia`,
      `Peer terbesar: ${others.slice(0, 3).map((c) => `${String(c.symbol).replace(/\.JK$/, "")} (PE ${fmtNum(c.pe_ttm)})`).join(", ")}`,
    ];
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.7, bukti, ...common,
      awam: [peerPart(sym, others.map((c) => ({ symbol: String(c.symbol ?? "").replace(/\.JK$/, ""), pe: c.pe_ttm ?? null, pb: c.pb_mrq ?? null })), { pe: selfRow?.pe_ttm ?? null, pb: selfRow?.pb_mrq ?? null })],
      visual: { fund: { mode: "peer", title: `Peer ${sym}`, subtitle: "Perbandingan dalam subsektor yang sama via company/report §peers (1kr)", rows: [
        { label: `${sym} (self)`, name: "emiten yang ditanya", disp: `PE ${fmtNum(selfRow?.pe_ttm)} · PB ${fmtNum(selfRow?.pb_mrq)}` },
        ...others.map((c) => ({ label: String(c.symbol ?? "-").replace(/\.JK$/, ""), name: c.company_name ?? "", disp: `PE ${fmtNum(c.pe_ttm)} · PB ${fmtNum(c.pb_mrq)}` })),
      ], note: "Rentang PE = bahan posisi relatif, bukan vonis murah/mahal. Angka apa adanya dari Sectors." } },
    });
  }

  // tentang / profil
  const o = d!.overview as { sector?: string; sub_sector?: string; industry?: string; market_cap?: number | null; market_cap_rank?: number | null; listing_date?: string; employee_num?: number | null; esg_score?: number | null; tags?: string[]; indices?: string[]; last_close_price?: number | null };
  const bukti = [
    `${sym} profil: ${o?.sector ?? "-"}${o?.sub_sector ? ` / ${o.sub_sector}` : ""}${o?.industry ? ` · industri ${o.industry}` : ""} · market cap ${fmtRp(o?.market_cap)}${o?.market_cap_rank ? ` (peringkat ${o.market_cap_rank})` : ""} — company/report §overview (1kr)`,
    `Listing ${o?.listing_date ?? "-"} · ${o?.employee_num ?? "-"} karyawan · ESG ${fmtNum(o?.esg_score)}${o?.last_close_price != null ? ` · harga terakhir ${fmtNum(o.last_close_price)}` : ""}`,
    (o?.indices ?? []).length ? `Indeks: ${(o!.indices ?? []).slice(0, 8).join(", ")}` : `Tidak ada data indeks di respons`,
  ];
  return pack({
    verdict: "info", probability: 0.6, confHint: 0.7, bukti, ...common,
    awam: [tentangPart(sym, { sector: o?.sector, subSector: o?.sub_sector, marketCap: o?.market_cap ?? null, listingDate: o?.listing_date, employeeNum: o?.employee_num ?? null })],
    visual: { fund: { mode: "tentang", title: `Profil ${sym}`, subtitle: "Identitas & klasifikasi via company/report §overview (1kr)", rows: [
      { label: "Sektor", name: o?.industry ?? "", disp: `${o?.sector ?? "-"}${o?.sub_sector ? ` / ${o.sub_sector}` : ""}` },
      { label: "Market cap", name: o?.market_cap_rank ? `peringkat ${o.market_cap_rank}` : "", disp: fmtRp(o?.market_cap) },
      { label: "Listing", name: `${o?.employee_num ?? "-"} karyawan`, disp: o?.listing_date ?? "-" },
      { label: "ESG", name: "skor sumber", disp: fmtNum(o?.esg_score) },
    ], note: "Klasifikasi sektor mengikuti sumber data. Bukan penilaian ARUS." } },
  });
}

function rekapYoY(label: string, revYoY: number | null, labaYoY: number | null): string | null {
  if (revYoY === null && labaYoY === null) return null;
  return `${label} YoY: pendapatan ${revYoY === null ? "-" : `${revYoY >= 0 ? "+" : ""}${revYoY}%`} · laba ${labaYoY === null ? "-" : `${labaYoY >= 0 ? "+" : ""}${labaYoY}%`} (kuartal sama tahun lalu)`;
}

async function buildBarang(q: string, sym: string | null, session: CreditSession, commodityOverride?: string): Promise<Build> {
  // Jujur soal cakupan: ARUS hanya mengambil harga coal & nikel dari Sectors — jangan diam-diam menjawab coal.
  const OUT_COMMODITY = /\bcpo\b|kelapa sawit|\bemas\b|\bgold\b|\bperak\b|\bsilver\b|\btimah\b|\btembaga\b|\bcopper\b|\bminyak\b|\boil\b|\bgas\b/i;
  const generic = commodityOverride && !/^(coal|nickel)$/.test(commodityOverride) ? commodityOverride : null;
  const qLabel = generic ? null : ((q.match(OUT_COMMODITY) ?? [])[0]?.toLowerCase() ?? null);
  const label = generic ?? qLabel;
  if (!sym && label && !/coal|batubara|batu bara|nikel|nickel|tambang/i.test(q)) {
    return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [`ARUS belum mengimplementasikan komoditas "${label}" — di Sectors data ini ADA (mining/commodities + mining/commodities/{slug}/price); ini keterbatasan cakupan ARUS, bukan keterbatasan API`], sitasi: [], pool: [], needs: 1, ok: 0 });
  }
  const get = getterFor(session);
  const commodity: "coal" | "nickel" = commodityOverride === "coal" || commodityOverride === "nickel"
    ? commodityOverride
    : sym ? commodityFor(sym, q) : q.match(/nikel|nickel/i) ? "nickel" : "coal";
  const bukti: string[] = [];
  const sitasi: string[] = [`mining/commodities/${commodity}/price`];
  const priceE = await fetchCommodityPrice(get, commodity);
  let pct = 0;
  try { pct = priceE.data ? pctFromPriceSeries(priceE.data) : 0; } catch { pct = 0; }
  bukti.push(`${commodity === "coal" ? "Coal" : "Nikel"} ${pct >= 0 ? "+" : ""}${pct}% (12 titik bulanan terakhir) — mining/commodities/${commodity}/price`);
  const awam: AwamBagian[] = [komoditasPart(commodity, pct)];
  if (!sym) {
    return pack({
      verdict: "info", probability: 0.6, confHint: 0.6, bukti, awam,
      sitasi, pool: [priceE.data, { pct }], needs: 1, ok: priceE.ok ? 1 : 0, info: true, seed: priceE.seed,
    });
  }
  const dailyE = await fetchDaily(get, sym, 90);
  const volPct = pctFromDailyVolume((dailyE.data ?? []) as DailyRow[]);
  bukti.push(`Volume ${sym} ${volPct >= 0 ? "+" : ""}${volPct}% (20hr vs 40hr sebelumnya) — daily/${sym}`);
  awam.push(volumeEmitenPart(sym, Number.isFinite(volPct) ? volPct : 0));
  sitasi.push(`daily/${sym}/`);
  const mslug = miningSlug(sym);
  let extras: { topCountryShare?: number; topCountry?: string; stripDelta?: number; prodNote: string; salesNote: string; seed: boolean } | null = null;
  let miningRaw: unknown = null;
  if (mslug) {
    const [salesE, perfE] = await Promise.all([fetchSalesDestination(get, mslug), fetchMiningPerformance(get, mslug)]);
    miningRaw = [salesE.data, perfE.data];
    if (salesE.ok || perfE.ok) {
      let topCountryShare: number | undefined;
      let topCountry = "";
      let salesNote = "Sales-destination: tak ada data";
      if (salesE.data) {
        let best = 0;
        for (const [c, v] of Object.entries(salesE.data.data ?? {})) {
          const p = v.percentage_of_sales_volume ?? v.percentage_of_total_revenue ?? 0;
          if ((p ?? 0) > best) { best = p ?? 0; topCountry = c; }
        }
        if (best > 0) { topCountryShare = Math.round(best) / 100; salesNote = `Top buyer ${topCountry} ${Math.round(best)}% (${salesE.data.year})`; }
        else salesNote = "Sales-destination: persentase tidak tersedia";
      }
      let stripDelta: number | undefined;
      let prodNote = "Produksi: tak ada data";
      const rows = [...(perfE.data?.data ?? [])].filter((r) => typeof r.strip_ratio === "number").sort((a, b) => a.year - b.year);
      const lastP = rows[rows.length - 1];
      if (lastP) {
        prodNote = `Produksi ${lastP.production_volume ?? "?"}Mt / sales ${lastP.sales_volume ?? "?"}Mt, strip ${lastP.strip_ratio} (${lastP.year})`;
        if (rows.length >= 2) stripDelta = Math.round(((lastP.strip_ratio ?? 0) - (rows[rows.length - 2]!.strip_ratio ?? 0)) * 100) / 100;
      }
      extras = { topCountryShare, topCountry, stripDelta, prodNote, salesNote, seed: (salesE.seed || perfE.seed) };
      bukti.push(`${salesNote} — mining/sales-destination`, `${prodNote} — mining performance`);
      sitasi.push(`mining/sales-destination/${mslug}`, `mining/companies/performance/${mslug}`);
    } else {
      bukti.push("Sales-destination & performance mining tidak tersedia — divergence dihitung dari harga vs volume saja");
    }
  } else {
    bukti.push(`Slug mining ${sym} belum ada di mapping ARUS — data negara/strip tidak diambil (Sectors menyediakannya via mining/companies)`);
  }
  const r = computeBarang({
    commodityPct12m: pct,
    volumePct: Number.isFinite(volPct) ? volPct : 0,
    stripDelta: extras?.stripDelta,
    topCountryShare: extras?.topCountryShare,
    licenseMonthsLeft: undefined,
  });
  bukti.push(...r.flags);
  bukti.push("Izin IUP: ARUS belum mengambil endpoint mining/licenses + mining/contracts (tersedia di Sectors) — tanpa flag, bukan berarti tidak ada");
  if (extras?.topCountry && typeof extras.topCountryShare === "number") awam.push(buyerPart(extras.topCountry, extras.topCountryShare));
  if (extras?.prodNote) awam.push(produksiPart(extras.prodNote, extras.stripDelta));
  const kreditLedger = session.ledger.length;
  return pack({
    verdict: r.verdict === "tak-didukung" ? "tak-didukung" : r.verdict,
    probability: r.probability, confHint: 0.7, bukti, sitasi, awam,
    visual: { sankey: { ...r.sankey, meta: { topCountry: extras?.topCountry ?? "-", prod: extras?.prodNote ?? "?" } } },
    pool: [priceE.data, dailyE.data, extras, miningRaw, r, { pct, volPct, kreditLedger }],
    needs: 4, ok: [priceE, dailyE].filter((e) => evidenceOk(e)).length + (extras ? 2 : 0), seed: priceE.seed || dailyE.seed || (extras?.seed ?? false),
  });
}

async function buildDna(code: string | undefined, session: CreditSession): Promise<Build> {
  if (!code) return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [clarificationText("dna")], sitasi: [], pool: [], needs: 1, ok: 0 });
  const get = getterFor(session);
  const actE = await fetchBrokerActivity(get, code, 14);
  const touches = actE.data ? touchesFromActivity(code, actE.data) : { touches: [], foreignShare: 0 };
  const repeatDays = (actE.data?.data ?? []).filter((d) => (d.summary ?? []).some((s) => (s.nval ?? 0) < 0)).length;
  const r = fingerprintBroker(code, touches.touches, { foreignShare: touches.foreignShare, historyRepeat: repeatDays, windowDays: 14 });
  const bukti = [
    r.note,
    `${code} menyentuh ${touches.touches.length} simbol dalam 14hr · porsi transaksi asing ${Math.round(touches.foreignShare * 100)}% (broker-activity/${code}/)`,
    "DNA = pola historis proxy kohort, bukan identitas pemilik atau vonis",
  ];
  return pack({
    verdict: r.verdict, probability: r.probability, confHint: 0.68, bukti, awam: [dnaPart(code, r.label, r.repeat)],
    sitasi: [`broker-activity/${code}/`, "brokers/"],
    visual: { radar: { broker: code, label: r.label, repeat: r.repeat } },
    pool: [actE.data, touches, r, { nSymbols: touches.touches.length }], needs: 1, ok: actE.ok ? 1 : 0, seed: actE.seed,
  });
}

async function buildKuasa(sym: string | null, session: CreditSession): Promise<Build> {
  const get = getterFor(session);
  const [filE, caE] = await Promise.all([fetchFilings(get, null, 14), fetchCorporateActions(get)]);
  let events = eventsFromFilings(filE.data ?? {});
  if (sym) events = events.filter((e) => e.symbol === sym);
  const r = detectCluster(events);
  const bukti = [
    r.flag ? `⚑ ${r.detail} (filings/)` : `Tidak ada cluster insider ≥4 sell/1 sektor/7hr (${events.length} event diperiksa) — filings/`,
    `${events.length} insider-sell ${sym ? `di ${sym}` : "di universe filings"} 14hr terakhir`,
  ];
  const ca = caE.data;
  if (ca) {
    const rights = (ca.right_issue ?? []).filter((x) => !sym || x.symbol.startsWith(sym));
    const rw = detectRightsWave(rights.length, 30);
    if (rw.flag) bukti.push(`⚑ ${rw.detail} (corporate-actions/)`);
  }
  return pack({
    verdict: r.flag ? "waspada" : "pantau", probability: r.flag ? 0.66 : 0.58, confHint: 0.7, bukti,
    awam: [clusterPart(r.flag, r.kind, events.length)],
    sitasi: ["filings/", "corporate-actions/"],
    visual: { cluster: { flag: r.flag, kind: r.kind, n: events.length } },
    pool: [filE.data, caE.data, events, r, { nEvents: events.length }], needs: 2, ok: [filE, caE].filter((e) => evidenceOk(e)).length, seed: filE.seed || caE.seed,
  });
}

async function buildAutopsi(q: string, session: CreditSession): Promise<Build> {
  const parsed = parsePortfolio(q);
  const port = parsed ?? getPortfolio();
  if (port.length < 2) {
    return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [clarificationText("autopsi", getPortfolio().map((p) => p.ticker))], sitasi: [], pool: [], needs: 1, ok: 0 });
  }
  const use = port.slice(0, 5);
  const note = port.length > 5 ? ` (dibatasi 5 ticker pertama dari ${port.length} demi anggaran kredit)` : "";
  const get = getterFor(session);
  const { own, seed: seedOwn } = await loadOwnerships(get, use.map((p) => p.ticker));
  if (!own.length) return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: ["Data kepemilikan tidak tersedia untuk ticker ini"], sitasi: ["company/report §ownership"], pool: [], needs: use.length, ok: 0 });
  const card = autopsiKartu(use, own);
  const bukti = [
    `${card.headline}${note} (company/report §ownership ×${use.length})`,
    ...card.groups.map((g) => `${g.name}: ${g.tickers.join(", ")} = ${g.pct}% (kemungkinan relasi)`),
    ...card.bullets.slice(0, 1),
  ];
  return pack({
    verdict: card.group_score >= 50 ? "waspada" : card.group_score > 0 ? "pantau" : "info",
    probability: Math.min(0.85, 0.5 + card.group_score / 200), confHint: 0.72, bukti,
    awam: [grupPart(card.group_score, card.groups)],
    sitasi: [...new Set(use.map((p) => `company/report/${p.ticker}?sections=ownership`)), "known-list grup"],
    visual: { groups: card.groups, groupScore: card.group_score },
    pool: [own, card, { nTickers: use.length, nOwned: own.length }], needs: use.length, ok: own.length, seed: seedOwn,
  });
}

async function buildBanding(sym1: string, sym2: string, session: CreditSession): Promise<Build> {
  const syms = [sym1, sym2];
  const get = getterFor(session);
  const results = await Promise.all(syms.map(async (s) => {
    const dE = await fetchDaily(get, s, 90);
    const ret = returnsFromDaily(dE.data ?? []);
    const liq = liquidityFromDaily(dE.data ?? []);
    const f = fomoMeter({ daily: dE.data ?? [] });
    return { s, ret, liq, fomo: f, e: dE };
  }));
  const bukti: string[] = [];
  const compare: unknown[] = [];
  for (const r of results) {
    if (!r.ret) { bukti.push(`${r.s}: data harian tidak tersedia`); continue; }
    bukti.push(`${r.s} ${r.ret.price}: 7hr ${r.ret.ret7 >= 0 ? "+" : ""}${r.ret.ret7}% · 30hr ${r.ret.ret30 >= 0 ? "+" : ""}${r.ret.ret30}% · 90hr ${r.ret.ret90 >= 0 ? "+" : ""}${r.ret.ret90}% · vol ${r.ret.volMult}x · FOMO ${r.fomo?.score ?? "-"} · ${r.liq?.label ?? "-"} (daily/${r.s})`);
    compare.push({ ticker: r.s, price: r.ret.price, ret7: r.ret.ret7, ret30: r.ret.ret30, ret90: r.ret.ret90, volMult: r.ret.volMult, fomo: r.fomo?.score ?? null, liq: r.liq?.label ?? null });
  }
  const a = results[0]?.ret, b = results[1]?.ret;
  const selisih30 = a && b ? Math.abs(Math.round((a.ret30 - b.ret30) * 10) / 10) : undefined;
  if (a && b) bukti.push(`Selisih 30hr: ${selisih30} poin persen — angka, bukan rekomendasi pilih salah satu`);
  return pack({
    verdict: "info", probability: 0.6, confHint: 0.7, bukti,
    awam: a && b ? [bandingPart({ ticker: syms[0]!, ret30: a.ret30, volMult: a.volMult }, { ticker: syms[1]!, ret30: b.ret30, volMult: b.volMult }, selisih30)] : [],
    sitasi: syms.map((s) => `daily/${s}/ 90hr`),
    visual: { compare },
    pool: [results.map((r) => ({ s: r.s, ret: r.ret, liq: r.liq, fomo: r.fomo })), compare, { selisih30, nTickers: syms.length }],
    needs: syms.length, ok: results.filter((r) => r.e.ok).length, info: true, seed: results.some((r) => r.e.seed),
  });
}

async function buildPagi(q: string, session: CreditSession): Promise<Build> {
  const mentioned = plausibleTickers(q);
  const watch = mentioned.length ? mentioned.slice(0, 4) : (getWatchlist().length ? getWatchlist().slice(0, 4) : ["ADRO", "ANTM", "BBCA"]);
  const get = getterFor(session);
  const evs = await Promise.all(watch.map((s) => fetchDaily(get, s, 90)));
  const series: Record<string, number[]> = {};
  let liveN = 0;
  watch.forEach((s, i) => {
    const closes = (evs[i]!.data ?? []).filter((r) => typeof r.close === "number").map((r) => r.close);
    if (closes.length >= 10) series[s] = closes.slice(-90);
    if (evs[i]!.ok) liveN++;
  });
  const anoms = Object.keys(series).length ? anomalyScores(series) : [];
  const bukti = anoms.length
    ? [`GNN-lite ${liveN}/${watch.length} simbol tersedia, top: ${anoms[0]!.symbol} skor ${anoms[0]!.score} (daily 90hr + correlation graph)`, `Dipindai: ${watch.join(", ")}${mentioned.length ? "" : " (watchlist default — sebut ticker untuk mengganti)"}`]
    : ["Data harian tidak cukup untuk skor anomali"];
  return pack({
    verdict: "info", probability: 0.62, confHint: 0.65, bukti,
    awam: anoms.length ? [anomaliPart(anoms[0]!, anoms.length)] : [],
    sitasi: watch.map((s) => `daily/${s}/ 90hr`),
    visual: { anoms },
    pool: [series, anoms, { nWatch: watch.length, liveN }], needs: watch.length, ok: liveN, info: true, seed: evs.some((e) => e.seed),
  });
}

async function buildObrolan(q: string, session: CreditSession): Promise<Build> {
  const help = `ARUS menjawab pertanyaan IDX apa pun: “kenapa SMAR naik?”, “yield BMRI aman?”, “ex-date BMRI kapan?”, “likuiditas BRMS?”, “banding ADRO vs PTBA”, “autopsi portofolio saya”, “broker YP aman?”, “coal naik kok ADRO turun?”, “scan pagi”.`;
  return pack({ verdict: "info", probability: 0.5, confHint: 0.6, bukti: [help], sitasi: [], pool: [], needs: 1, ok: 1, info: true });
}

/** Fase 2 v7 — placeholder jujur sampai entity resolver aktif (kandidat TIDAK pernah diklaim sebelum diverifikasi). */
async function buildEntitas(plan: Plan): Promise<Build> {
  const ent = plan.entities ?? [];
  return pack({
    verdict: "data-kurang", probability: 0.5, confHint: 0.4,
    bukti: [ent.length
      ? `Entity resolver belum aktif di build ini: kandidat ${ent.map((e) => `${e.name} → ${e.candidates.join("/")}`).join("; ")} BELUM diverifikasi ke Sectors, jadi ARUS tidak mengklaimnya. Gap ARUS, bukan gap API: company/report §overview tersedia untuk verifikasi.`
      : "Entity resolver belum aktif di build ini — ARUS tidak menebak ticker dari brand/nama. Gap ARUS, bukan gap API: company/report §overview tersedia untuk verifikasi."],
    sitasi: [], pool: [], needs: 1, ok: 0,
  });
}

/** Fase 3 v7 — placeholder jujur sampai graph reasoning aktif. */
async function buildRantai(plan: Plan): Promise<Build> {
  const hops = plan.hops ?? [];
  return pack({
    verdict: "data-kurang", probability: 0.5, confHint: 0.4,
    bukti: [`Graph reasoning (rantai hop bersitasi) belum aktif di build ini${hops.length ? `; rencana hop tervalidasi: ${hops.map((h) => `${h.from} -${h.edge}→ ${h.to}`).join("; ")}` : ""}. Gap ARUS, bukan gap API: ownership/contractor/sales-destination/get-segments tersedia.`],
    sitasi: [], pool: [], needs: 1, ok: 0,
  });
}

function finalize(intent: Intent, b: Build, q: string, session: CreditSession, seed: boolean, extraBukti: string[] = []): Omit<Kartu, "narasi" | "narrator"> & { body: string } {
  const bukti = [...b.bukti, ...extraBukti];
  const conf = Math.max(0.3, Math.min(0.9, b.confHint * (0.5 + 0.5 * (b.ok / Math.max(1, b.needs)))));
  let verdict = b.verdict;
  if (!b.info && verdict !== "data-kurang" && conf < 0.55) {
    verdict = "data-kurang";
    bukti.push("Sebagian sumber gagal diambil → confidence di bawah ambang; ARUS menolak menyimpulkan dari data bolong");
  }
  const probability = b.probability;
  const counter = b.info ? counterFor("info", b.counterCtx ?? {}) : counterFor(verdict, b.counterCtx ?? {});
  const body = `${verdict} ${probability} — ${bukti.join("; ")}. ${counter}${b.sitasi.length ? ` [${b.sitasi.join(", ")}]` : ""}`;
  const awam = buildAwam(verdict, probability, conf, b.awam ?? []);
  return {
    verdict, probability, conf, bukti, counter,
    sitasi: b.sitasi, visual: b.visual, awam,
    kredit: session.badge(), ledger: session.ledger, seed: b.seed ?? false,
    disclaimer: DISCLAIMER, subjek: b.visual && typeof b.visual === "object" && "compare" in (b.visual as object) ? "banding" : undefined,
    audit: { sumber: b.ok, gagal: b.needs - b.ok, grounded: false },
    body,
  };
}

const RANK: Record<string, number> = {
  "data-kurang": 0, info: 1, pantau: 2, campuran: 3, waspada: 4, sehat: 5, akumulasi: 5, distribusi: 6, "tak-didukung": 6, "indikasi-trap": 6,
};

/** Gabung beberapa analisis (multi-intent) jadi satu Kartu: bukti & sitasi digabung, verdict sinyal terkuat. */
export function mergeBuilds(bs: Build[]): Build {
  if (bs.length === 1) return bs[0]!;
  const dedupe = (a: string[]) => [...new Set(a)];
  const strong = bs.filter((b) => !b.info && b.verdict !== "data-kurang").sort((a, b) => (RANK[b.verdict] ?? 0) - (RANK[a.verdict] ?? 0))[0];
  const primary = bs[0]!;
  const allInfo = bs.every((b) => b.info);
  const mergedVisual = Object.assign({}, ...bs.map((b) => b.visual).filter(Boolean)) as Record<string, unknown>;
  let verdict = primary.verdict;
  let probability = primary.probability;
  if (primary.info && strong) { verdict = strong.verdict; probability = strong.probability; }
  const bukti = dedupe(bs.flatMap((b) => b.bukti));
  if (!allInfo) bukti.unshift(`Pertanyaan majemuk → ${bs.length} analisis digabung (${bs.map((b) => b.verdict).join(", ")})`);
  const byIstilah = new Map<string, AwamBagian>();
  for (const part of bs.flatMap((x) => x.awam ?? [])) if (!byIstilah.has(part.istilah)) byIstilah.set(part.istilah, part);
  return {
    verdict, probability,
    confHint: Math.min(...bs.map((b) => b.confHint)),
    bukti, sitasi: dedupe(bs.flatMap((b) => b.sitasi)),
    awam: [...byIstilah.values()],
    visual: Object.keys(mergedVisual).length ? mergedVisual : undefined,
    pool: bs.flatMap((b) => b.pool),
    needs: bs.reduce((s, b) => s + b.needs, 0),
    ok: bs.reduce((s, b) => s + b.ok, 0),
    counterCtx: strong?.counterCtx ?? primary.counterCtx,
    info: allInfo,
    seed: bs.some((x) => x.seed),
  };
}

function miss(intent: string, known: string[] = []): Build {
  return pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [clarificationText(intent, known)], sitasi: [], pool: [], needs: 1, ok: 0 });
}

async function runIntent(intent: Intent, plan: Plan, sym: string | null, tickers: string[], q: string, session: CreditSession, known: string[]): Promise<Build | null> {
  switch (intent) {
    case "obrolan": return plan.intents.length === 1 ? buildObrolan(q, session) : null;
    case "pasar": return buildPasar(session);
    case "autopsi": return buildAutopsi(q, session);
    case "banding": return tickers.length >= 2 ? buildBanding(tickers[0]!, tickers[1]!, session) : miss("banding", known);
    case "pagi": return buildPagi(q, session);
    case "screener": return buildScreener(q, session, plan.screen);
    case "entitas": return buildEntitas(plan);
    case "rantai": return buildRantai(plan);
    case "fundamental": return sym ? buildFundamental(sym, q, session, plan.fundamentalMode) : miss("fundamental", known);
    case "barang": return buildBarang(q, sym, session, plan.commodity);
    case "dna": return buildDna(plan.brokerCode, session);
    case "kuasa": return buildKuasa(sym, session);
    case "kalender": return buildKalender(sym, session);
    case "dividen": return sym ? buildDividen(sym, session) : miss("dividen", known);
    case "likuiditas": return sym ? buildLikuiditas(sym, session) : miss("likuiditas", known);
    case "rumor": return sym ? buildRumor(sym, session) : miss("rumor", known);
    case "kenapa-gerak": return sym ? buildGerak("kenapa-gerak", sym, q, session) : miss("gerak", known);
    case "risiko": return sym ? buildGerak("risiko", sym, q, session) : miss("risiko", known);
  }
}

export async function chat(q: string, session: CreditSession): Promise<Kartu> {
  const known = { portfolio: getPortfolio().map((p) => p.ticker), watchlist: getWatchlist() };
  const parsed = parsePortfolio(q);
  if (parsed) setPortfolio(parsed);
  // DUA router: heuristik + LLM planner (multi-intent). Ticker LLM divalidasi; heuristik jadi dasar.
  const plan = await planQuery(q, { portfolio: known.portfolio, watchlist: known.watchlist });
  const res = resolveTickers(q, known);
  // Portofolio/watchlist HANYA dipakai bila intent memang butuh subjek ticker.
  const usesContext = plan.intents.some((i) => ["kenapa-gerak", "rumor", "risiko", "dividen", "likuiditas", "fundamental", "autopsi", "pagi", "rantai"].includes(i));
  const tickers = [...new Set([...plan.tickers, ...(usesContext ? res.tickers : [])])];
  const sym = tickers[0] ?? null;
  addPola(q);
  if (/(watch|pantau)/i.test(q) && sym) addWatch(sym);
  if (sym && /(beli|nambah|average|dca|masuk|gas)/i.test(q)) addDecision({ ticker: sym, action: q.slice(0, 80) });

  const builds: Build[] = [];
  for (const intent of plan.intents) {
    try {
      const b = await runIntent(intent, plan, sym, tickers, q, session, known.portfolio);
      if (b) builds.push(b);
    } catch (e) {
      builds.push(pack({ verdict: "data-kurang", probability: 0.5, confHint: 0.4, bukti: [`Analisis ${intent} gagal: ${String((e as Error).message ?? e)}`], sitasi: [], pool: [], needs: 1, ok: 0 }));
    }
  }
  const b = builds.length ? mergeBuilds(builds) : await buildObrolan(q, session);

  const extra: string[] = [];
  const note = usesContext ? portfolioSourceNote(res.source) : null;
  if (note && b.verdict !== "data-kurang") extra.push(note);

  const base = finalize(plan.intents[0]!, b, q, session, false, extra);
  // Subjek hanya ditampilkan bila intent memang memakai ticker (screener tidak — jangan pamerkan "BANK").
  const usesTicker = usesContext || plan.intents.some((i) => i === "banding" || i === "fundamental");
  base.subjek = usesTicker && tickers.length ? tickers.slice(0, 3).join(" · ") : undefined;
  const poolFull = [...b.pool, { probability: base.probability, conf: base.conf }];

  // LLM PARALEL: narator, tutor Bagian 2, bantahan, pertanyaan lanjutan — semua lewat verifier/guard di bawah.
  const [nar, tut, cnt, fu] = await Promise.all([
    narrate(plan.intents.join("+"), base.body).catch(() => ({ prose: base.body, via: "deterministik ↩" })),
    base.awam ? tutorAwam(base.awam).catch(() => null) : Promise.resolve(null),
    counterLlm({ verdict: base.verdict, probability: base.probability, bukti: base.bukti }).catch(() => null),
    followUps({ subjek: base.subjek, verdict: base.verdict, bukti: base.bukti }).catch(() => null),
  ]);

  // narasi: grounding angka + guardrail; gagal → prosa deterministik
  let prose = nar.prose;
  let narrator = nar.via;
  const gcheck = verifyGrounding([prose], poolFull);
  if (!gcheck.ok) {
    prose = base.body;
    narrator = "deterministik ↩ (grounding)";
  }
  const guard = guardText(prose, true);
  if (!guard.ok) {
    prose = base.body;
    narrator = "deterministik ↩ (guardrail)";
  }

  // Bagian 2: tutor LLM hanya menang bila struktur utuh, angka grounded, bebas nasihat
  let awam = base.awam;
  let awamVia = "deterministik ↩";
  if (awam && tut) {
    const texts = [tut.pembuka, ...tut.bagian.flatMap((x) => [x.arti, x.analogi, x.kondisi]), tut.intisari, tut.penutup];
    const grounded = verifyGrounding(texts, poolFull).ok;
    const clean = texts.every((t) => guardText(t, true).ok);
    if (grounded && clean) {
      awam = {
        ...awam,
        pembuka: tut.pembuka,
        intisari: tut.intisari,
        penutup: tut.penutup,
        bagian: awam.bagian.map((part, i) => ({ ...part, arti: tut.bagian[i]!.arti, analogi: tut.bagian[i]!.analogi, kondisi: tut.bagian[i]!.kondisi })),
      };
      awamVia = `openrouter:${MODEL}+tutor`;
    }
  }

  // Bantahan: LLM hanya dipakai bila grounded + bebas nasihat
  let counter = base.counter;
  let counterVia = "deterministik ↩";
  if (cnt && guardText(cnt, true).ok && verifyGrounding([cnt], poolFull).ok) {
    counter = cnt;
    counterVia = `openrouter:${MODEL}`;
  }

  // Pertanyaan lanjutan: LLM, fallback deterministik; wajib bebas nasihat & dalam topik yang didukung ARUS
  const OUT_OF_SCOPE = /\bcpo\b|kelapa sawit|\bemas\b|\bgold\b|\bminyak\b|\boil\b|\bgas\b|\bkripto\b|\bbitcoin\b|\bcrypto\b|\bforex\b|\bobligasi\b|\breksadana\b|\bipo\b/i;
  let lanjutan = (fu ?? []).filter((x) => guardText(x, true).ok && !OUT_OF_SCOPE.test(x));
  const fuVia = lanjutan.length >= 2 ? `openrouter:${MODEL}` : "deterministik ↩";
  if (lanjutan.length < 2) lanjutan = lanjutanFor(tickers[0], plan.intents);
  lanjutan = lanjutan.slice(0, 3);

  const { body: _drop, ...rest } = base;
  void _drop;
  return {
    ...rest,
    awam,
    awamVia,
    counter,
    counterVia,
    lanjutan,
    narasi: prose,
    narrator,
    seed: base.seed ?? false,
    audit: {
      sumber: b.ok, gagal: b.needs - b.ok, grounded: gcheck.ok, router: plan.source, intents: plan.intents, catatan: plan.note,
      ungrounded: gcheck.ok ? undefined : gcheck.ungrounded.slice(0, 8),
      llmTutor: awamVia, llmCounter: counterVia, llmLanjutan: fuVia,
    },
  };
}

export function intentOf(q: string): Intent {
  return heuristicPlan(q).intents[0]!;
}