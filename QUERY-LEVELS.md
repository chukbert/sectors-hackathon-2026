# 10 TINGKAT PERTANYAAN RITEL — Tangga Kedalaman Adaptif (INVESTIGRAPH)

> Desain v2 — **doktrin baru: Masteri Konstan, Cakupan Variabel.**
> Untuk disetujui sebelum dibangun. Ini tulang punggung produk.
> Catatan aturan: tidak ada satu pun level yang mengeluarkan kalimat "beli/jual". Level tertinggi memberi **kerangka keputusan** + bukti + ketidakpastian; keputusan tetap milik user.

---

## 1. Doktrin: Masteri Konstan, Cakupan Variabel

Kesalahan yang harus dihindari: **jack of all trades** — sepuluh level yang semuanya serba bisa tapi tidak ada yang dalam. Yang kita bangun: **satu mesin, master di setiap level**, dan master di setiap domain analisis.

Dua hukum yang mengikat seluruh desain:

1. **Level mengubah seberapa luas investigasi, bukan seberapa bagus jawabannya.**
   L1 ("BBCA berapa?") dan L10 ("susun riset lengkap 50jt konservatif") harus sama-sama jawaban terbaik di kelasnya. L1 bukan versi murah yang malas — ia jawaban faktual paling cepat, paling presisi, paling jelas sumbernya yang bisa dibuat. L10 bukan chatbot yang mengarang — ia dossier riset tingkat analis.
2. **"Everything" = seluruh domain data Sectors untuk pasar IDX (54 endpoint v2), dikuasai dalam.**
   Bukan data luar (crypto/makro/intraday) sebagai inti — itu di luar batas eligibility. Kita master di dalam batas yang membuat produk menang.

### 1.1 Mastery Contract (berlaku di SETIAP level, tanpa kecuali)

| # | Invariant | Artinya | Penjaga |
|---|---|---|---|
| M1 | **Grounding mutlak** | Setiap angka bisa dilacak ke payload Sectors (endpoint + tanggal + field). Nol angka tanpa sumber. | Kode + citation check Jev |
| M2 | **Kedalaman interpretasi** | Tidak pernah menyajikan angka telanjang bila konteks tersedia: vs histori, vs peers, vs siklus — atau alasan kenapa tidak bisa dibandingkan. | Compute module + narasi |
| M3 | **Kalibrasi jujur** | Probabilitas + confidence ditampilkan; "tidak tahu" adalah jawaban sah; distribusi bimodal ditandai; confidence bukan hiasan. | Ambang gating + UI |
| M4 | **Kerangka keputusan** | L4+: selalu ada "apa yang mengubah kesimpulan" dan "apa yang dipantau". Nol anjuran beli/jual. | Template + compliance guardrail |
| M5 | **Adversarial by default** | Klaim user/rumor diuji hipotesis tandingan; verifikasi tidak pernah satu arah. | Battery Jev |
| M6 | **Efisiensi kredit master** | Data minimum yang cukup; cache-first; tanpa `sections=all`/`type=all`; rencana + biaya terlihat sebelum eksekusi. | Credit Governor |
| M7 | **Batasan jujur** | Window, cakupan, inferensi-vs-fakta, data kosong — dinyatakan, bukan disembunyikan. | Template + narasi |
| M8 | **Jejak audit** | Model + endpoint + window + biaya + pertanyaan Jev terekam per jawaban. | Orchestrator trace |
| M9 | **Modularitas capability** | Tiap domain = satu paket (data plan + compute + battery + template + uji). Menambah kemampuan ≠ menulis ulang aplikasi. | Capability registry |

**Konsekuensi desain:** tidak ada "mode cepat yang bodoh" dan tidak ada "mode dalam yang ngawur". Yang ada hanya satu kualitas, dengan cakupan berbeda.

---

## 2. Tiga sumbu yang dirancang bersama

