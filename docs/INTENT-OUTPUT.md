# INTENT-OUTPUT — Taksonomi Output dari Sectors API untuk Grup A, B, C

> Ide: balik cara berpikir. Tetapkan dulu **seluruh output yang mungkin di-generate dari https://docs.sectors.app/**,
> klasifikasikan sebagai **intent-output** (unit output dengan kontrak jelas), petakan ke ICP Grup A/B/C (`ICP.md`),
> lalu layani pertanyaan berlapis sebagai **komposisi multiple intent-output** + sintesis LLM bertingkat di akhir.
> Produk: **IDX Multi Agent Consulting Assistant (IDXMACA)** (`PRD.md`).

## 1. Konsep

**Intent-output** = satu unit output dengan kontrak:
`slot input → endpoint Sectors → komputasi deterministik → visualisasi + artefak → sitasi`.

**Tiga tingkatan analisis (depth):**
- **L1 Snapshot** — fakta: angka + visual + tanggal tarik. Contoh: "P/E BBCA 13,2x (TTM)".
- **L2 Diagnostic** — tren, perbandingan, anomali: YoY, CAGR, vs histori, vs median peer, vs sektor, deteksi lonjakan.
- **L3 Synthesis** — memo gabungan multi-intent: thesis-support, risiko, pertanyaan lanjutan. **Bukan rekomendasi beli/jual** (wajib disclaimer).

**Aturan main:**
- LLM hanya menulis narasi; angka selalu dari compute + evidence ledger.
- Setiap intent-output mencantumkan endpoint + parameter + timestamp (anti-halusinasi, audit trail untuk komite).
- Pertanyaan kompleks = DAG beberapa intent-output (paralel + sekuensial) + 1 sintesis akhir.
- Setiap visual punya **satu pesan** yang ditulis sebagai judul chart — bukan sekadar angka mentah (lihat §7).

## 2. Daftar Intent-Output (+ Visualisasi)

Format per baris: `ID — Nama | Endpoint | Artefak | ICP | Viz: chart → metrik olahan → "contoh judul pesan"`.

### Fundamental & Valuasi
- **IO-01 Company Snapshot** | Report `overview` | kartu identitas | A1,A2,A4,B2,C1 | Viz: kartu KPI + bullet 52w range → posisi harga dalam rentang → "BBCA di 70% rentang 52 minggu"
- **IO-02 Valuation Band** | Report `valuation` | valuasi historis + intrinsic | A1,A2,B1,B2 | Viz: garis P/E + band rata-rata ±1 std dev → premi/diskon vs histori → "P/E 13,2x: premi 8% vs rata-rata 5 tahun"
- **IO-03 Earnings & Margins Trend** | Report `financials` + Quarterly | 5 thn + 8 kuartal | A1,A2,B1,C1 | Viz: bar revenue/earnings + garis margin → tren + anotasi anomali → "Laba naik 3 kuartal beruntun, margin melebar"
- **IO-04 Forecast vs Realisasi** | Report `future` + Quarterly | estimasi vs aktual | A1,A2 | Viz: grouped bar estimasi vs aktual + selisih % → "Realisasi 4% di bawah konsensus"
- **IO-05 Dividend Profile** | Report `dividend` + Corporate Actions | yield, payout, jadwal | A2,A4,B1 | Viz: bar yield + garis payout ratio → vs median peer → "Yield 5,1%, di atas median peer"
- **IO-06 Management & Skin-in-the-game** | Report `management` | direksi + saham eksekutif | A1,C3,B1 | Viz: tabel + bar kepemilikan → "Direksi pegang X%: skin-in-the-game rendah"
- **IO-07 Ownership Snapshot** | Report `ownership` + Shareholders | pemegang besar %, konglomerasi | A1,B1,B2,C2 | Viz: donut konsentrasi + waterfall perubahan → "Pengendali 54,9%; asing jual bersih RpX bulan ini"
- **IO-08 Peer Snapshot** | Report `peers` | tabel peer + median | A1,B1,B2 | Viz: tabel heatmap (terbaik vs median otomatis) → "Termurah kedua dari 6 peer"
- **IO-09 Revenue Segment Mix** | Company Segments + list | breakdown per segmen | A1,B2,C1 | Viz: 100% stacked bar per tahun (atau Sankey 1 thn) → pergeseran mix → "Segmen X kini 60% pendapatan, naik dari 45%"
- **IO-10 Quarterly Freshness** | Latest Quarterly Dates universe + per-company | sudah/belum rilis | A1,C2,B2 | Viz: timeline status hijau/merah → "2 dari 10 emiten belum rilis — flag telat lapor"

