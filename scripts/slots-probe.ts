import { extractSlots } from "@/lib/agent/slots";

const CASES: Array<{ label: string; q: string; expect: (s: Awaited<ReturnType<typeof extractSlots>>) => boolean }> = [
  { label: "alias panggilan 'bank biru'", q: "Bank biru close di berapa kemarin?", expect: (s) => s.symbols.includes("BBCA") },
  { label: "nama merek → emiten", q: "Gimana harga saham indomie terakhir?", expect: (s) => s.symbols.includes("ICBP") },
  { label: "ticker non-4huruf/unknown casing", q: "harga saham byan?", expect: (s) => s.symbols.includes("BYAN") },
  { label: "tanpa emiten → sektor + indeks + predikat", q: "IHSG hari ini gimana, dan gimana kinerja sektor perbankan seminggu terakhir?", expect: (s) => s.indexCode === "ihsg" && s.periodDays === 7 && (s.sectorPredicate === "sub_sector = 'banks'" || s.sectorText === "bank") },
  { label: "rumor + window", q: "Katanya ANTM mau terbang bulan depan, benar gak?", expect: (s) => s.symbols.includes("ANTM") && s.isRumor },
  { label: "discovery → simbol WAJIB kosong", q: "Cari saham yang CEO-nya resign karena korupsi dan harganya naik 3 hari beruntun. Siapa mereka?", expect: (s) => s.symbols.length === 0 },
];

async function main(): Promise<void> {
  for (const c of CASES) {
    const s = await extractSlots(c.q);
    console.log(`${c.expect(s) ? "✓" : "✗"} ${c.label} · "${c.q}"\n   symbols=${s.symbols.join(",") || "-"} index=${s.indexCode ?? "-"} commodity=${s.commodity ?? "-"} sector=${s.sectorText ?? "-"} predicate=${s.sectorPredicate ?? "-"} period=${s.periodDays ?? "-"} rumor=${s.isRumor} advice=${s.wantsAdvice} cmp=${s.isComparison}\n`);
  }
}

void main();