| Sumbu | Fungsi |
|---|---|
| **Tingkat pertanyaan (L1–L10)** | Menentukan **cakupan**: berapa sumber, berapa lapisan pemrosesan, berapa posisi Jev. **Tidak pernah menentukan mutu.** |
| **Mode bahasa (Pemula / Menengah / Advanced)** | Menentukan **cara penyajian** (analogi vs istilah teknis vs data mentah + metode). **3 varian narasi digenerate & disimpan sekaligus per jawaban** → toggle on-the-fly tanpa panggilan AI. Biaya Sectors tidak berubah. |
| **Credit Governor** | Rencana + estimasi kredit sebelum eksekusi, checkpoint di level mahal, cache-first, cap keras, ledger transparan. |

Tabel ringkas:

| L | Nama | Ciri pertanyaan | Data Sectors (estimasi dingin) | Posisi Jev | Output inti |
|---|---|---|---|---|---|
| 1 | **Fakta Tunggal** | 1 angka, 1 emiten | 0–1 | 0 (routing aturan) | angka + kesegaran + sumber |
| 2 | **Fakta + Makna** | 1–2 angka + "artinya apa?" | 0–2 | 1 ringan | angka + edukasi + relevansi |
| 3 | **Ringkasan Terarah** | "ringkas", 1 emiten, 1 topik | 2–4 | 1 verifier | poin + sitasi, tanpa yang penting terlewat |
| 4 | **Turunan & Tren** | "tumbuh nggak?", "tren margin" | 3–7 | 2 | tabel/grafik + skor tren + limitasi |
| 5 | **Perbandingan Sejajar** | 2–4 emiten, metrik sama | 6–12 | 3 | tabel ternormalisasi + pemenang per kriteria |
| 6 | **Analisis Fundamental Menyeluruh** | 1 emiten, multi-dimensi | 8–16 | 4 | kartu skor + red flags + confidence per dimensi |
| 7 | **Verifikasi Klaim / Anti-Rumor** | teks rumor/klaim bombastis | 10–18 | 5 | verdict + probabilitas + tabel klaim-vs-bukti |
| 8 | **Bandarmologi / Jejak Pemain Besar** | "bandar/asing/akumulasi" | 12–22 | 6 | verdict + tabel broker + window + metode |
| 9 | **Valuasi & Skenario** | "murah?", "siklus", minta proyeksi | 15–28 | 8 | matriks skenario + posisi siklus + trap risk |
| 10 | **Riset Keputusan Menyeluruh** | portofolio, multi-emiten, riset lengkap | 25–50 bertahap | 8–10 | dossier: fakta → turunan → skor → keyakinan → skenario → risiko → pemantauan |

> Estimasi dingin (cache kosong), dikunci di registry setelah verifikasi Hari 1–2. Cache hit = 0 kredit.

---

## 3. Detail per level (dengan Master Bar masing-masing)

### L1 — Fakta Tunggal
- **Ciri**: 1 entitas + 1 metrik + kata tanya faktual; tanpa "banding/analisis/kenapa/tren".
- **Contoh**: "BBCA sekarang berapa?" · "PER BBRI?" · "Dividen terakhir TLKM?"
- **Data**: 1 field (cache dulu; fallback 1 section/1 quarter/quote). **0–1 kr.**
- **Kode**: format angka + satuan + konversi + timestamp data.
- **Jev**: tidak ada. **LLM**: tidak ada (template).
- **Master Bar**: jawaban faktual tercepat & paling presisi di kelasnya — label kesegaran eksplisit ("per 18 Sep, sumber: report/valuation"), satuan benar, satu klik ke konteks (tren mini dari cache, 0 kr), dan tidak pernah angka telanjang tanpa tanggal + sumber.
- **Gate**: langsung.

### L2 — Fakta + Makna
- **Ciri**: minta arti istilah; angka ≤2.
- **Contoh**: "PER 14x itu artinya apa? BBRI berapa?" · "Yield 6% bagus nggak?"
- **Data**: 1–2 endpoint. **0–2 kr.**
- **Kode**: ambil angka; definisi dari **basis edukasi tulisan kami sendiri** (bukan karangan LLM).
- **Jev**: 1 call ringan (Noul: over-simplifikasi?). **LLM**: 1 paragraf analogi.
- **Master Bar**: edukasi yang tidak menyesatkan — menjelaskan sekaligus menunjukkan batas ("PER rendah bisa karena laba sekali-jual"), mengaitkan angka hidup ke istilah, dan relevansi personal (mode bahasa).
- **Gate**: langsung.