### Screening & Ranking
- **IO-11 NL Screener** | Companies Screener (`where`; `q` fallback) | daftar + kriteria transparan | A1,A2,B1,C2 | Viz: tabel + sparkline + scatter value-vs-quality (X=P/E, Y=ROE, ukuran=market cap) → "12 emiten lolos: ROE>15%, DER<1"
- **IO-12 Dividend / Value / Growth Rank** | Top Companies Ranked | ranking metrik | A2,A4,B1 | Viz: horizontal bar berperingkat + garis median → "Top yield: emiten X 7,2%"
- **IO-13 Growth Leaders/Laggards** | Top Growth | gainers & losers | A1,A3 | Viz: diverging bar kanan-kiri → "Leaders vs laggards laba sektor Y"
- **IO-14 Free Float & Likuiditas** | Free Float | float %, kelayakan | A2,A3,C2 | Viz: bar + garis ambang 7,5% → "Float 12%: di atas ambang, likuiditas aman"
- **IO-15 Sector Map** | Subsectors/Industries/Subindustries | peta klasifikasi | A1,B1,B2 | Viz: tree klasifikasi → "Peer set: 8 emiten subsektor Z"

### Harga, Pasar & Momentum
- **IO-16 Price History** | Daily Transaction (≤90 hari) | OHLC/volume/return | A1,A3,C2 | Viz: garis terindeks (base 100) + bar volume + marker event → "BBCA +5% vs awal periode; volume memuncak saat cum-date"
- **IO-17 Market Snapshot** | Full-Universe Close (1 hari) | pasar harian | A3,B2 | Viz: heatmap sektoral → "Energi hijau, teknologi merah hari ini"
- **IO-18 Index & Market Cap** | Index Daily + Universe Index + IDX Total Cap | benchmark | A2,A3,B2 | Viz: garis terindeks saham vs IHSG/LQ45 → "Outperform IHSG 12% YTD"
- **IO-19 Movers & Most-Traded** | Top Movers (1d–365d) + Most Traded | gainers/losers/teraktif | A3,A4,C2 | Viz: diverging bar return + ranked bar volume (top 10) → "Top gainer +8%; top traded Rp2,1 T"
- **IO-20 IPO Precedent** | Listing Performance (7/30/90/365) | preseden pitch | B1 | Viz: dot plot per IPO + box per sektor → "IPO sektor X: median +30% di 90 hari"

### Broker Flow & Asing
- **IO-21 Flow Check per Saham** | Broker Summary + Top Buyers/Sellers | akumulasi/distribusi | A3,A1,B2,C2 | Viz: diverging stacked bar beli-vs-jual + garis net kumulatif → "Broker A akumulasi Rp120 M dalam 5 hari"
- **IO-22 Broker Behavior** | Activity by Code + Top Acc/Dist per broker | pola lintas saham | A3,C2 | Viz: heatmap broker × saham → "Broker A borong 3 saham energi sekaligus"
- **IO-23 Broker Landscape** | Broker Registry + Top Brokers Daily | kohort + ranking | A3,C2 | Viz: donut kohort (asing/domestik, ritel/institusi) + ranked bar → "Asing 60% turnover hari ini"
- **IO-24 Foreign Flow** | Universe Foreign Flow + per-symbol | net asing + share | A1,A2,A3,B2 | Viz: bar net harian + area kumulatif → "Asing net sell Rp1,2 T minggu ini"

