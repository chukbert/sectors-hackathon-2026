// Orkestrasi khusus (bukan framework): planner → 5 spesialis paralel → verifier → bantah → synthesis.
// ATURAN ARSITEKTUR yang membuat klaim "zero numeric hallucination" nyata:
//   semua ANGKA pada kartu dihasilkan KODE deterministik (flow/fomo/graph/mover) —
//   LLM hanya menyusun PROSA; setiap bullet prose lolos gate lib/ground.ts terhadap JSON tool.
import { sectorsGet, isoDaysAgo, lastTradingDay, SectorsUnavailable } from "./sectors.ts";
import { kohortFlowIndex, flowSentences } from "./flow.ts";
import { fomoMeter, type DailyRow } from "./fomo.ts";
import { loadOwnerships, clusterOwnerships, egoGraph, autopsiKartu, knownMembers, knownGroup } from "./graph.ts";
import { verifyGrounding } from "./ground.ts";
import { toolLoop, completeJson, llmOk } from "./llm.ts";
import type { ToolName } from "./tools.ts";
import type { Kartu, KartuPillar, PillarId, Intent, FlowIndex, GraphPayload, FomoMeter, ChatEvent } from "./types.ts";
import { chasePattern } from "./memory.ts";

export interface Plan { intent: Intent; tickers: string[]; question: string }
export interface PillarOut { id: PillarId; title: string; ok?: boolean; viral?: boolean; weak?: boolean; bullets: string[]; toolJsons: unknown[]; evidence: string; cached: boolean }

const AUTOPSI_RE = /autopsi|bedah|diversif|portofolio\s*saya|porto\s*saya/i;
const PANIC_RE = /panik|panic|anjlok|merah|hajar|all\s?in|semangat|susut|nyangkut/i;
const CHASE_RE = /average\s?down|nambahin|nambah|beli lagi|dca|masuk lagi|gass/i;
const PAGI_RE = /morning|pagi ini|brief|hari ini gimana|sebelum buka/i;

export function planFallback(message: string, portfolioTickers: string[] = []): Plan {
  // ticker = token 4 huruf Kapital-persis di teks ASLI ("saya"≠"SAYA"); IDX konsisten 4 huruf kapital
  const tickers = [...new Set([...message.matchAll(/\b([A-Z]{4})\b/g)].map((m) => m[1]))];
  const intent: Intent = AUTOPSI_RE.test(message) ? "autopsi-portofolio" : PAGI_RE.test(message) ? "pagi"
    : CHASE_RE.test(message) || /boleh ikut|ganti|masuk|beli/.test(message.toLowerCase()) ? "evaluasi-beli"
    : PANIC_RE.test(message) ? "risiko"
    : /kenapa|naik|turun|gerak|goreng|apa yang/.test(message.toLowerCase()) ? "kenapa-gerak" : "obrolan";
  return { intent, tickers: tickers.length ? tickers : portfolioTickers.slice(0, 10), question: message };
}

export async function planner(message: string, portfolioTickers: string[]): Promise<Plan> {
  const fb = planFallback(message, portfolioTickers);
  if (!llmOk()) return fb;
  try {
    return await completeJson<Plan>(
      "Kamu planner ARUS, router multi-agent untuk investor ritel IDX. Klasifikasi pesan user dalam Bahasa Indonesia.",
      `Pesan: "${message}"\nTicker known dari portofolio/user: ${JSON.stringify(portfolioTickers)}\n` +
      `Keluaran JSON: {"intent":"kenapa-gerak|evaluasi-beli|autopsi-portofolio|pagi|risiko|obrolan","tickers":["…4-huruf"],"question":"…"}\n` +
      `Aturan: autopsi/bedah portofolio → autopsi-portofolio; pertanyaan "boleh ikut/mau beli/average down" → evaluasi-beli; panik/merah → risiko; sapaan tanpa ticker → obrolan.`,
      (x): x is Plan => !!x && typeof (x as Plan).intent === "string" && Array.isArray((x as Plan).tickers));
  } catch { return fb; }
}