### L3 — Ringkasan Terarah
- **Ciri**: "ringkas/simpulkan/poin penting", 1 emiten, 1 topik.
- **Contoh**: "Ringkas kinerja BBRI kuartal terakhir" · "Poin penting dividen BBCA".
- **Data**: report 1–2 sections + 1–2 kuartal. **2–4 kr.**
- **Kode**: angka kunci + YoY sederhana + cek kelengkapan topik.
- **Jev**: verifier sitasi + **checker kelengkapan** ("ada hal material yang terlewat?"). **LLM**: 3–5 poin.
- **Master Bar**: ringkasan tanpa kehilangan yang material — bukan daftar angka, tapi poin yang bisa dipakai; tiap poin bersitasi; yang tidak ada datanya dinyatakan.
- **Gate**: langsung.

### L4 — Turunan & Tren
- **Ciri**: "tren/pertumbuhan/naik-turun/dibanding tahun lalu"; komputasi eksplisit, 1 emiten.
- **Contoh**: "Laba BBRI 4 tahun tumbuh nggak?" · "Margin BBCA trennya gimana?"
- **Data**: quarterly 4–8 kuartal + report. **3–7 kr.**
- **Kode**: CAGR (bukan rata-rata naif), YoY, margin, persentil, deteksi one-off, efek musiman. **Semua aritmetika di kode.**
- **Jev**: Score kualitas tren + citation check. **LLM**: narasi tren.
- **Master Bar**: turunan yang benar secara statistik (CAGR vs average, periode tidak sebanding di-flag, laba sekali-jual dipisah), konteks vs histori sendiri, skor tren + limitasi periode.
- **Gate**: langsung; anomali → tawarkan naik level (§5.3).

### L5 — Perbandingan Sejajar
- **Ciri**: 2–4 ticker + "bandingin/vs/lebih baik"; dimensi jelas.
- **Contoh**: "NIM BBRI vs BMRI vs BBNI?" · "Dividen BBCA vs BBRI mana lebih aman?"
- **Data**: report per emiten (sections relevan) + peers/subsector avg. **6–12 kr.**
- **Kode**: normalisasi definisi metrik, tabel apple-to-apple, composite score (bobot transparan), sensitivitas bobot.
- **Jev**: preflight keterbandingan + composite scorer + verifier tiap sel. **LLM**: sintesis.
- **Master Bar**: apple-to-apple sungguhan — definisi metrik disamakan, metrik tidak sebanding di-flag dan tidak dipaksa dibandingkan, pemenang **per kriteria** (bukan "terbaik" global), bobot bisa digeser dan hasilnya ikut berubah.
- **Gate**: preflight data dulu, baru eksekusi.

### L6 — Analisis Fundamental Menyeluruh
- **Ciri**: 1 emiten + "analisis/fundamental/layak/inti portofolio"; tanpa rumor, tanpa minta proyeksi.
- **Contoh**: "BBCA layak jadi inti portofolio? Analisis lengkap dong" · "Kesehatan keuangan TLKM sebenarnya?"
- **Data**: report 5–6 sections + quarterly 8Q + segments. **8–16 kr.**
- **Kode**: profitabilitas, solvabilitas, kas, **kualitas laba (recurring vs sekali jual aset)**, FCF coverage dividen, valuasi triangulasi (histori + peers + intrinsik).
- **Jev**: preflight + composite (4–6 sub-skor) + verifier + compliance. **LLM**: laporan analisis.
- **Master Bar**: kedalaman institusional — bukan rasio tempelan; kualitas laba & kas didahulukan; red flags (dilusi, piutang melonjak, utang jatuh tempo) muncul; confidence per dimensi, bukan satu angka global.
- **Gate**: rencana biaya ditampilkan; user setuju.