### Event, Governance & Berita
- **IO-25 Corporate Action Timeline** | Corporate Actions + Calendar | dividen/split/rights, cum/ex-date | A2,A4,B1,C1 | Viz: timeline cum → ex → payment + kalender pasar → "Ex-date dividen 3 hari lagi"
- **IO-26 Insider Monitor** | Company Filings (IDX) | transaksi insider | A1,C2,C3,B2 | Viz: marker segitiga beli/jual di atas grafik harga + tabel nilai → "Direksi beli Rp5 M sebelum rilis LK"
- **IO-27 Suspension & UMA Watch** | Suspensions | riwayat + alasan + PDF IDX | A2,C1,C2 | Viz: flag merah di timeline + tabel → "Disuspensi 2× setahun: risiko likuiditas"
- **IO-28 News Brief** | News (IDX + mining) + Tags | berita per emiten/sektor | A1,A4,B2 | Viz: feed ber-tag + garis waktu → "5 berita minggu ini: 3 soal rights issue"

### Sektor
- **IO-29 Sector Report Card** | Subsector Report | kartu sektor | A1,B2,C1 | Viz: small multiples (bar agregat + top 5 + sparkline) → "P/E sektor bank di bawah rata-rata 3 tahun"

### Tambang & Komoditas (pembeda)
- **IO-30 Mining Company Dossier** | Mining search + detail + financials + performance | profil, produksi, finansial USD | A1,B1,B2 | Viz: kartu produksi + strip ratio + tren finansial → "Produksi naik 8%, cash cost turun"
- **IO-31 Ownership Tree Tambang** | Mining ownership | induk & anak + % | B1,C2,C3 | Viz: node-link tree → "Grup X kuasai 70% via 3 lapis"
- **IO-32 Site & Reserve Map** | Sites + detail + resources/reserves + produksi | lokasi, volume, cadangan | A1,B1,B2 | Viz: peta titik (lat/long) + choropleth per provinsi + tren nasional → "Cadangan terbesar di Kalimantan Timur"
- **IO-33 Commodity Price & Trade** | Commodities + harga + ekspor + global + sales destination | harga, tujuan ekspor | A1,B2 | Viz: garis harga + treemap/stacked bar negara tujuan → "60% ekspor ke China; harga +15% YoY"
- **IO-34 License & Auction Radar** | Licenses (IUP/IUPK) + auctions + detail + contracts | status, lelang, owner–kontraktor | B1,B2 | Viz: tabel + countdown kedaluwarsa (amber <12 bln, merah lewat) + timeline fase WIUP → "3 IUP kedaluwarsa <12 bulan"

### Regional
- **IO-35 SGX/KLSE Dossier** | SGX/KLSE screener + report + top | profil lintas bursa | A2,B1 | Viz: dossier format identik IDX → "Valuasi DBS vs BBCA apel-ke-apel"
- **IO-36 SGX Flow Spesial** | SGX short sell + buybacks + filings + news | short, buyback, insider | A2,A3 | Viz: bar short + marker buyback/insider → "Short naik, buyback jalan"

### Monitoring (komposisi berjadwal)
- **~~IO-37 Watchlist Diff~~ — DIHAPUS** (fitur watchlist/morning brief dihapus; ID dipertahankan agar penomoran stabil; diff memo antar kuartal tetap ada sebagai fungsi memory on-demand, bukan intent terjadwal)
- **IO-38 Credit & Red-Flag Scan** | gabungan IO-03/07/24/25/26/27 + rule engine | skor + bukti per aturan | C1,C2 | Viz: gauge 0–100 + checklist aturan terpicu (klik → sumber) → "Skor bahaya 72: 3 aturan terpicu"

### Percakapan Bebas (lapisan chat, bukan panel)
- **IO-39 Chat Bebas** | tanpa endpoint wajib (0 kredit; boleh mengutip ledger sesi) | jawaban teks singkat di bubble + mini visual opsional dari ledger | Semua grup | Viz: teks saja (tanpa chart kecuali dari ledger) → contoh: "Cum-date = hari terakhir beli agar dapat dividen; ex-date BBRI 05 Sep (IO-25)."

**Kontrak IO-39:**
- **Kapan dipakai:** router fallback bila tidak ada intent terstruktur yang cocok dengan keyakinan cukup — sapaan, terima kasih,
  penjelasan istilah (cum-date, UMA, ARA/ARB, P/E), klarifikasi ("maksudnya net sell itu apa?"), dan penalaran atas konteks sesi
  ("jadi intinya...?").
