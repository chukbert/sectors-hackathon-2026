Mockup di atas saya buat sebagai **illustrasi arah visual** (teks di dalamnya sengaja placeholder/garbled — anggap saja moodboard, bukan spec). Sekarang bedah konkret untuk render `AnswerDoc` INVESTIGRAPH Anda.

## A. Diagnosis Render Saat Ini (bug + UX debt yang terlihat di screenshot)

1. **Bug pemetaan placeholder**: kalimat pembuka berbunyi *"rata-rata volume **2.560** hari tidak lengkap"* — nilai `2.560` itu harga penutupan, bukan jumlah hari (harusnya "10 hari", sesuai kotak Asumsi). Ada FACTID yang tertukar di `Argument Compiler`/renderer. Ini justru merusak doktrin "sitasi terverifikasi" Anda.
2. **Callout duplikat 3×**: "Top buyer: ZP, CC, AK, YU, RX" dan "Paling ramai: BUMI.JK…" muncul tiga kali (sesi Harga, Fundamental, Bandarmologi). Renderer menempelkan callout per-section padahal isinya identik.
3. **"Paling ramai" salah konteks**: itu data *most-traded* se-pasar (BUMI, SQMI, SRSN), bukan TLKM. Tanpa label "Konteks Pasar", pembaca Pemula mengira itu broker TLKM.
4. **Dua kartu net flow yang membingungkan**: "-Rp 5 M (jendela)" vs "-Rp 2 M (2026-09-11)" berdampingan tanpa penjelasan relasi. Gabungkan jadi satu kartu + breakdown di tooltip/grafik.
5. **Asumsi & Risiko run-on**: tiga kalimat menempel tanpa spasi/baris baru. Wajib bullet list.
6. **Grid pincang**: section "Kinerja & Fundamental" isi 1 kartu di grid 3 kolom → dua slot kosong menganga.
7. **Nol visual data**: Anda punya data jendela (high/low, flow harian, top broker) tapi `Visual Registry` (Recharts) menganggur — semuanya jadi kartu angka datar.
8. **Tanpa semantik warna**: `-1,2%` dan `-Rp 5 M` tampil putih polos. Negatif harus merah, positif hijau (konvensi IDX).
9. **Angka mentah sulit scan**: `212.768.300` butuh effort baca; pakai notasi kompak `212,8 jt`.
10. **Tanggal ISO** `(2026-09-18)` → seharusnya `18 Sep 2026`.
11. **Noise sitasi**: garis titik-titik di *setiap* angka membuat halaman bergetar visual. Ganti superscript `[1]` + popover hover.
12. **Chip "5 sumber" wrap dua baris**, dan tombol "Menyiapkan…" terlihat disabled/ambigu.
13. **Tidak ada TL;DR**: mode Pemula langsung dilempar paragraf caveat negatif ("data tidak lengkap…") sebagai kalimat pertama. Caveat itu milik kotak Asumsi, bukan pembuka.

## B. Hierarki Informasi Baru (blueprint layout)

```
┌─ Header: judul + chips (tooltip) + tabs Pemula/Menengah/Advanced ─
│ 💬 TL;DR satu kalimat (per mode)                                  │
├───────────┬───────────┬───────────┬───────────────────────────────┤
│ HERO Harga│ Net Flow  │ Porsi Asing│ Nilai Transaksi              │
│ 2.560▼1,2%│ -Rp5 M    │ 42%       │ Rp540 M                       │
│ sparkline │ mini-bars │ mini-donut│                               │
├───────────┴───────────┴───────────┴───────────────────────────────┤
│ 📈 Area chart harga + band high/low (jendela)                     │
├──────────────────────────────┬────────────────────────────────────┤
│ 📊 Flow asing harian         │ 🌪️ Tornado broker buyer vs seller │
│    (diverging bars)          │    + tabel broker (Advanced)       │
├──────────────────────────────┴────────────────────────────────────┤
│ Narasi (sitasi [1][2] via popover)                                │
├───────────────────────────────────────────────────────────────────┤
│ ⚠️ Asumsi & Risiko — bullet ber-ikon                              │
├───────────────────────────────────────────────────────────────────┤
│ Footer: stepper pipeline · Jejak audit (drawer) · Salin · Export  │
└───────────────────────────────────────────────────────────────────┘
```

