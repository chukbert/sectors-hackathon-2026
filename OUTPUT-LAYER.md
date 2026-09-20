# OUTPUT LAYER — dari verified facts jadi cerita bergambar

> Bentuk utama produk: **CHAT** (Track 01 AI Agent & Assistant). Setiap **pesan asisten** adalah `AnswerDoc` yang dirender — narasi + visual menyatu di dalam alur percakapan; satu thread = satu investigasi yang bisa naik/turun level.
> Aturan induk: **tidak ada data mentah ke user.** Angka lewat kode/store (via `factId`), LLM menulis cerita & memilih komponen — bukan menulis angka ke teks.

---

## 1. Kontrak: AnswerDoc (output terstruktur, bukan HTML bebas)

LLM tidak pernah mengeluarkan HTML/teks final langsung. Ia mengisi **`AnswerDoc`** yang divalidasi zod; frontend merender lewat **Visual Registry**.

```ts
AnswerDoc = {
  meta: {
    question, level: 1..10, mode: 'pemula'|'menengah'|'advanced',
    asOf, cost: { planned, actual, cacheHits, cacheRatio },
    sourceMix: { memory, cache, derived, live }, phase?: 1|2|3
  },
  sections: [                       // urutan = template per level (§5)
    { kind:'narrative',
      variants:{ pemula, menengah, advanced },   // 3 varian, digenerate sekaligus
      cites:[factId...] },                       // angka = placeholder {{fact:id}} diisi kode per mode
    { kind:'visual', component:'CompareMatrix', factRefs:[...],
      caption:{ pemula, menengah, advanced }, takeaway:{ ... }, interaction? }
  ],
  followUps: [{ text, level, estCost, cached: boolean }],
  audit: { hits:[...], jevDecisions:[...] },
  disclaimer
}
```

Aturan keras:
- **Semua angka di `factRefs`/`cites`** — narasi menulis `{{fact:id}}` (placeholder), kode yang mengisi formatnya per mode (pembulatan Pemula, presisi penuh Advanced). Varian mana pun memakai angka identik; LLM tidak pernah menulis digit mentah.
- **3 varian narasi digenerate sekaligus** saat jawaban dibuat (Pemula/Menengah/Advanced), diverifikasi Jev per varian (`#6`/`#7`/`#8`), lalu disimpan di `AnswerDoc`. Satu varian gagal → hanya varian itu yang di-Repair.
- **Tidak ada komponen bebas**: hanya nama di Visual Registry; props di-schema.
- **Jev #8 (compliance) memeriksa AnswerDoc utuh** (ketiga varian) sebelum render (tanpa kalimat anjuran beli/jual).

---

## 2. Primitif (blok bangunan kecil, dipakai semua level)

| Komponen | Isi | Catatan analitis |
|---|---|---|
| `StatCard` | angka besar + satuan + as_of + delta chip + sparkline mini + sumber | angka "enak dipakai": sudah diformat (Rp 1,24 T / 14,3× / 6,1%), delta vs pembanding yang jelas |
| `DeltaPill` | ±% / ±pp dengan arah | warna kontekstual (bukan hijau-merah buta); hover = periode pembanding |
| `ScoreBar` | 0–100 + band keyakinan | confidence ditampilkan sebagai rentang, bukan satu angka palsu |
| `FreshnessChip` | "per 19 Sep (cache)" / "live" | kejujuran kesegaran = identitas produk |
| `LevelBadge` · `CostMeter` · `SourceMixBar` | HUD: level, kr terpakai vs rencana, porsi memory/cache/turunan/live | pembeda yang dijual di video |
| `Sparkline` | tren mini inline | 0 kr (cache) — bikin jawaban L1 terasa hidup |
| `KVRow` | fakta padat berlabel | untuk daftar atribut (cum-date, market cap, dsb.) |

---

## 3. Visual Registry (komponen grafik & tabel)

### 3.1 Grafik (Recharts standar)