- **Grounding wajib:** dilarang menyebut angka baru — angka hanya dari ledger sesi (dengan sitasi) atau tidak disebut sama sekali.
  Butuh angka yang belum ada → jangan karang; tawarkan eskalasi ("mau saya tarik insider BMRI-nya?") yang bila disetujui menjadi run intent terstruktur normal (pakai approval + kredit).
- **Gaya:** singkat ala chat (maks ~120 kata), bahasa mengikuti user (ID/EN campur), tanpa jargon berlebihan.
- **Kepatuhan sama:** tanpa bahasa rekomendasi + disclaimer tetap muncul minimal sekali per sesi bermuatan analisis.
- IO-39 bukan panel (tidak masuk 8 hero §8) — ia lapisan percakapan yang membungkus semuanya; effort LLM: low.

## 3. Pemetaan ke ICP (ringkas)

- **Grup A (riset/fund/trader/RM):** IO-01–05, IO-08–14, IO-16–19, IO-21, IO-24–28, IO-36.
  Contoh berlapis: "screening bank dividen (IO-11) → snapshot 3 kandidat (IO-01/02/05) → flow check (IO-21/24) → insider+news (IO-26/28) → sintesis L3 1-pager".
- **Grup B (IB/valuasi/korporasi):** IO-07–09, IO-11, IO-15, IO-20, IO-25, IO-29–35.
  Contoh berlapis: "comps 6 peer (IO-08/11) → segment mix (IO-09) → ownership tree (IO-07/31) → preseden IPO (IO-20) → pitch pack L3 + XLSX".
- **Grup C (kredit/risiko/kepatuhan):** IO-03, IO-06–07, IO-10, IO-14, IO-16, IO-21, IO-24–27, IO-38.
- **Semua grup:** IO-39 Chat Bebas — fallback percakapan untuk pertanyaan yang tidak memetakan ke intent terstruktur (salam, istilah, klarifikasi).
  Contoh berlapis: "spread 5 thn (IO-03) → freshness (IO-10) → ownership (IO-07) → flow+insider+suspensi (IO-21/24/26/27) → credit memo L3 + tabel early-warning".

## 4. Contoh Komposisi (DAG) untuk Demo

**Pertanyaan demo:** "Bandingkan BBCA, BMRI, BBRI kuartal terakhir + siapa akumulasi + risiko kreditnya?"
1. Paralel: IO-01 + IO-03 + IO-10 (3 emiten) → IO-02 + IO-08 (valuasi vs peer).
2. Paralel: IO-21 + IO-24 (flow 14 hari) → IO-25 + IO-26 + IO-27 (event & governance).
3. Compute: YoY, margin, median peer, konsentrasi broker, foreign share.
4. Sintesis L3 tiga lensa: riset (kinerja vs peer), deal (comps), kredit (red-flag) + disclaimer.
5. Setiap angka: klik → endpoint + parameter + timestamp.

## 5. Catatan Kredit (dari docs v2)

- Screener terstruktur = 1 kredit; NL `q` = 3 → compiler NL→`where` dulu, `q` hanya fallback.
- Company Report = 1 kredit per section (default 8 = 8 kredit) → pilih section per intent, jangan full.
- Broker ≤14 hari, IDX daily ≤90 hari → hormati clamp agar tidak error dan boros.
- 400/401/403/429/5xx gratis; 404 = 1 kredit → validasi ticker/slug lokal dulu via entity resolver.
- Pola hemat: estimasi-di-muka + approval, cache per (endpoint+param+hari), fixture saat dev UI, bulk universe untuk scan.

## 6. Prioritas Build (7 hari)

- P0: IO-01/02/03/08/11/21/24/25/26/27 + IO-39 + sintesis L3 + evidence drawer + export.
- P1: IO-05/07/10/14/19/38 + ringkasan 1-pager otomatis + diff memo.
- P2 (roadmap): IO-29–36 penuh (sektor, tambang, regional) + scheduling.

## 7. Aturan Visualisasi Global (best practices)