Prinsip: **hero dulu, grafik kedua, narasi ketiga, caveat terakhir**. Kedalaman visual mengikuti mode (konsisten dengan doktrin 3 varian Anda): Pemula = TL;DR + hero + 1 chart; Menengah = + flow chart + donut; Advanced = + tornado + tabel + sitasi penuh. Switch mode tetap instan 0 kr karena semua spec visual sudah ada di `AnswerDoc`.

## C. Katalog Visual: data mana → chart apa

| Data di AnswerDoc Anda | Visual yang tepat | Komponen |
|---|---|---|
| Seri harga + high/low jendela | Area chart + band `ReferenceArea` + `ReferenceDot` di harga terakhir | Recharts `ComposedChart` |
| Net foreign flow per hari | **Diverging bars** (hijau di atas 0, merah di bawah) | `BarChart` + `Cell` fill by sign |
| Top buyer vs top seller | **Tornado/butterfly** horizontal | `BarChart layout="vertical"`, dua Bar mirror |
| Porsi asing 42% | Donut (sisa = domestik) | `PieChart innerRadius` |
| Volume vs rata-rata | Bullet/bar tunggal + `ReferenceLine` avg | `BarChart` |
| High–low–close jendela | Dumbbell/range bar | SVG custom / `ErrorBar` |
| Nilai transaksi, jumlah broker 88 | **Bukan chart** — hero stat card & chip | — |

Aturan main:
- **Maks 3 chart per dokumen** (naik sesuai level). Chart bukan hiasan; tiap chart wajib menjawab satu pertanyaan analisis.
- **Empty-state desain**: jika seri < 3 titik atau data hilang (kasus avg-volume 10 hari Anda), render panel dashed bertuliskan alasan gap — jangan kalimat negatif di pembuka, dan jangan chart rusak.
- **0 kr**: chart dibangun hanya dari fact yang sudah di-cache/derived oleh `Argument Compiler`. Tidak ada endpoint baru demi visual.
- **Sitasi chart**: tiap titik/bar menyimpan `factId`; tooltip menampilkan `[f:ID] · endpoint · kr` sehingga grafik ikut lolos verifier sitasi.

## D. Aturan Tipografi, Angka, Warna

- Format: `Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 })` → `212,8 jt`; angka penuh hanya di tooltip/`title`.
- `font-variant-numeric: tabular-nums` di semua kartu & tabel agar kolom angka rata.
- Tanggal: `18 Sep 2026` (bukan ISO) di label; ISO hanya di jejak audit.
- Semantik warna: naik `#22c55e`, turun `#ef4444`, netral `#94a3b8`; delta chip pakai background tint 10–15% alpha, bukan teks berwarna polos.
- Skala: hero 32–40px, kartu 24px, body 15px/1.6, label 11–12px uppercase `letter-spacing .08em`. Kontras label di dark theme Anda sekarang agak rendah — naikkan ke `#a8b3c4`.
- Sitasi: superscript `[1]` kecil; popover hover berisi endpoint, timestamp, biaya. Garis titik-titik hanya aktif saat toggle "mode audit".

## E. Perbaikan Komponen Konkret