### L7 — Verifikasi Klaim / Anti-Rumor
- **Ciri**: ada teks tempelan (kutipan grup/medsos) ATAU klaim eksplisit ("katanya/bakal/terbang/dijamin").
- **Contoh**: "Grup Telegram: GOTO TERBANG 50%, cek dong" · "Katanya BBRI naik karena buyback, bener?"
- **Data**: report + quarterly + broker-summary/top + foreign-flow + most-traded + top-changes. **10–18 kr.**
- **Kode**: pecah klaim jadi proposisi; agregasi net flow + konsentrasi; red flags vs klaim.
- **Jev**: guardrail input + battery (klaim, dukungan bukti, pompom, severity) + verifier + kritik narasi + compliance. **LLM**: devil's advocate.
- **Master Bar**: adversarial penuh — klaim dipecah per proposisi dan tiap proposisi diuji; bukan cuma "didukung/tidak" tapi **seberapa kuat, dengan bukti apa, dan apa yang bisa membalikkan**; edukasi exit liquidity tanpa merendahkan user; pola pompom dideteksi dari bahasa.
- **Gate**: konfirmasi (≥10 kr); default lanjut kalau user jelas menempel rumor.

### L8 — Bandarmologi / Jejak Pemain Besar
- **Ciri**: "bandar/asing/institusi/akumulasi/distribusi/top buy/top sell" atau "siapa yang beli/jual".
- **Contoh**: "Beneran bandar akumulasi BBRI 2 minggu ini? Broker mana?" · "Asing masih net beli bank?"
- **Data**: broker-summary 14 hari + broker-summary-top + broker-activity/top + brokers/top + foreign-flow + shareholders. **12–22 kr.**
- **Kode**: net per broker, konsistensi harian, konsentrasi top-3, split foreign/domestik, foreign share, konteks harga akumulasi.
- **Jev**: guardrail + preflight (window cukup?) + battery (accumulation, foreign_led, distribution_risk, verdict) + verifier + kritik narasi + compliance. **LLM**: narasi pola.
- **Master Bar**: tingkat analis — bukan "broker X beli banyak", tapi pola: konsisten/tidak, di harga berapa, didominasi siapa, dibanding window sebelumnya; window & metode dinyatakan; verdict probabilistik terkalibrasi; tegas menyebut ini **inferensi, bukan fakta niat**.
- **Gate**: konfirmasi; window & biaya ditampilkan.

### L9 — Valuasi & Skenario
- **Ciri**: "murah/mahal/valuasi/wajar", "siklus", minta proyeksi/skenario/join komoditas.
- **Contoh**: "ITMG PER 4x murah nggak? Cek siklus batubara + skenario kalau coal turun" · "BBCA PBV 2,1x wajar?"
- **Data**: quarterly + commodity price (≤3 thn monthly) + mining performance/reserves + report valuation/peers + konteks sektor. **15–28 kr.**
- **Kode**: korelasi laba–komoditas, posisi persentil siklus, skenario aritmetika eksplisit (jika X → EPS/PER Y), sensitivitas. **Semua angka di kode.**
- **Jev**: semua posisi L6–L8 + pairwise judge + pemeriksa asumsi + penilai risiko trap. **LLM**: penulis skenario.
- **Master Bar**: disiplin skenario — asumsi eksplisit & bisa diperiksa, sensitivitas 1–2 variabel kunci, posisi siklus dengan bukti, "apa yang membatalkan tesis", dan **tidak pernah berupa ramalan** ("jika… maka…", bukan "akan").
- **Gate**: checkpoint per fase; user memilih kedalaman skenario.