1. **Satu chart, satu pesan** — judul chart adalah kesimpulan ("Margin melebar 3 kuartal"), bukan label ("Grafik margin").
2. **Warna bermakna tetap** — biru = fokus, abu-abu = peer/median, hijau-merah hanya arah, amber = warning. Tanpa 3D, palet colorblind-safe.
3. **Direct label** — nilai di ujung bar/garis, bukan legenda menumpuk.
4. **Format Indonesia** — Rp1,2 T; tanggal DD-MMM-YYYY; toggle ID/EN.
5. **Skala jujur** — bar dari nol; garis boleh zoom dengan penanda; rata-rata/median selalu ditampilkan sebagai pembanding.
6. **Event overlay** — marker aksi korporasi/insider/suspensi ditempel di grafik harga, bukan tabel terpisah.
7. **Forecast = garis putus-putus + label "estimasi"** — tidak pernah disamarkan sebagai aktual.
8. **Sumber + tanggal** di bawah tiap visual, klik → evidence drawer.
9. **Perbandingan apel-ke-apel** — multi-emiten selalu diindeks (base 100) atau dinormalisasi (%), bukan nominal mentah.
10. **Empty state jujur** — "data tidak tersedia" + intent alternatif, bukan grafik kosong atau karangan.
11. **Export mengikuti visual** — DOCX = memo + gambar chart; XLSX = tabel mentah + sumber per sheet.

## 8. Satu Query, 38 Intent: Visualisasi Efisien + Tetap Best-Practice

> Masalah: 38 intent sekaligus = overload kognitif + mahal (kredit) + lambat. Solusi: **ambil secukupnya, render berlapis,
> visual digabung, detail on-demand.** Best practice tidak dikorbankan — yang dikorbankan adalah menampilkan semuanya datar sekaligus.

### 8.1 Prinsip efisiensi
1. **Fetch sekali, render banyak.** Satu `company/report` (sections pilihan) menghidupi IO-01/02/03/05/06/07/08; satu grafik harga
   berlapis melayani IO-16/18/19/25/26/27 (toggle overlay). Peta fetch-bersama wajib ada di planner.
2. **Satu layar menjawab.** Maksimal **8 visual hero** terlihat; sisanya 1 klik (tab/accordion/drawer). Aturan: tiap panel jawab 1 pertanyaan.
3. **Progressive disclosure 4 lapis:**
   - **L0 Executive strip** — 5 kartu KPI + 3 bullet sintesis + disclaimer. Selalu di atas, tanpa scroll.
   - **L1 Panel diagnostik** — 8 panel domain (§8.2), masing-masing 1 visual hero + tabel ringkas.
   - **L2 Deep-dive on-demand** — tab/accordion per intent: chart penuh + tabel mentah + sitasi.
   - **L3 Appendix** — semua tabel mentah + sumber (untuk komite/audit), hanya di export/XLSX.
4. **Render progresif.** Kerangka panel muncul dulu (skeleton); tiap visual terisi saat intent-nya selesai (streaming per panel +
   indikator kredit terpakai). User tidak menunggu 38 intent untuk melihat yang pertama.
5. **Sparklines gantikan chart penuh** di tabel (tren 8 kuartal dalam 1 sel). Chart penuh hanya untuk hero.
6. **Top-N + sisa di tabel.** Ranking/flow/tujuan ekspor: visual tunjukkan top 5–10, sisanya tabel collapsible.

### 8.2 Delapan panel domain (38 intent → 8 hero visual)
| Panel | Intent di dalam | Hero visual (1) | Yang dilipat (L2) |
|---|---|---|---|
| P1 Snapshot & Valuasi | IO-01,02,04,05,10 | Valuation band + posisi saat ini | kartu KPI, forecast vs aktual, dividend, freshness |
| P2 Kinerja & Segmen | IO-03,09 | Bar earnings + garis margin (8 kuartal) | tabel 5 thn, stacked bar segmen |
| P3 Pasar & Momentum | IO-16–19 | Grafik harga terindeks + overlay event | heatmap, movers, most-traded (tabel) |
| P4 Flow & Kepemilikan | IO-06,07,21–24,14 | Diverging bar broker + garis net kumulatif | donut kohort, heatmap broker×saham, float |
| P5 Event & Governance | IO-25–28 | Timeline harga + marker insider/aksi/suspensi | tabel filings, kalender, feed berita |
| P6 Peer & Sektor | IO-08,11,12,13,15,29 | Tabel comps heatmap + median | scatter screener, ranking, sector card |
| P7 Tambang & Regional | IO-30–36 | Peta + tren produksi/harga (kontekstual: hanya bila relevan) | tree ownership, lisensi, dossier SGX/KLSE |
| P8 Risiko | IO-38,27 | Gauge skor + checklist aturan terpicu | tabel early-warning |