- **Dedup callout**: "Sorotan Bandar" render sekali; lebih baik diganti tornado chart + satu baris caption. Callout "Paling ramai" pindah ke strip "Konteks Pasar" di footer section.
- **Gabung 2 kartu net flow** jadi satu kartu: angka jendela besar, sub-baris "terakhir: -Rp 2 M (11 Sep)".
- **Asumsi & Risiko**: bullet dengan ikon (`⚠️ asumsi`, `⛔ risiko`), satu baris per item, border-left amber dipertahankan.
- **Grid auto-flow dense** agar section isi 1 kartu tidak menyisakan lubang (atau kartu itu naik ke hero row).
- **Chips header**: `flex-nowrap` + tooltip; "0 kr" beri ikon koin, "5 sumber" jadi klikable → buka drawer sitasi.
- **Ganti tombol "Menyiapkan…"** dengan **stepper pipeline live**: Guardrail ✓ → Planner ✓ → Resolver ✓ → Compiler ✓ → Narrator ✓ → Verifier ✓. Ini sekaligus *demo theater* terbaik untuk juri Track 01 karena memperlihatkan agent logic Anda bekerja.
- **Jejak audit** = side drawer tabel: `factId · endpoint · cache/live · kr · timestamp`.
- **Salin ringkasan** = Markdown dengan angka ter-resolve + daftar sitasi; tambah export PDF (print CSS).

## F. Implementasi di Codebase Anda

Perluas kontrak zod di `src/lib/output/answerdoc.ts` — spec visual diproduksi **Argument Compiler (kode deterministik)**, bukan LLM, agar doktrin "LLM tidak menulis digit mentah" tetap utuh:

```ts
export const VisualSpec = z.discriminatedUnion("type", [
  z.object({ type: z.literal("price-area"),  factIds: z.string().array(),
             series: z.object({ t: z.string(), close: z.number(), hi: z.number(), lo: z.number() }).array() }),
  z.object({ type: z.literal("flow-diverging"), factIds: z.string().array(),
             series: z.object({ t: z.string(), net: z.number() }).array() }),
  z.object({ type: z.literal("broker-tornado"), factIds: z.string().array(),
             buyers: BrokerBar.array(), sellers: BrokerBar.array() }),
  z.object({ type: z.literal("share-donut"), factIds: z.string().array(),
             parts: z.object({ label: z.string(), pct: z.number() }).array() }),
]);
```

Visual Registry tinggal memetakan `spec.type → komponen Recharts`, dengan fallback tabel bila seri terlalu pendek. Contoh diverging flow:

```tsx
<ResponsiveContainer width="100%" height={180}>
  <BarChart data={series}>
    <XAxis dataKey="t" tickFormatter={fmtTanggalID} tick={{ fill: "#94a3b8", fontSize: 11 }} />
    <YAxis tickFormatter={fmtKompakID} tick={{ fill: "#94a3b8", fontSize: 11 }} />
    <Tooltip content={<FactTooltip />} />
    <ReferenceLine y={0} stroke="#475569" />
    <Bar dataKey="net" radius={3}>
      {series.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#22c55e" : "#ef4444"} />)}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

Helper format:

```ts
const fmtKompakID  = (n: number) => new Intl.NumberFormat("id-ID",
  { notation: Math.abs(n) >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
const fmtTanggalID = (iso: string) => new Intl.DateTimeFormat("id-ID",
  { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
```

## G. Checklist Regression Sebelum Demo

- [ ] Placeholder `{{f:FACTID|format}}` ter-audit: tidak ada nilai harga bocor ke slot hari/persentase (kasus "2.560 hari").
- [ ] Tidak ada callout duplikat di seluruh 39 kasus `pnpm mastery`.
- [ ] Tiap angka negatif/positif memakai warna + delta chip konsisten di 3 mode.
- [ ] Chart dengan data < 3 titik jatuh ke empty-state, bukan crash/blank.
- [ ] Switch Pemula→Advanced instan tanpa spinner & tanpa panggilan Jev/API.
- [ ] Snapshot test renderer: struktur section stabil antar mode.

Intinya: jawaban Anda sudah *benar dan tersitasi*, tapi presentasinya masih "database dump". Dengan hierarki hero→visual→narasi→caveat, semantik warna, dan aktivasi Visual Registry yang sudah Anda bangun, dokumen Level 8 akan terbaca seperti laporan riset institusional — dan itu pembeda terbesar di depan juri.