### L10 — Riset Keputusan Menyeluruh ("dewa")
- **Ciri**: ada konteks dana/horizon/profil + minta riset lengkap/portofolio/pemilihan multi-emiten.
- **Contoh**: "Aku punya 50jt, konservatif, horizon 2 tahun. Susun riset lengkap: pilih 3 terbaik dari bank + telco, plus risiko, skenario, dan yang harus kupantau bulanan."
- **Data & fase**: (1) screener penyaringan kandidat 2–4 kr → user konfirmasi; (2) report full sections + quarterly + broker/foreign + dividend per kandidat 10–25 kr; (3) verifikasi silang + skenario + kalender pemantauan 8–20 kr. **Tidak jalan tanpa persetujuan tiap fase.**
- **Kode**: seluruh pipeline (normalisasi, skor gabungan, skenario, red flags, kalender pemantauan).
- **Jev 8–10 posisi**: classifier · guardrail input · preflight · composite per kandidat · pairwise judge antar kandidat · verifier klaim · pemeriksa asumsi · ranker prioritas · compliance · ekstraktor tesis ke memory. **LLM**: laporan multi-bagian + ringkasan eksekutif.
- **Master Bar**: dossier keputusan — semua lapisan sekaligus (fakta, turunan, skor + bobot transparan, probabilitas + confidence, skenario + asumsi, risiko + red flags, kalender + checklist pemantauan, sitasi tiap angka, audit, disclaimer); dipersonalisasi ke profil/horizon; bahasa sesuai mode; **tanpa satu pun kalimat anjuran**.
- **Gate**: persetujuan per fase + cap keras.

---

## 4. Peta domain masteri — inilah "everything" (seluruh cakupan IDX di Sectors v2)

Setiap domain adalah **capability** (data plan + compute + battery + template + uji). Level hanyalah cara mesin mengomposisikan capability ini.

| # | Domain | Endpoint inti | Standar master (beda dengan yang amatir) |
|---|---|---|---|
| 1 | **Harga & Likuiditas** | daily, most-traded, free-float, suspensions, shareholders | Bukan cuma harga: profil likuiditas (nilai median, hari sepi, days-to-exit untuk ukuran posisi), riwayat suspensi/UMA, anomali volume vs berita |
| 2 | **Fundamental & LK** | report financials, quarterly, get-segments | Kualitas laba (recurring vs one-off), FCF vs laba akuntansi, modal kerja, segmen ekonomi, YoY/QoQ yang sadar musiman & periode tidak sebanding |
| 3 | **Valuasi** | report valuation/peers/future | Triangulasi (histori vs peers vs intrinsik vs forward), jelaskan **kenapa** premium/diskon, waspada denominator terdistorsi (EPS siklikal) |
| 4 | **Dividen & Aksi Korporasi** | report dividend, corporate-actions | Uji keberlanjutan (payout, cash payout, FCF coverage), recurring vs jual aset, timeline cum/ex/recording/payment, konsistensi 5 tahun, dilusi rights/split |
| 5 | **Bandarmologi** | broker-summary, -top, broker-activity(+top), brokers/top, broker-registry | Net per broker + konsistensi + konsentrasi + foreign split + konteks harga + window; verdict probabilistik; "inferensi, bukan fakta niat" |
| 6 | **Foreign Flow & Kepemilikan** | foreign-flow(+universe), shareholders(+composition) | Aliran harian ≠ perubahan struktur bulanan; konteks ranking universe; jangan campur dua hal ini (kesalahan amatir paling umum) |
| 7 | **Discovery & Screening** | companies (where/q), subsectors/industries/subindustries/tags, top-changes | Terjemahan kriteria → `where` terstruktur (hemat 1 vs 3 kr), validasi slug, jelaskan kenapa lolos **dan apa yang tidak tertangkap filter** |
| 8 | **Komoditas & Mining** | mining/commodities(+price), mining-companies financials/performance, licenses, contracts, sales-destination | Join equity–komoditas, posisi siklus, korelasi, produksi/reserves/strip ratio, risiko izin & kontrak, skenario harga |
| 9 | **IPO & Listing** | listing-performance, report + quarterly emiten baru | Valuasi vs peers + track record IPO sejenis (7/30/90/365d) + penggunaan dana + struktur/lock-up |
| 10 | **Kalender & Event** | latest-quarterly-dates, corporate-actions, filings, news, suspensions | Hitung sisa hari bursa, dampak per jenis event, checklist tindakan (bukan anjuran transaksi) |
| 11 | **Sektor & Indeks / Rotasi** | index-daily, idx-total, subsector/report, foreign-flow universe | Rotasi = net asing per sektor + momentum 7/30d + breadth; dikaitkan ke watchlist user; briefing pra/pasca bursa |
| 12 | **Klaim & Rumor (adversarial)** | lintas domain (di atas) | Devil's advocate, severity, source-agnostic, pola pompom, edukasi exit liquidity — inti L7, dipakai semua level tinggi |
| 13 | **Tag & Klasifikasi** | tags, industries, subindustries, subsectors, screener filter tag | Taksonomi konsisten & bisa ditelusuri: salah slug/kategori merusak semua agregasi; arti tiap taksonomi dijelaskan, dampak reklasifikasi dikenali, agregasi lintas sektor tidak menyesatkan |