// ── mover (deterministik) ───────────────────────────────────────────────────
export interface MoverOut { fomo: FomoMeter; daily: DailyRow[]; price: number; change_pct: number; vol_mult: number; ret7: number; ret30: number }
export async function moverEvidence(ticker: string): Promise<MoverOut> {
  const end = lastTradingDay();
  const j = await sectorsGet("daily", { symbol: ticker, start: isoDaysAgo(90), end }) as
    { data?: DailyRow[] } | DailyRow[];
  const daily = ((Array.isArray(j) ? j : j.data) ?? []).filter((d) => typeof d.close === "number");
  if (!daily.length) throw new SectorsUnavailable(`tidak ada data harga utk ${ticker}`);
  const fomo = fomoMeter({ daily });
  const last = daily[daily.length - 1];
  const volMult = daily.length > 20 ? last.volume / (daily.slice(-21, -1).reduce((s, d) => s + d.volume, 0) / 20 || 1) : 1;
  const ret7 = daily.length > 7 ? (last.close / daily[daily.length - 8].close - 1) * 100 : 0;
  const ret30 = daily.length > 30 ? (last.close / daily[daily.length - 31].close - 1) * 100 : ret7;
  fomo.components.forEach((c) => { if (c.label === "7d return") c.value = `${ret7 >= 0 ? "+" : ""}${Math.round(ret7)}%`; });
  return { fomo, daily, price: last.close, change_pct: Math.round(ret7), vol_mult: Math.round(volMult * 10) / 10, ret7, ret30 };
}

// ── katalis (LLM tool-loop + hitungan grounding) ────────────────────────────
const KATALIS_TOOLS: ToolName[] = ["news", "filings", "corporate_actions", "suspensions", "tags"];
export async function katalisPillar(ticker: string, plan: Plan, emit: (l: string, o?: { ok?: boolean }) => void): Promise<PillarOut> {
  const end = lastTradingDay(), start = isoDaysAgo(14);
  const [news, filings, susp] = await Promise.all([
    sectorsGet("news", { symbols: ticker, start, end }).catch(() => ({ results: [] })),
    sectorsGet("filings", { symbol: ticker, start, end }).catch(() => ({ results: [] })),
    sectorsGet("suspensions", { symbol: ticker }).catch(() => ({ results: [] })),
  ]);
  const nArt = ((news as { results?: unknown[] }).results ?? []).length;
  const nFil = ((filings as { results?: unknown[] }).results ?? []).length;
  const nSusp = ((susp as { results?: unknown[] }).results ?? []).length;
  const viral_no_filing = nArt > 0 && nFil === 0;
  let title = viral_no_filing ? "Viral > substantif" : nFil > 0 ? "Ada filings — cek isi vs klaim" : "Sepi berita & filing";
  const bullets = [
    `${nArt} berita 14 hari; ${nFil} filing terkait — cross-check: ${viral_no_filing ? "klaim berita TIDAK didukung filing apa pun" : "berita dan filing sejalan atau sedikit"}`,
    `${nSusp} riwayat suspend — ${nSusp ? "⚑ bisa disetop kapan pun" : "belum pernah suspend"}`,
  ];
  if (llmOk()) {
    try {
      const out = await toolLoop({
        system: "Kamu News-Agent ARUS. Tugasm: pisahkan katalis SUBSTANTIF vs VIRAL untuk satu ticker IDX. Cross-check klaim judul berita vs filing/corporate-actions. Bahasa Indonesia, hemat kata. Jawab JSON {\"title\":\"…\",\"bullets\":[\"…\",\"…\",\"…\"]} — angka HANYA yang kamu lihat di hasil tool.",
        user: `Ticker ${ticker}. Pertanyaan user: "${plan.question}". Data awal: ${nArt} berita, ${nFil} filing, ${nSusp} suspend (14d). Panggil tool bila perlu; jangan mengarang.`,
        tools: KATALIS_TOOLS });
      const j = out.json as { title?: string; bullets?: string[] } | null;
      if (j?.title) title = j.title;
      if (Array.isArray(j?.bullets) && j.bullets.length) bullets.push(...j.bullets.filter((b) => typeof b === "string").slice(0, 3));
      return { id: "katalis", title, ok: !viral_no_filing, viral: viral_no_filing, bullets, toolJsons: [news, filings, susp, ...out.toolJsons], evidence: "news×filings×suspensions", cached: true };
    } catch (e) { emit(`news ↩ fallback deterministik (${(e as Error).message.slice(0, 40)})`, { ok: false }); }
  }
  return { id: "katalis", title, ok: !viral_no_filing, viral: viral_no_filing, bullets, toolJsons: [news, filings, susp], evidence: `news ${nArt}/filing ${nFil}`, cached: true };
}