| Komponen | Bentuk | Dipakai untuk |
|---|---|---|
| `TrendLine` | garis 1–3 seri + penanda event | harga, laba, margin, yield |
| `SmallMultiples` | grid mini-line per metrik | fundamental L6 (satu skala per metrik, tak menipu) |
| `BarGroup` | batang berkelompok, sumbu sama | perbandingan apple-to-apple L5 |
| `StackedArea` | komposisi waktu | segmen pendapatan, komposisi kepemilikan |
| `DualSeries` | 2 seri **dinormalisasi** (indeks 100) | harga vs laba; komoditas vs margin — bukan dual-axis menipu |
| `Waterfall` | jembatan turun/naik | laba→FCF→dividen (coverage); net foreign harian→kumulatif |
| `ScatterRiskReturn` | sebar | shortlist portofolio L10 |
| `FanChart` | area band skenario | L9 (pesimis/basis/optimis + probabilitas band) |
| `FootballField` | rentang horizontal per metode | valuasi: histori vs peers vs intrinsik |
| `Treemap` · `Heatmap` | blok/warna | rotasi sektor, breadth, broker×hari |
| `Gauge` | busur | posisi siklus, days-to-exit likuiditas |

### 3.2 Waktu & arus uang (custom SVG — bukan plugin berat)

| Komponen | Bentuk | Dipakai untuk |
|---|---|---|
| `MoneyFlowTimeline` | batang net harian + garis kumulatif + overlay harga | L8 bandarmologi, foreign flow |
| `AccumulationRibbon` | pita proporsi beli/jual/asing per hari | konsistensi akumulasi |
| `TimelineLanes` | jalur per jenis event | dividen cum/ex/recording/payment, rights, split |
| `CalendarStrip` | kalender mendatang + countdown | L10 pemantauan (checklist & kalender) |
| `EventMarker` | penanda di atas `TrendLine` | "di sini dividen diumumkan" |

### 3.3 Tabel pintar

| Komponen | Fitur |
|---|---|
| `CompareMatrix` | metrik tetap per baris, emiten per kolom, sel = nilai + mini-indikator/delta, **pemenang per kriteria** ditandai; slider bobot mengubah skor (empati keputusan, bukan vonis) |
| `BrokerTable` | top buy/sell, konsistensi harian, split asing/domestik, sortable |
| `ClaimEvidenceMatrix` | klaim dipecah per proposisi × dukungan bukti × kekuatan × verdict |
| `ScenarioMatrix` | "jika X → EPS/PER Y" + sensitivitas 1–2 variabel |
| `ScreenerResultTable` | hasil screening + score bar + sparkline + **alasan lolos/tersaring** |
| `AuditDrawer` | endpoint, cache_key, status, kr, waktu — tiap angka bisa dilacak |

### 3.4 Komposit (blok cerita)

`DossierSection` (wrapper narasi+visual+takeaway per lapisan L10) · `ScorecardPanel` (skor per dimensi + red flags) · `VerdictBanner` (verdict klaim + probabilitas band + "apa yang membalikkan") · `PlanPreviewCard` (rencana biaya + tombol setuju) · `PhaseGateCard` (L9–L10 per fase) · `SignalBanner` (anomali → tawaran naik level) · `FollowUpRail` (pertanyaan lanjutan + badge 0 kr kalau cache) · `GuidePromptChips` (contoh pertanyaan per level).

---

## 4. Shell chat (thread + composer)

```
┌ SIDEBAR             ┌ THREAD (satu investigasi) ─────────────────────────────┐
│ Daftar investigasi  │ [user] pertanyaan / tempelan rumor                      │
│ Watchlist           │ [asisten] AnswerDoc: LevelBadge · biaya · SourceMix     │
│ Ledger kredit       │   ├ ringkasan eksekutif (kartu + paragraf)              │
│ Pengaturan          │   ├ sections: narasi → visual → takeaway                │
│                     │   └ footer: audit · follow-ups · ekspor/salin           │
│                     │ [inline card] PlanPreview / PhaseGate / Signal          │
│                     ├─────────────────────────────────────────────────────────┤
│                     │ COMPOSER: input bebas · tempel rumor · ticker cepat     │
│                     │ + est. biaya otomatis (konfirmasi bila >6 kr) · mode    │
└─────────────────────┴─────────────────────────────────────────────────────────┘
```

Anatomi satu pesan asisten:
1. **Header**: LevelBadge · biaya (n kr / 0 kr cache) · SourceMixBar · FreshnessChip · `turn n/N · kredit sesi`.
2. **Body**: AnswerDoc sections (template level §5).
3. **Footer**: AuditDrawer ringkas · FollowUpRail (chip pertanyaan + badge 0 kr bila cache) · aksi (unduh PNG grafik, salin ringkasan).
4. **Inline cards**: PlanPreviewCard (rencana biaya + setuju) · PhaseGateCard (L9–L10) · SignalBanner (anomali → tawaran naik level).