**Bukti tidak ada domain yang "jack"**: setiap capability punya **mastery test suite** (§9) dan muncul minimal di satu kasus demo.

---

## 5. Mesin tingkat

### 5.1 Fitur aturan di kode (cepat, gratis)
| Fitur terdeteksi | Efek level |
|---|---|
| 1 ticker | plafon L6 (kecuali ada pemicu lain) |
| 2–3 ticker + kata banding | minimal L5 |
| ≥4 ticker ATAU ada konteks dana/horizon/profil | minimal L10 |
| Ada teks kutipan/rumor | minimal L7 |
| "bandar/asing/akumulasi/distribusi/broker" | minimal L8 |
| "murah/valuasi/siklus/skenario/proyeksi" | minimal L9 |
| "ringkas/poin penting" | plafon L3 |
| "analisis/fundamental/layak/jangka panjang" | minimal L6 |
| "jelaskan ke pemula" | mengubah **mode bahasa**, bukan level |

### 5.2 Klasifikasi Jev (1 call)
Choice(10) dengan criteria tiap level + Noul pelengkap (`needs_multi_source`, `user_provided_thesis_context`).
Gabung: **`level = max(aturan, Jev)`** — bias melayani cukup, bukan menebak murah. Tetap tunduk Credit Governor.

### 5.3 Adaptif di tengah jalan
- Anomali di L3–L4 (payout >100%, rugi beruntun, volume anomali) → agen mengusulkan: "Saya menemukan sinyal X. Naik ke L7/L8 untuk verifikasi? +8 kr."
- User memaksa: "lebih dalam" / "cukup" / "hemat".
- Pertanyaan lanjutan dari cache = **0 kr** — nilai jual: satu investigasi mahal, banyak turunan gratis.

---

## 6. Credit Governor

1. **Plan preview**: level, endpoint + parameter + window, estimasi kredit, alasan tiap sumber.
2. **Cap per level** (default, bisa diubah): L1–L2 = 2 kr · L3–L4 = 8 kr · L5–L6 = 16 kr · L7–L8 = 24 kr · L9 = 40 kr · L10 = 70 kr per sesi.
3. **Threshold konfirmasi**: >6 kr klik setuju; L9–L10 selalu bertahap per fase.
4. **Cache-first**: fakta & jawaban Jev di-cache (hash state). TTL: harga harian; fundamental per rilis kuartal; broker per hari bursa. **Store-nya: [`API-HIT-STORE.md`](./API-HIT-STORE.md)** (cache + ledger + audit jadi satu).
5. **Ledger transparan**: endpoint, biaya, status, waktu; sisa kredit harian terlihat. Sumber tunggal: tabel `api_hits` di store yang sama.
6. **Fail-safe**: kredit menipis/endpoint gagal → jawab dari cache + label tanggal + tawarkan ulang nanti. Tidak pernah diam-diam boros.

**Simulasi 1 hari ritel:**

| Pertanyaan | L | Kredit |
|---|---|---|
| "BBCA berapa?" | 1 | 0 (cache) |
| "PER artinya apa?" | 2 | 1 |
| "Ringkas kinerja BBRI" | 3 | 3 |
| "Laba 4 tahun tumbuh?" | 4 | 5 |
| "Dividen BBCA vs BBRI?" | 5 | 9 |
| "GOTO terbang 50% bener?" | 7 | 14 |
| "Broker mana yang beli?" | 8 (cache + tambahan) | 8 |
| **Total** | | **40 kr** → ±25 hari pemakaian dari 1.000 kr |

---