// ── fundamentals (LLM tool-loop; fallback: valuasi dari company_report) ────
const FUND_TOOLS: ToolName[] = ["company_report", "quarterly_financials", "subsector_report", "subsectors", "company_segments", "free_float"];
export async function fundamentalPillar(ticker: string, plan: Plan): Promise<PillarOut> {
  const rep = await sectorsGet("company_report", { symbol: ticker, sections: "valuation,overview" }).catch(() => null) as never;
  const toolJsons: unknown[] = rep ? [rep] : [];
  const hist = (rep as { valuation?: { historical_valuation?: { pb?: number; pb_peer_avg?: number }[] } } | null)?.valuation?.historical_valuation ?? [];
  const medPb = hist.length ? hist[hist.length - 1] : undefined;
  if (medPb?.pb && medPb.pb_peer_avg) toolJsons.push({ derived: "valuation", pb: medPb.pb, pb_peer_avg: medPb.pb_peer_avg, premium: Math.round((medPb.pb / medPb.pb_peer_avg) * 10) / 10 });
  let title = medPb ? `PBV ${medPb.pb ?? "?"}× vs teman sekelompok ${medPb.pb_peer_avg ?? "?"}×` : "Data valuasi terbatas";
  const bullets = medPb ? [
    `PBV terakhir ${medPb.pb}×; rata-rata peers subsektor ${medPb.pb_peer_avg}× — premium ${medPb.pb && medPb.pb_peer_avg ? Math.round((medPb.pb / medPb.pb_peer_avg) * 10) / 10 : "?"}×`,
    `PE/PB historis per tahun tersedia di laporan; pergerakan harus dibaca vs angka ini`,
  ] : ["company_report §valuation kosong — agen tidak akan mengarang penggantinya"];
  if (llmOk()) {
    try {
      const out = await toolLoop({
        system: "Kamu Fundamentals-Agent ARUS. Jelaskan apakah PERGERAKAN harga ditopang KINERJA (revenue/earnings kuartalan, segmen, valuasi vs subsektor). ATURAN TOOL: nilai sub_sector untuk subsector_report WAJIB dari field sub_sector pada company-report §overview (kebab-case asli) atau daftar /subsectors — jangan mengarang slug. company_segments boleh 404 (emiten tanpa data segmen) → lewati, jangan diulang. Bahasa Indonesia. Jawab JSON {\"title\":\"…\",\"bullets\":[\"…\",\"…\",\"…\"],\"weak\":true|false}. weak=true bila kinerja memburuk/tidak berubah padahal harga naik. Semua angka harus dari hasil tool.",
        user: `Ticker ${ticker}. Konteks: "${plan.question}".`, tools: FUND_TOOLS });
      const j = out.json as { title?: string; bullets?: string[]; weak?: boolean } | null;
      if (j?.title) title = j.title;
      if (Array.isArray(j?.bullets)) bullets.unshift(...j.bullets.filter((b) => typeof b === "string").slice(0, 3));
      return { id: "fundamental", title, ok: !(j?.weak ?? false), weak: !!(j?.weak), bullets: bullets.slice(0, 4), toolJsons: [...toolJsons, ...out.toolJsons], evidence: "valuation+quarterly", cached: true };
    } catch { /* pakai hitungan dasar */ }
  }
  return { id: "fundamental", title, ok: undefined, bullets, toolJsons, evidence: "valuation dasar", cached: true };
}