### 8.3 Aturan efisiensi yang menjaga best practice
- **Konsistensi lintas panel:** sumbu waktu, warna emiten, dan format Rp identik — user tidak belajar ulang per chart.
- **Judul = pesan tetap berlaku** bahkan untuk hero ("Asing net sell Rp1,2 T — tekanan utama minggu ini").
- **Skala jujur tidak boleh dikorbankan demi hemat tempat** — lebih baik lipat ke L2 daripada memadatkan sampai menyesatkan.
- **Tiap panel punya "kenapa ditampilkan"** 1 baris + link evidence — mencegah visual yatim tanpa konteks.
- **Panel irelevan di-collapse otomatis** (mis. P7 disembunyikan bila bukan emiten tambang/regional) dengan tombol "tampilkan".
- **Anggaran perhatian:** L0 ≤30 detik paham; L1 ≤3 menit; L2 sesuai kebutuhan; L3 untuk audit.
- **Responsif:** desktop 3 kolom (input–memo–evidence); mobile menumpuk L0 → hero → L2; tabel menjadi kartu.
- **Export berlapis:** PDF/DOCX eksekutif = L0 + 8 hero; XLSX = L3 penuh + sumber per sheet.

## 9. Contoh Query yang Memakai ≥20 Intent Sekaligus

> Cara baca: user TIDAK menyebut 20+ hal — tiap klausa **mekar otomatis** jadi beberapa intent via planner.
> Semua query di bawah untuk pola **scheduled/cache-warm** (hasil di-cache dan dipakai ulang); di MVP dijalankan on-demand dengan approval bila scheduler (P2) belum ada.

### Q1 — Paket Komite Investasi Pagi (36 intent)
**Penanya:** CIO / komite investasi (A+B+C sekaligus).
**Query:** "Siapkan paket komite pagi ini: (1) review pasar IDX kemarin — IHSG, movers, most-traded, arus asing; (2) screening bank dividen + bandingkan 3 bank besar vs DBS Singapura termasuk flow broker dan insider-nya; (3) cek aksi korporasi, suspensi, berita emiten pilihan; (4) update harga batu bara, tujuan ekspor, IUP yang mau kedaluwarsa; (5) tutup dengan red-flag scan portfolio."

| Klausa | Mekar menjadi |
|---|---|
| Review pasar IDX | IO-16,17,18,19,24 |
| Screening bank dividen | IO-11,12,13,14,15 |
| Bandingkan 3 bank | IO-01,02,03,04,05,08,09,10 |
| vs DBS Singapura | IO-35,36 |
| Flow + insider | IO-06,07,21,22,23,26 |
| Aksi korporasi, suspensi, berita | IO-25,27,28 |
| Batu bara + ekspor + IUP | IO-29,30,31,32,33,34 |
| Red-flag scan | IO-38 |
**Total: 36 intent (semua kecuali IO-20 dan IO-37 yang dihapus). Panel §8: P1–P8 penuh. Estimasi ~100+ kredit tanpa cache → wajib lewat Store + cache (terjadwal bila tersedia).**

### Q2 — Dossier Tambang untuk Pitch + Asesmen Kredit (24 intent)
**Penanya:** IB/PE analyst + analis kredit (B+C).
**Query:** "Buatkan dossier AlamTri untuk pitch akuisisi sekaligus asesmen kredit: profil, produksi 5 tahun, finansial, ownership tree, site & cadangan, harga batu bara, tujuan ekspor, lisensi & lelang, kontrak owner–kontraktor; bandingkan vs 3 peer tambang; cek flow broker, asing, insider, suspensi, berita."