## 7. Peta posisi Jev per level

| Posisi Jev | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Level classifier + intent | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Guardrail input | | | | | | | ✓ | ✓ | ✓ | ✓ |
| Preflight kecukupan data | | | | | ✓ | ✓ | | ✓ | ✓ | ✓ |
| Composite scorer | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Battery klaim/broker | | | | | | | ✓ | ✓ | ✓ | ✓ |
| Verifier sitasi tiap klaim | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kritik narasi (retry/template) | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Compliance output (fail-closed) | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pairwise judge | | | | | ✓ | | | | ✓ | ✓ |
| Pemeriksa asumsi skenario | | | | | | | | | ✓ | ✓ |
| Ranker prioritas/urgensi | | | | | | | | ✓ | ✓ | ✓ |
| Ekstraktor tesis → memory | | | | | | | | | ✓ | ✓ |
| Pemeriksa kelengkapan ringkasan | | | ✓ | | | | | | | ✓ |

Seluruh 13 posisi Jev ≈ $0,0005–0,002 per sesi (fan-out). **Yang mahal adalah Sectors — itulah yang dijaga tangga ini.**

---

## 8. Kontrak output per level (lantai minimum, bukan langit-langit)

| L | Fakta | Arti | Turunan | Tabel/grafik | Skor | Prob+conf | Skenario | Sitasi | Audit | Disclaimer |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ✓ | | | | | | | ✓ | ✓ | ✓ |
| 2 | ✓ | ✓ | | | | | | ✓ | ✓ | ✓ |
| 3 | ✓ | ✓ | ✓ | | | | | ✓ | ✓ | ✓ |
| 4 | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ | ✓ |
| 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ |
| 6 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ |
| 7 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ |
| 8 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ |
| 9 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 10 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Pembeda L5 vs L6 vs L7 dst. bukan lapisan output, tapi **jenis bukti**: perbandingan, fundamental menyeluruh, adversarial klaim, aliran uang, skenario+trap, atau semuanya (L10).

**Wujud visual kontrak ini:** [`OUTPUT-LAYER.md`](./OUTPUT-LAYER.md) — `AnswerDoc` + Visual Registry (tidak ada data mentah; setiap visual wajib caption + takeaway + sumber + as_of).

---

## 9. Cara membuktikan masteri ke juri (bukan klaim)

1. **Mastery test suite** di repo: 13 domain × 3 kasus (39 kasus: 1 mudah, 1 tipikal, 1 adversarial) + ekspektasi output + pass/fail. Dijalankan pada data live; hasil dicatat di `MASTERY.md` dengan timestamp, endpoint, biaya.
2. **Evidence card per capability**: contoh output nyata + sitasi + confidence + audit trail.
3. **Kontras biaya**: L1 (0 kr) vs L10 (bertahap) dalam satu tabel — bukti efisiensi, bukan janji.
4. **Video**: tunjukkan mastery test suite berjalan + bukti live, bukan cuma UI.
5. **README**: matrix domain × status uji × contoh, dan daftar batasan jujur.

---

## 10. Keputusan final (dikunci 21 Sep 2026)

0. **Stack: ✅ TypeScript + React + Next.js** (App Router, Tailwind, Recharts, zod; API key server-only; logika agent di server).
1. **Domain: ✅ 13 domain** — 12 domain awal + **Tag & Klasifikasi** sebagai domain penuh (§4).
2. **Kredit: ✅ cap longgar** — konfirmasi >6 kr, L9–L10 per fase, cap L9 = 40 kr & L10 = 70 kr per sesi (§6).
3. **Demo: ✅ L1 + L7 + L10 + mastery suite** — presisi murah → adversarial → dossier bertahap; suite membuktikan masteri level menengah.
4. **Mode bahasa: ✅ toggle Pemula/Menengah/Advanced** — tidak mengubah cakupan/biaya Sectors; **ketiga varian digenerate & disimpan sekaligus** (toggle instan tanpa panggilan AI; token narasi/Jev naik tipis).
5. **Tanpa scaffold sampai user memberi aba-aba** — lanjut penyempurnaan desain/dokumen dulu.