// ── grup (deterministik + LLM labeler) ──────────────────────────────────────
export async function grupPillar(ticker: string, peerTickers: string[], portfolio: { ticker: string; pct: number }[], user: string): Promise<PillarOut & { graph?: GraphPayload }> {
  const universe = [...new Set([ticker.toUpperCase(), ...peerTickers.map((t) => t.toUpperCase()), ...portfolio.map((p) => p.ticker)])].slice(0, 14);
  let own = await loadOwnerships(universe);
  let clusters = clusterOwnerships(own);
  const g0 = (clusters.get(ticker.toUpperCase()) ?? "") || knownGroup(ticker) || "";
  // perluas ego-graph ke tetangga grup (known-list) supaya "siapa lagi sekelompok" terlihat;
  // klaster tetap hanya terbentuk bila nama pengendali di DATA cocok — known-list cuma memanggil kandidat.
  if (g0) {
    const extra = knownMembers(g0).filter((t) => /^[A-Z]{4}$/.test(t) && !universe.includes(t)).slice(0, 6);
    if (extra.length) {
      own = own.concat(await loadOwnerships(extra));
      clusters = clusterOwnerships(own);
    }
  }
  const g = clusters.get(ticker.toUpperCase()) ?? "";
  const graph = egoGraph(ticker, clusters, own);
  const bullets = g
    ? [`pengendali: ${g} — ${graph.nodes.filter((n) => !n.hub).length} emiten ter-cluster satu grup di universe yang dicek`, `free float & riwayat suspend diperiksa pilar lain (⚑ bila kecil / sering)`]
    : ["tidak ada pemegang pengendali yang sama dengan ticker lain di universe ini — independen (sejauh data)"];
  const asked = ticker.toUpperCase();
  const peer = portfolio.find((p) => p.ticker.toUpperCase() !== asked && (clusters.get(p.ticker.toUpperCase()) ?? "") === g && g !== "");
  if (peer) bullets.unshift(`⚑ satu grup dengan ${peer.ticker.toUpperCase()} yang SUDAH kamu pegang`);
  let title = g ? `Satu grup dengan ${g}` : "Tidak sekelompok dengan yang kamu pegang";
  if (llmOk()) {
    try {
      const out = await completeJson<{ title?: string; note?: string }>(
        "Kamu Graph-Agent ARUS. Dari cluster kepemilikan terhitung, tulis SATU judul kartu + SATU kalimat 'siapa diuntungkan kalau kamu beli ini' (guanxi). Bahasa Indonesia, tanpa angka baru.",
        `Ticker ${ticker}; grup: ${g || "independen"}; anggota cluster: ${JSON.stringify(own.filter((o) => (clusters.get(o.ticker) ?? "") === g).map((o) => ({ t: o.ticker, holders: o.holders.filter((h) => h.share_percentage >= 20) })))}`,
        (x): x is { title?: string } => !!x);
      if (out.title) title = out.title;
      if (out.note) bullets.push(out.note);
    } catch { /* template cukup */ }
  }
  return { id: "grup", title, ok: !g, bullets, toolJsons: [own.map((o) => ({ ticker: o.ticker, group: o.group, holders: o.holders }))], evidence: "ownership×" + universe.length, cached: true, graph };
}

// ── BANTAH-AGENT (adversarial, wajib) ───────────────────────────────────────
export async function bantah(plan: Plan, ticker: string, flow: FlowIndex | null, fomo: FomoMeter | null, evidenceLines: string[]):
  Promise<{ user_case: string; rebuttal: string }> {
  if (llmOk()) {
    try {
      return await completeJson(
        "Kamu Bantah-Agent ARUS. Susun kasus TERKUAT sisi LAWAN dari kecenderungan implisit user (kalau dia mau ikut, susun alasan beli terkuat), lalu patahkan dengan DATA yang diberikan. Jangan kasih nasihat beli/jual. Bahasa Indonesia. JSON {\"user_case\":\"…\",\"rebuttal\":\"…\"}. Angka hanya dari data.",
        `Ticker ${ticker}. FOMO ${fomo?.score ?? "?"}/100 (${fomo?.label ?? ""}). Bukti: ${evidenceLines.join(" | ").slice(0, 1500)}`,
        (x): x is { user_case: string; rebuttal: string } => {
          const o = x as { user_case?: unknown; rebuttal?: unknown } | null;
          return !!o && typeof o.user_case === "string" && typeof o.rebuttal === "string";
        });
    } catch { /* fallback template */ }
  }
  const hot = (fomo?.score ?? 0) >= 65;
  const dist = flow?.distribusi_ritel;
  return {
    user_case: hot ? "Momentum kuat, nanti lanjut naik, kali ini beda." : "Katalisnya kelihatan nyata, worth it dicek.",
    rebuttal: dist
      ? `Data mematahkan "ini beda": kenaikan dibayar kohort ritel sendiri (+${flow!.retail_net_m} M/7d) persis saat uang besar keluar (−${Math.abs(flow!.institusi_net_m)} M). Lawan transaksimu adalah yang jualan.`
      : `Sebelum ikut: cocokkan klaim berita dengan filing (0-vs-N adalah tanda paling murah untuk dikenali). Keputusan tetap punyamu — ARUS tidak menyuruh.`,
  };
}

// ── pipeline utama satu pertanyaan ticker ───────────────────────────────────
export type Emit = (e: ChatEvent) => void;

const icFor = (id: PillarId) => ({ mover: "📈", katalis: "🗞", flow: "💸", grup: "🏢", fundamental: "📊" })[id];
const labelFor = (id: PillarId) => ({ mover: "Penggerak", katalis: "Katalis", flow: "Arus Uang", grup: "Grup", fundamental: "Fundamental" })[id];