Aturan thread:
- Naik/turun level terjadi **di dalam percakapan** ("lebih dalam", "cukup, hemat") — klasifier + governor menyesuaikan; biaya tampil sebelum eksekusi.
- **Verify-then-render**: angka & visual muncul hanya setelah lulus Jev #6/#8; selama proses tampil status langkah + biaya berjalan (angka belum terverifikasi tidak pernah tampil, walau sekilas).
- **Riwayat = konteks wajib**: semua turn + output di sesi ini selalu jadi input turn berikutnya (ledger lengkap; teks utuh tersimpan) — [`SESSION-MEMORY.md`](./SESSION-MEMORY.md).
- **Sesi baru = memory only**: tombol "Investigasi baru" memuat hanya memory (banner "Memory dimuat: …" yang bisa dibuka/dihapus), tanpa transkrip sesi lama; tombol "Lanjutkan" memuat ledger penuh sesi itu.
- **Chatbot murni**: tidak ada pesan terjadwal/otonom di luar sesi — semua output hanya respons atas input user.
- Empty state: GuidePromptChips (contoh pertanyaan per level + estimasi biaya).

Aturan tiap visual: **caption + takeaway + sumber + as_of**. Tidak ada grafik telanjang.

---

## 5. Komposisi per pesan asisten (per level — Master Bar tetap lantai)

| L | Komposisi visual | Narasi |
|---|---|---|
| 1 | `StatCard` + sparkline konteks | 1–2 kalimat + label kesegaran |
| 2 | `StatCard` + `KVRow` batas/konteks | edukasi + analogi (mode) + batas |
| 3 | kartu poin + `TrendLine` mini + chips sitasi | 3–5 poin bersitasi |
| 4 | `TrendLine`/`SmallMultiples` + `DeltaPill` + `ScoreBar` tren | cerita tren + limitasi periode |
| 5 | `CompareMatrix` + `BarGroup` per kriteria + slider bobot | sintesis apple-to-apple |
| 6 | `ScorecardPanel` + `SmallMultiples` + `Waterfall` kas + red flags | analisis institusional |
| 7 | `ClaimEvidenceMatrix` + `VerdictBanner` + `MoneyFlowTimeline` | devil's advocate + "apa yang membalikkan" |
| 8 | `MoneyFlowTimeline` + `AccumulationRibbon` + `BrokerTable` | pola + window + metode + "inferensi, bukan niat" |
| 9 | `FanChart` + `ScenarioMatrix` + `Gauge` siklus + trap risk | skenario berbasis asumsi eksplisit |
| 10 | Dossier 8 lapis (`DossierSection` ×8) + `CalendarStrip` + `ScatterRiskReturn` + `AuditDrawer` | laporan multi-bagian + ringkasan eksekutif |

### 5.1 Mode bahasa — 3 tingkat (ganti kapan saja, 0 kr Sectors)

| Aspek | Pemula (awam) | Menengah | Advanced (ahli) |
|---|---|---|---|
| Istilah | dilarang jargon; wajib analogi; `DefinitionCard` otomatis | jargon dipakai + dijelaskan sekali saat muncul | jargon penuh tanpa penjelasan (tetap bisa diklik) |
| Angka | dibulatkan + konteks ("≈ Rp 1,2 T — setara …") | presisi sedang (2–3 angka penting) + pembanding | presisi penuh + satuan + metode + window |
| Narasi | kalimat pendek; fokus "artinya buat kamu" | sebab-akibat & trade-off | metodologi, limitasi data, sensitivitas, formula |
| Visual | label ramah; tooltip polos | label standar | tabel lebih rapat; asumsi/formula tampil |
| Default komponen | `DefinitionCard` + analogi | standar level | `MethodNote` + detail skenario |

**Invarian (sama di semua mode): cakupan data, level, biaya Sectors, registry visual, verifikasi Jev, sitasi, audit, disclaimer.**
**3 varian disimpan sekaligus** → **ganti mode = render ulang di klien**: tanpa Sectors, tanpa LLM, tanpa Jev (benar-benar instan). Biaya Sectors tidak berubah; hanya token narasi LLM + cek Jev yang naik tipis (±3×, masih receh). Default tampil: **Menengah**.

---

## 6. Dinamis & interaktif (dengan pagar biaya)

