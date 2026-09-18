// scripts/verify-live.ts — verifikasi manual endpoint v7 terhadap Sectors LIVE (keluar kredit, bukan bagian eval).
// Jalankan: SEED= SECTORS_BUDGET=12 ARUS_CACHE=.cache/live-verify npx tsx scripts/verify-live.ts [--chat]
// Semua biaya tercatat di CreditSession.ledger (tampil di akhir). Bentuk respons dibandingkan dengan docs crawl.
import "dotenv/config";
import { CreditSession } from "../lib/credit.js";
import {
  fetchCommodities, fetchContracts, fetchIdxTotal, fetchLicenses, fetchMostTraded, fetchTopChanges, getterFor,
} from "../lib/evidence.js";
import { miningSlug } from "../lib/slugs.js";

const session = new CreditSession("verify-live");
const get = getterFor(session);
const mslug = miningSlug("ADRO") ?? "pt-alamtri-resources-indonesia-tbk";
const out: Record<string, unknown> = {};

const top = await fetchTopChanges(get, "top_gainers", "1d", 3);
out.topChanges = {
  ok: top.ok, err: top.err, seed: top.seed, keys: Object.keys(top.data ?? {}),
  periods: Object.keys(top.data?.top_gainers ?? {}),
  sample: (top.data?.top_gainers?.["1d"] ?? []).slice(0, 2),
};

const mt = await fetchMostTraded(get, 5, 3);
out.mostTraded = {
  ok: mt.ok, err: mt.err, seed: mt.seed, days: Object.keys(mt.data ?? {}).slice(-2),
  sample: Object.values(mt.data ?? {}).slice(-1)[0]?.slice(0, 2),
};

const it = await fetchIdxTotal(get, 30);
out.idxTotal = { ok: it.ok, err: it.err, seed: it.seed, n: it.data?.length, sample: it.data?.slice(-1)[0] };

const cm = await fetchCommodities(get);
out.commodities = { ok: cm.ok, err: cm.err, seed: cm.seed, n: cm.data?.length, sample: cm.data?.slice(0, 5) };

const lic = await fetchLicenses(get, mslug);
out.licenses = {
  ok: lic.ok, err: lic.err, seed: lic.seed, slug: mslug, total: lic.data?.pagination?.total_count,
  n: lic.data?.results?.length, sample: lic.data?.results?.slice(0, 1),
};

const con = await fetchContracts(get, mslug);
out.contracts = { ok: con.ok, err: con.err, seed: con.seed, slug: mslug, n: con.data?.length, sample: con.data?.slice(0, 2) };

if (process.argv.includes("--licenses")) {
  const ptba = await fetchLicenses(get, "pt-bukit-asam-tbk", 3);
  out.licensesPtba = {
    ok: ptba.ok, err: ptba.err, total: ptba.data?.pagination?.total_count,
    slugs: [...new Set((ptba.data?.results ?? []).map((r) => r.company_slug ?? "null"))],
    sample: ptba.data?.results?.slice(0, 1),
  };
  const raw = await get<{ results?: { company_slug?: string | null; company_name?: string }[] }>(`/mining/licenses/?limit=5&order_by=license_expiry_date`, {});
  out.licensesListUnfiltered = {
    rows: raw.data?.results?.length,
    companies: (raw.data?.results ?? []).map((r) => `${r.company_name} [${r.company_slug ?? "null"}]`),
  };
}

console.log(JSON.stringify(out, null, 2));

if (process.argv.includes("--chat")) {
  const { chat } = await import("../lib/orchestrator.js");
  for (const q of ["top gainer hari ini apa?", "komoditas CPO gimana?"]) {
    const s = new CreditSession("verify-live-chat");
    const k = await chat(q, s);
    console.log(JSON.stringify({
      q, verdict: k.verdict, kredit: k.kredit, router: k.audit?.router, intents: k.audit?.intents,
      catatan: k.audit?.catatan, subjek: k.subjek, seed: k.seed,
      bukti0: k.bukti[0]?.slice(0, 200), narrator: k.narrator,
      visualKeys: k.visual && typeof k.visual === "object" ? Object.keys(k.visual) : [],
      ledger: s.ledger.map((e) => `${e.cost}kr ${e.cached ? "cache" : "live"} ${e.endpoint}`),
    }, null, 2));
  }
}

console.log(`\nSPENT ${session.spent}kr · ${session.ledger.length} call`);
for (const e of session.ledger) console.log(`  ${e.cost}kr ${e.cached ? "cache" : "live"} ${e.endpoint}`);