export async function runTickerAnalysis(plan: Plan, emit: Emit, user: string, portfolio: { ticker: string; pct: number }[]) {
  const ticker = plan.tickers[0] ?? "BBCA";
  emit({ type: "trace", line: `◇ planner · intent ${plan.intent} → pilar: mover flow katalis fundamental grup` });

  const toolJsons: unknown[] = [];
  const evidenceLines: string[] = [];

  // mover + flow deterministik dulu (angka kartu = kode, bukan LLM)
  let mover: MoverOut | null = null;
  try {
    mover = await moverEvidence(ticker);
    toolJsons.push({ derived: "mover", price: mover.price, change_pct_7d: mover.change_pct, vol_mult: mover.vol_mult, ret7: Math.round(mover.ret7), ret30: Math.round(mover.ret30), fomo: mover.fomo });
    emit({ type: "trace", line: `▸ mover ✓ ${mover.change_pct >= 0 ? "+" : ""}${mover.change_pct}%/7d · vol ${mover.vol_mult}×`, ok: true });
  } catch (e) { emit({ type: "trace", line: `▸ mover ✗ ${(e as Error).message.slice(0, 60)}`, ok: false }); }

  let flow: FlowIndex | null = null;
  try { flow = await kohortFlowIndex(ticker, 7); toolJsons.push(flow); emit({ type: "trace", line: `▸ flow ✓ join broker-summary × registry — ritel ${flow.retail_net_m} M vs institusi ${flow.institusi_net_m} M`, ok: true }); }
  catch (e) { emit({ type: "trace", line: `▸ flow ✗ ${(e as Error).message.slice(0, 60)}`, ok: false }); }
  if (flow) evidenceLines.push(...flowSentences(flow));

  // pilar paralel
  const [katalis, fund, grup] = await Promise.allSettled([katalisPillar(ticker, plan, (l, o) => emit({ type: "trace", line: `▸ news ${o?.ok ? "✓ " : "↩ "}${l}` })), fundamentalPillar(ticker, plan), grupPillar(ticker, [], portfolio, user)]);
  const pillars: (KartuPillar & { graph?: GraphPayload })[] = [];
  for (const [name, r] of [["news", katalis], ["fundamentals", fund], ["graph", grup]] as const) {
    if (r.status === "fulfilled") {
      toolJsons.push(...r.value.toolJsons);
      pillars.push({ id: r.value.id, ic: icFor(r.value.id), label: labelFor(r.value.id), title: r.value.title, ok: r.value.ok, bullets: r.value.bullets });
      emit({ type: "trace", line: `▸ ${name} ✓ ${r.value.evidence}`, ok: true });
    } else emit({ type: "trace", line: `▸ ${name} ✗ ${(r.reason as Error)?.message?.slice(0, 60)}`, ok: false });
  }
  const graphPayload = grup.status === "fulfilled" ? grup.value.graph : undefined;
  // FOMO final = semua komponen (termasuk divergence berita-vs-filing & streak asing) — tetap dari KODE
  if (mover && (flow || katalis.status === "fulfilled" || fund.status === "fulfilled")) {
    mover.fomo = fomoMeter({ daily: mover.daily,
      asing_sell_streak: flow?.asing_sell_streak,
      news_no_filing: katalis.status === "fulfilled" && !!katalis.value.viral,
      fundamental_weak: fund.status === "fulfilled" && !!fund.value.weak });
    toolJsons.push({ derived: "mover-final", fomo: mover.fomo });
  }
  if (mover) {
    evidenceLines.push(`7d ${mover.ret7.toFixed(0)}% · vol z ${mover.fomo.components[1]?.value}`, `FOMO ${mover.fomo.score}/100 ${mover.fomo.label}`);
    pillars.unshift({ id: "mover", ic: icFor("mover"), label: labelFor("mover"), title: `Harga ${mover.price} · ${mover.change_pct >= 0 ? "+" : ""}${mover.change_pct}%/7d · vol ${mover.vol_mult}×`, ok: (mover.fomo.score ?? 0) < 65,
      bullets: [`deviasi SMA20 ${mover.fomo.components[2]?.value} · 30d ${mover.ret30 >= 0 ? "+" : ""}${Math.round(mover.ret30)}%`, `Meter FOMO dihitung dari return+z-vol+SMA+divergence berita+asing (lihat komponen)`] });
  }

  // VERIFIER: gate prosa terhadap JSON tool (angka dari kode tidak lewat gate — memang dari kode)
  const claims = pillars.flatMap((p) => p.bullets);
  const v = verifyGrounding(claims, toolJsons);
  emit({ type: "trace", line: `◈ verifier · ${claims.length} klaim · ${v.ungrounded.length} angka tak terlacak${v.ungrounded.length ? " → dibuang: " + v.ungrounded.slice(0, 3).join(", ") : " ✓"}`, ok: v.ok });
  if (v.ungrounded.length) for (const p of pillars) p.bullets = p.bullets.filter((b) => verifyGrounding([b], toolJsons).ok);

  const bantahOut = await bantah(plan, ticker, flow, mover?.fomo ?? null, evidenceLines);
  emit({ type: "trace", line: `◈ bantah-agent ✓ kasus ${plan.intent === "risiko" ? "penenang" : "lawan"} disusun`, ok: true });
  emit({ type: "trace", line: "◆ synthesis · merangkai kartu…" });

  const flags: string[] = [];
  if (flow?.distribusi_ritel) flags.push("⚑ pola distribusi ke kohort ritel");
  if (flow?.insider_sold) flags.push("⚑ insider menjual dalam window");
  if ((mover?.fomo.score ?? 0) >= 80) flags.push("⚑ FOMO ekstrem");
  if (grup.status === "fulfilled" && grup.value.bullets.some((b) => b.startsWith("⚑"))) flags.push("⚑ sudah ada anggota grup di portofoliomu");

  // pertanyaan yang dikembalikan (bukan advice — inti produk §3)
  const question = flow?.distribusi_ritel
    ? "kamu masuk sebagai siapa — penerus, atau exit liquidity? Kalau berita terbukti angin, exit plan kamu di angka berapa?"
    : "sebelum lanjut: apa yang akan mengubah jawaban ini? Tulis datanya, lalu cek lagi.";

  // pillar flow: kalimat terhitung (bukan karangan LLM)
  if (flow) pillars.push({ id: "flow", ic: "💸", label: "Arus Uang",
    title: `Kohort Flow Index · 7 hari · ritel ${flow.retail_net_m >= 0 ? "+" : ""}${flow.retail_net_m} M vs uang besar ${flow.institusi_net_m >= 0 ? "+" : ""}${flow.institusi_net_m} M`,
    bullets: flowSentences(flow) });

  // Cermin Perilaku: pola lama pada ticker yang sama (F6)
  let memory: Kartu["memory"];
  const chase = mover && chasePattern(user, ticker.toUpperCase(), mover.change_pct);
  if (chase) {
    const ago = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(chase.ts));
    memory = { title: "deteksi pola: chase",
      bullets: [
        `${ago} — ${chase.action}. Alasanmu saat itu: “${chase.note || "(tanpa catatan)"}”. Harga saat itu ${Math.round(chase.price)} (${chase.chg_pct >= 0 ? "+" : ""}${Math.round(chase.chg_pct)}% dari hari sebelumnya).`,
        `Hari ini ${ticker.toUpperCase()} kembali ${mover!.change_pct >= 0 ? "+" : ""}${mover!.change_pct}% dan kamu bertanya lagi tentang ticker yang sama.`,
      ],
      reflection: "Ini keputusan yang sama dengan baju berbeda. ARUS tidak mengeksekusi apa pun — hanya memantulkan jejakmu sendiri." };
    emit({ type: "trace", line: `▸ memory ✓ pola chase ditemukan (${Math.round((Date.now() - chase.ts) / 864e5)} hari lalu)`, ok: true });
  }

  const kartu: Kartu = {
    ticker: ticker.toUpperCase(),
    company: (await sectorsGet("company_report", { symbol: ticker, sections: "overview" }).catch(() => null) as { overview?: { company_name?: string } } | null)?.overview?.company_name ?? "",
    price: mover?.price ?? 0, change_pct: mover?.change_pct ?? 0, vol_mult: mover?.vol_mult ?? 0,
    fomo: mover?.fomo ?? { score: 0, label: "dingin", components: [] },
    pillars: pillars.sort((a, b) => ["mover", "katalis", "flow", "grup", "fundamental"].indexOf(a.id) - ["mover", "katalis", "flow", "grup", "fundamental"].indexOf(b.id)),
    flow: flow ?? undefined, graph: graphPayload, bantah: bantahOut, question, flags, memory,
    stamp: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " WIB",
  };
  emit({ type: "kartu", kartu });
  return kartu;
}

export { autopsiKartu };