| Klausa | Mekar menjadi |
|---|---|
| Profil, produksi, finansial, tree, site, harga, ekspor, lisensi, kontrak | IO-30,31,32,33,34 |
| Bandingkan vs 3 peer | IO-01,02,03,08,09,11 |
| Snapshot + dividen + freshness + ownership IDX | IO-05,07,10 |
| Flow broker + asing | IO-21,24 |
| Insider, suspensi, berita, aksi korporasi | IO-25,26,27,28 |
| Harga, movers, sektor, red-flag | IO-16,19,29,38 |
**Total: 24 intent. Panel: P1,P2,P4–P8 (P3 ringkas).**

### Q3 — Review Portfolio + Red-Flag Scan Fund (20 intent)
**Penanya:** Portfolio manager / risk manager (A+C).
**Query:** "Review 15 saham portfolio berikut: siapa top mover, asing net buy/sell apa, ada insider transaksi apa, ada yang suspensi/telat lapor, dividen apa yang mendekat, red-flag scan + likuiditas tiap posisi."

| Klausa | Mekar menjadi |
|---|---|
| Red-flag + likuiditas | IO-38,14 |
| Movers, asing, insider, suspensi, telat lapor | IO-19,24,26,27,10 |
| Dividen mendekat + pasar + indeks | IO-25,17,18 |
| Snapshot, earnings, forecast, valuasi, dividen per posisi | IO-01,02,03,04,05 |
| Flow, ownership, berita, growth | IO-21,07,28,13 |
| Harga per posisi | IO-16 |
**Total: 20 intent. Panel: P1,P3,P4,P5,P8 (P8 hero). Dijalankan on-demand per daftar ticker (hasil di-cache).**

### Q4 — Komparasi Bank ASEAN (20 intent)
**Penanya:** regional equity analyst (A/B).
**Query:** "Bandingkan bank besar IDX (BBCA, BMRI, BBRI) vs DBS, UOB vs Maybank: valuasi, profitabilitas, forecast, dividen, insider/buyback/short SGX, top dividend rank, berita regional, posisi vs indeks masing-masing."

| Klausa | Mekar menjadi |
|---|---|
| Dossier + short/buyback/insider SGX | IO-35,36 |
| Valuasi, earnings, forecast, dividen, peer | IO-01,02,03,04,05,08 |
| Berita + indeks + harga | IO-28,18,16 |
| Ownership, freshness, screener, rank, sector map | IO-07,10,11,12,15 |
| Asing (IDX), aksi korporasi, sector card, growth | IO-24,25,29,13 |
**Total: 20 intent. Panel: P1,P2,P3,P6,P7 (P7 hero: format dossier identik lintas bursa).**

### Q5 — Investigasi Saham UMA / Goreng (20 intent)
**Penanya:** compliance / surveillance / analis forensik (C).
**Query:** "Selidiki saham X yang ARA 3 hari lalu kena UMA lalu disuspensi: siapa broker akumulasinya, pola broker itu di saham lain, asing ikut tidak, ada insider filing sebelum naik, berita apa, ownership terkonsentrasi tidak, bandingkan dengan movers lain, ada pola serupa di screener."

| Klausa | Mekar menjadi |
|---|---|
| Movers + broker akumulasi + pola + landscape + asing | IO-19,21,22,23,24 |
| Insider, suspensi, berita, ownership, float | IO-26,27,28,07,14 |
| Harga, pasar, snapshot, freshness, earnings | IO-16,17,01,10,03 |
| Red-flag scan, management, aksi korporasi, growth, screener pola serupa | IO-38,06,25,13,11 |
**Total: 20 intent. Panel: P3,P4,P5,P8 (P8 hero: checklist bukti UMA). Output = paket bukti, bukan vonis.**

### Catatan operasional untuk semua query ≥20 intent
- **Selalu lewat Store + cache** (terjadwal bila tersedia; bila belum, on-demand dengan approval — biaya 40–100+ kredit tanpa cache).
- **Urutan render §8.1 berlaku:** L0 dalam detik (dari cache), panel terisi progresif.
- **Kill-switch per panel:** bila satu fetch gagal, panel terkait jadi empty-state jujur — 19 intent lain tetap tersaji.
