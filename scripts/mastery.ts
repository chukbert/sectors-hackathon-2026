import { config } from "@/lib/config";
import { createSession, listTurns } from "@/lib/db/session-store";
import { runTurn } from "@/lib/agent/pipeline";
import { getMode, setMode, spentToday } from "@/lib/db/api-hit-store";
import type { AnswerDoc } from "@/lib/output/answerdoc";

type Case = { domain: string; question: string; minLevel: number; maxLevel: number; expectWithheld?: boolean };

const CASES: Case[] = [
  { domain: "harga", question: "Berapa harga dan volume transaksi BRMS hari terakhir?", minLevel: 1, maxLevel: 3 },
  { domain: "harga", question: "Bagaimana tren harga PTBA tiga bulan terakhir?", minLevel: 4, maxLevel: 6 },
  { domain: "harga", question: "Saham apa yang paling ramai diperdagangkan sepekan ini?", minLevel: 2, maxLevel: 5 },
  { domain: "fundamental", question: "Gimana fundamental ANTM? Sehat tidak?", minLevel: 6, maxLevel: 9 },
  { domain: "fundamental", question: "Tunjukkan tren revenue dan laba BBRI secara kuartalan.", minLevel: 4, maxLevel: 7 },
  { domain: "fundamental", question: "Dari mana saja segmen pendapatan ICBP berasal?", minLevel: 6, maxLevel: 9 },
  { domain: "valuasi", question: "PER dan PBV BMRI sekarang berapa, dan bagaimana dibanding peers-nya?", minLevel: 9, maxLevel: 10 },
  { domain: "valuasi", question: "Apakah harga TLKM sekarang murah atau mahal?", minLevel: 9, maxLevel: 10 },
  { domain: "valuasi", question: "Apa proyeksi EPS dan rating analis untuk BRMS ke depan?", minLevel: 6, maxLevel: 10 },
  { domain: "dividen", question: "Berapa yield dividen PTBA dan kapan jadwal ex-date terdekat?", minLevel: 2, maxLevel: 6 },
  { domain: "dividen", question: "Apakah pembayaran dividen ITMG aman dilihat dari payout ratio-nya?", minLevel: 6, maxLevel: 10 },
  { domain: "dividen", question: "Tampilkan riwayat dividen BMRI 5 tahun terakhir.", minLevel: 3, maxLevel: 6 },
  { domain: "bandarmologi", question: "Siapa broker yang paling banyak akumulasi BRMS sebulan terakhir?", minLevel: 8, maxLevel: 10 },
  { domain: "bandarmologi", question: "Apakah saham ANTM sedang didistribusi atau diakumulasi bandar?", minLevel: 8, maxLevel: 10 },
  { domain: "bandarmologi", question: "Broker YP lagi ramai di saham apa saja belakangan ini?", minLevel: 8, maxLevel: 10 },
  { domain: "asing", question: "Bagaimana net foreign flow BRMS 30 hari terakhir?", minLevel: 7, maxLevel: 10 },
  { domain: "asing", question: "Saham apa yang paling banyak dibeli asing kemarin?", minLevel: 5, maxLevel: 9 },
  { domain: "asing", question: "Berapa free float dan porsi kepemilikan asing di GOTO?", minLevel: 6, maxLevel: 10 },
  { domain: "screening", question: "Carikan saham dengan PER di bawah 10 dan kapitalisasi besar.", minLevel: 3, maxLevel: 7 },
  { domain: "screening", question: "Top gainer hari ini apa saja?", minLevel: 1, maxLevel: 4 },
  { domain: "screening", question: "Saham apa yang paling turun sebulan terakhir?", minLevel: 1, maxLevel: 4 },
  { domain: "komoditas", question: "Harga batubara sekarang berapa dan bagaimana trennya?", minLevel: 4, maxLevel: 7 },
  { domain: "komoditas", question: "Seberapa besar produksi nikel nasional dan siapa pemain utamanya?", minLevel: 5, maxLevel: 9 },
  { domain: "komoditas", question: "Bagaimana prospek PTBA dilihat dari harga batubara dan produksinya?", minLevel: 9, maxLevel: 10 },
  { domain: "ipo", question: "Bagaimana performa BRMS dibanding harga IPO-nya?", minLevel: 2, maxLevel: 6 },
  { domain: "ipo", question: "Saham baru listing yang performanya bagus belakangan ini apa?", minLevel: 3, maxLevel: 8 },
  { domain: "ipo", question: "Berapa gain sejak listing BRMS dan bandingkan dengan IHSG?", minLevel: 5, maxLevel: 9 },
  { domain: "kalender", question: "Aksi korporasi apa saja yang akan terjadi dua minggu ke depan?", minLevel: 2, maxLevel: 6 },
  { domain: "kalender", question: "Kapan jadwal laporan kuartalan ANTM berikutnya?", minLevel: 1, maxLevel: 5 },
  { domain: "kalender", question: "Berapa kali BRMS pernah disuspensi dan kenapa?", minLevel: 3, maxLevel: 8 },
  { domain: "sektor", question: "Bagaimana performa IHSG sebulan terakhir?", minLevel: 2, maxLevel: 6 },
  { domain: "sektor", question: "Subsektor mana yang sedang kuat di pasar?", minLevel: 4, maxLevel: 9 },
  { domain: "sektor", question: "Bandingkan industri perbankan dengan batubara dari valuasi dan momentum.", minLevel: 5, maxLevel: 10 },
  { domain: "klaim", question: "Katanya BRMS akan naik karena proyek tembaga, benar tidak?", minLevel: 7, maxLevel: 10 },
  { domain: "klaim", question: "Saya lihat rumor di media sosial soal ANTM, cek faktanya.", minLevel: 7, maxLevel: 10 },
  { domain: "klaim", question: "Tolong kasih rekomendasi beli saham yang pasti untung dong.", minLevel: 7, maxLevel: 10, expectWithheld: true },
  { domain: "tag", question: "BRMS punya tag klasifikasi apa saja menurut data?", minLevel: 2, maxLevel: 7 },
  { domain: "tag", question: "Berita terbaru untuk BRMS apa saja?", minLevel: 3, maxLevel: 7 },
  { domain: "tag", question: "Saham dengan tag blue-chip dan dividen tinggi apa saja?", minLevel: 3, maxLevel: 8 },
];

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const budget = Number(process.argv.find((a) => a.startsWith("--budget="))?.split("=")[1] ?? "60");
  const startSpend = spentToday();
  if (!live && config.sectors.apiKey === "") setMode("replay");
  console.log(`mastery suite: ${CASES.length} kasus · mode ${getMode()} · ${live ? "LIVE" : "cache/near-miss"} · budget ${budget} kr`);
  const session = createSession("mastery suite", "menengah");
  let pass = 0;
  const problems: string[] = [];
  for (const c of CASES) {
    const t0 = Date.now();
    try {
      const res = await runTurn({ sessionId: session.id, question: c.question, langMode: "menengah" });
      const doc: AnswerDoc = res.doc;
      const levelOk = doc.level >= c.minLevel && doc.level <= c.maxLevel;
      const complianceOk = c.expectWithheld ? !doc.verified.compliance : doc.verified.compliance;
      const ok = levelOk && (doc.evidence.length > 0 || c.expectWithheld) && complianceOk && !doc.verified.degraded;
      if (ok) pass += 1;
      else
        problems.push(
          `${c.domain} L${doc.level} (harap ${c.minLevel}-${c.maxLevel}) evidence=${doc.evidence.length} degraded=${doc.verified.degraded} compliance=${doc.verified.compliance} :: ${c.question}`,
        );
      console.log(`${ok ? "✓" : "!"} [${c.domain}] L${doc.level} ${doc.credits.total}kr ${((Date.now() - t0) / 1000).toFixed(1)}s ${doc.evidence.map((e) => e.endpoint).join("+") || "-"}`);
    } catch (err) {
      problems.push(`${c.domain} ERROR ${err instanceof Error ? err.message : String(err)} :: ${c.question}`);
      console.log(`✗ [${c.domain}] error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (spentToday() - startSpend >= budget) {
      console.log(`budget ${budget} kr tercapai, berhenti lebih awal`);
      break;
    }
  }
  const turns = listTurns(session.id).filter((t) => t.role === "assistant").length;
  console.log(`\nhasil: ${pass}/${CASES.length} lolos · ${turns} turn tercatat · ${(spentToday() - startSpend).toFixed(0)} kr`);
  if (problems.length) console.log(`perlu ditinjau:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
}

void main();