- **Progressive render di dalam pesan**: status langkah + biaya berjalan → (setelah lolos verifikasi) kartu/grafik → narasi. L9–L10: `PhaseGateCard` di antara fase.
- **Hover/fokus/tap = provenance**: tooltip menampilkan as_of, sumber (memory/cache/live), cache_key. Angka yang tidak bisa ditelusuri tidak dirender.
- **Drill-down hemat**: klik titik/sel → tawaran pertanyaan lanjutan; kalau jawabannya ada di cache **0 kr** (langsung render), kalau perlu live tampil estimasi + tombol setuju.
- **Toggle**: mode bahasa (3 varian tersimpan di `AnswerDoc` — instan, 0 panggilan), metrik pada `DualSeries`, bobot `CompareMatrix`, skenario pesimis/basis/optimis.
- **Motion** (aturan ketat): durasi 120–240 ms ease-out; stagger 30–50 ms; count-up ≤600 ms; hormati `prefers-reduced-motion`; tanpa loop tak putus (kecuali badge live); shimmer hanya saat load. Cantik = tenang, bukan ramai.

---

## 7. Peta domain → visual utama

| Domain | Visual utama |
|---|---|
| Harga & Likuiditas | `TrendLine` + `Gauge` days-to-exit + `StatCard` |
| Fundamental & LK | `SmallMultiples` + `ScorecardPanel` + `Waterfall` |
| Valuasi | `FootballField` + `BarGroup` peers + `TrendLine` band histori |
| Dividen & Aksi Korporasi | `TimelineLanes` + `BarGroup` payout + `StatCard` yield |
| Bandarmologi | `MoneyFlowTimeline` + `AccumulationRibbon` + `BrokerTable` |
| Foreign Flow & Kepemilikan | `MoneyFlowTimeline` + `StackedArea` kepemilikan + `Heatmap` |
| Discovery & Screening | `ScreenerResultTable` + `BarGroup` + chips kriteria |
| Komoditas & Mining | `DualSeries` + `BarGroup` produksi + `FanChart` harga |
| IPO & Listing | `TrendLine` performa 7/30/90/365 + `TimelineLanes` lock-up |
| Kalender & Event | `CalendarStrip` + `EventMarker` + tabel dampak |
| Sektor & Indeks | `Treemap`/`Heatmap` rotasi + `BarGroup` net asing sektor |
| Klaim & Rumor | `ClaimEvidenceMatrix` + `VerdictBanner` |
| Tag & Klasifikasi | `Treemap` taksonomi + tabel emiten + catatan reklasifikasi |

---

## 8. Anti-pola (dilarang)

- Dump JSON/`<pre>`/tabel mentah tanpa takeaway; dinding teks tanpa visual.
- Grafik telanjang tanpa caption/sumber/as_of; teks yang mengulang tabel kata-per-kata.
- Dual-axis menipu, pie >5 irisan, sumbu y terpotong, tanpa satuan; warna merah-hijau sebagai satu-satunya penanda.
- Angka di narasi yang tidak punya `factId`; confidence tanpa rentang; probabilitas tanpa metode.
- Memaksa user keluar dari thread (halaman/dashboard terpisah) untuk melihat hasil — semua output hidup di percakapan.

## 9. Aksesibilitas & tema

- Kontras WCAG AA; palet aman buta warna; tooltip juga muncul saat fokus keyboard; tabel bisa dinavigasi keyboard.
- **Dark-first** (nuansa finance), light opsional; token warna tunggal supaya grafik & kartu konsisten.
- Mobile: kartu menumpuk, tabel jadi kartu ringkas, timeline bisa di-scrub.

## 10. Dependensi yang diusulkan

| Lib | Untuk | Status |
|---|---|---|
| `recharts` | grafik standar (§3.1) | ✅ final |
| `motion` (framer-motion) | reveal, count-up, stagger | ✅ disetujui |
| `lucide-react` | ikon | opsional ringan (tree-shakeable) |
| custom SVG | timeline, ribbon, heatmap, fan, football field | tanpa lib tambahan |

> Status: menunggu persetujuan butir §11 (motion, drill-down, ekspor, tema).

---

## 11. Keputusan final (dikunci 21 Sep 2026)

1. ✅ **Animasi: pakai `motion` (framer-motion)** — reveal, count-up, stagger, transisi fase; patuh `prefers-reduced-motion`.
2. ✅ **Drill-down: cache langsung 0 kr, live dengan estimasi** — klik metrik/titik; kalau perlu live baru tampil biaya + tombol setuju.
3. ✅ **Ekspor: unduh PNG per grafik + salin ringkasan** — untuk video demo & posting sosial.
4. ✅ **Tema: dark-first** (nuansa finance), light opsional, token warna tunggal.
5. ✅ **Verify-then-render** — angka & visual tampil hanya setelah lolos Jev; selama proses hanya status langkah + biaya berjalan.