# PLAN — Sectors Hackathon 2026, Track 01 (AI Agents & Assistants)

> ️ **Revisi arah (21 Sep):** desain produk terkini ada di [`QUERY-LEVELS.md`](./QUERY-LEVELS.md) — doktrin **Masteri Konstan, Cakupan Variabel**: 10 tingkat kedalaman pertanyaan + pengendali kredit + **13 domain masteri**. Keputusan sudah dikunci: stack **TypeScript + React + Next.js**, cap kredit longgar (L9=40/L10=70), demo L1+L7+L10+suite, toggle bahasa 3 mode, **7 peran LLM**, bentuk produk **chatbot murni** (input teks → jawaban; tanpa watcher/scheduled task). Bagian produk (§0–§2, §4, §8) di dokumen ini menunggu sinkronisasi. **Belum ada scaffold** sampai user memberi aba-aba. Bagian logistik (jadwal, submission, anti-diskualifikasi) tetap berlaku.
>
> Status: daftar ✅ · kredit 1.000 ✅ · solo + AI pair-programming ✅ · full-time 8+ jam/hari ✅
> Deadline submission: **30 September 2026, 23:59 WIB** (target submit: 29 Sep, sisakan 1 hari buffer)
> Aturan main: produk informasi/analisis. **Bukan rekomendasi investasi. Dilarang eksekusi order.**

---

## 0. Cara menang dalam 3 menit baca (versi non-finance)

Hackathon ini **tidak menilai kode paling canggih**. Menilai 3 hal:

| Kriteria | Bobot | Artinya dalam bahasa manusia |
|---|---|---|
| Real-world usability | 40% | Ada orang Indonesia nyata yang hari ini butuh alat ini dan bisa langsung pakai |
| Video demo & storytelling | 30% | Video 3 menit bikin juri mengerti masalahnya DAN melihat produknya benar-benar jalan |
| Technical depth & execution | 30% | Cara pakai Sectors-nya inovatif, produknya nyata (bukan mockup), rekayasanya rapi |

**Jadi strateginya:** satu masalah nyata yang menyakitkan → satu alur produk yang jalan end-to-end → video yang jujur dan jelas → teknik yang bisa diaudit.
Bukan chatbot serba bisa yang dangkal. Bukan screener biasa (semua tim bikin itu).

**Aturan khusus Track 01:** wajib ada **logika agent buatan tim sendiri** (multi-step reasoning, tool-use pipeline, routing, memory, autonomous task).
Menempelkan prompt ke aplikasi AI orang lain = gagal. Sectors REST API harus jadi **sumber data inti** — kalau Sectors dicabut, produk mati.

---

## 1. Masalah yang kita serang (kenapa ini menang)

**Fakta (dari riset `pain-points-ritel.md`):**
- 30 juta+ investor ritel terdaftar, tapi yang aktif transaksi hanya ~1–1,4 juta/bulan.
- **84,6% beli saham karena ikut-ikutan (herding)**, bukan karena tesis.
- **72% pemula rugi** >30% (2021–2023).
- Budaya "pompom": rumor di Telegram/TikTok ("GASSS AKUM BANDAR, BESOK TERBANG 50%, JANGAN KETINGGALAN") menggerakkan orang beli tanpa bukti. Yang masuk terakhir jadi **exit liquidity** (makanan bandar).
- Tidak ada alat yang menjawab: **"klaim ini didukung data atau tidak?"** — semua alat yang ada cuma menampilkan angka, bukan menilai klaim.

**Solusi: INVESTIGRAPH — AI research agent yang memverifikasi klaim saham sebelum kamu percaya.**
Tempel rumor / pertanyaan apa pun → agent merencanakan investigasi → mengambil data Sectors yang relevan → menghitung → menilai dengan probabilitas → menulis kesimpulan bahasa Indonesia → memverifikasi ulang angka & kepatuhan → menampilkan verdict + bukti + sitasi + disclaimer.

Tagline kandidat: **"Dari rumor jadi bukti."** / **"Cek dulu, baru percaya."**

**Kenapa menang:**
- Masalahnya emosional, relatable, dan besar (juri langsung paham).
- Sectors adalah satu-satunya yang punya data broker/foreign-flow/bandarmologi sedalam ini — jadi "kehilangan Sectors = kehilangan produk" itu benar secara alami.
- Alur verifikasi = **multi-step tool-use + memory + guardrail** = tepat di tengah syarat Track 01.
- Video demo punya momen dramatis: rumor bombastis masuk → verdict "tidak didukung data" dengan bukti.

---

## 2. Produk: apa yang dibangun

**Nama: INVESTIGRAPH** · Web app (Next.js), Bahasa Indonesia, 1 repo publik.

### 2.1 Hero workflow — Verifikator Klaim (PP-08/09/10)

User menempel teks rumor ATAU bertanya biasa:

> "Dapat dari grup Telegram: GASSS AKUM BANDAR GOTO, BESOK TERBANG 50 PERSEN!! Gimana?"
> "Katanya asing masuk besar ke BBRI minggu ini, beneran akumulasi?"

Pipeline agent (semua keputusan orkestrasi = kode milik kita):

```
INPUT user
  → [1] Guardrail input (Jev, 1 call): injeksi? minta rekomendasi beli/jual? hype level? klaim apa?
  → [2] Ekstraksi ticker + intent router (Jev Choice 18-intent + regex + validasi daftar emiten)
  → [3] PLANNER (kode): tentukan endpoint Sectors + window + perkiraan kredit (hemat!)
  → [4] EXECUTE tool Sectors (minimal, paralel, cache)
  → [5] COMPUTE (kode): net flow, konsentrasi top buyer, foreign share, rasio, percentile, dll.
  → [6] Jev judge (1 fan-out): evidence_supports, pom-pom score, severity, accumulation, distribution_risk, verdict
  → [7] Confidence gate: tinggi→tampil; sedang→tampil + badge ragu; rendah→"data belum cukup" + jelaskan yang kurang
  → [8] Narator LLM (Bahasa Indonesia sederhana, angka diinjeksi dari payload, bukan dikarang)
  → [9] Guardrail output (Jev): numbers_traceable, advice_leak, disclaimer — gagal → retry / template floor
  → [10] RENDER: verdict + probabilitas + confidence + tabel bukti + sitasi per angka + audit trail + disclaimer
```

Yang membedakan dari chatbot biasa — **semua ini terlihat di UI**:
- **Probabilitas + confidence ditampilkan apa adanya** ("Akumulasi 0,78 · conf 0,71 · window 10 hari · top-3 buyer 62%"), bukan label mati.
- **Audit trail**: endpoint Sectors + parameter + window, pertanyaan Jev + jawaban + versi model, biaya kredit. Juri bisa cek "ini beneran jalan".
- **Counter kredit** yang terlihat (bukti rekayasa hemat kredit).
- **Devil's advocate**: tabel "klaim vs bukti" yang sengaja mencari alasan rumor itu SALAH.
- **Honest limitations**: "bandar = inferensi pola, bukan fakta niat"; "Sectors tidak scraping TikTok — kamu paste, kami verifikasi"; "data tidak tersedia" kalau memang tidak ada.

### 2.2 Fitur pendukung (untuk breadth di video, bukan inti)

1. **Penjaga Dividen (PP-06)** — "Yield 12% aman?" → cek payout, cash payout, 5 tahun riwayat, laba recurring vs sekali jual aset → verdict `sustainable | watch | likely_trap` + edukasi.
2. **Komparator Apple-to-Apple (PP-04)** — "Bandingin BBCA BBRI BMRI BBNI" → planning → 4 report → normalisasi tabel → composite score dengan slider bobot (konservatifagresif) → verifikasi tiap sel oleh Jev. *Ini contoh persis yang disebut track (01A), jadi wajib ada.*
3. **Pemantauan Kalender On-Demand (PP-12/13)** — saat ditanya: hitung sisa hari bursa + dampak event (cum/ex/recording/payment, rasio rights/split) dari `corporate-actions` + `latest-quarterly-dates`; checklist tindakan user (bukan anjuran transaksi).
4. **Memory (state management)** — simpan tesis user ("GOTO: spekulasi, cut-loss 7%") dan watchlist; verdict berikutnya merujuk tesis user sendiri. Memenuhi syarat "memory or state management".

### 2.3 Yang TIDAK dibangun (disiplin scope + aturan)

- ❌ Eksekusi order / koneksi broker (dilarang aturan).
- ❌ Rekomendasi beli/jual eksplisit (code of conduct). Selalu "prioritas riset", bukan "beli sekarang".
- ❌ Data luar Sectors sebagai inti (crypto, makro, intraday) — hanya kalau perlu sebagai konteks berlabel.
- ❌ Login berat, payment, mobile app, multi-bahasa. Fokus.

---

## 3. Arsitektur teknis

```
┌──────────────────────────── Next.js (App Router, TypeScript) ────────────────────────────┐
│  UI (Tailwind): chat input · verdict card · evidence table · audit trail · credit meter   │
│  API routes (server-only; semua API key tidak pernah sampai browser)                      │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│  lib/agent/orchestrator.ts   ← state machine + trace (code owns control flow)             │
│  lib/agent/planner.ts        ← intent + ticker → rencana tool + estimasi kredit           │
│  lib/jev/*                   ← client OpenRouter /api/alpha/decisions (choice/score/noul) │
│  lib/sectors/*               ← client REST v2 + registry endpoint + biaya + window + zod  │
│  lib/compute/*               ← fungsi murni: net flow, konsentrasi, rasio, tanggal        │
│  lib/narrate/*               ← LLM OpenRouter (narasi ID, angka hanya dari payload)       │
│  lib/guardrail/*             ← input + output check, fail-closed                          │
│  lib/memory/*                ← SQLite/JSON: tesis, watchlist, cache, credit ledger        │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Prinsip warisan riset yang wajib dipatuhi (`jev-ai.md`):**
- **Kode yang memegang kendali; Jev hanya keputusan sempit terstruktur.** Bukan agent loop yang jalan sendiri.
- **Sectors = satu-satunya sumber angka. LLM = satu-satunya penulis kalimat. Jev = penilai/verifikator.**
- **Aritmetika & tanggal di kode** — Jev tidak pernah ditanya "berapa PER" atau "berapa hari lagi".
- **State yang dikirim ke Jev = hasil filter kode**, bukan payload mentah (hindari context rot).
- **Instruksi Jev dalam Inggris presisi; narasi akhir Bahasa Indonesia.**
- **Pin versi model Jev** (`jev-1.13`) setelah threshold stabil; log versi yang menjawab.
- **Fail-closed**: Jev/LLM mati → jangan tampilkan narasi liar; pakai template + label "tanpa AI narator".

**Stack:** Next.js 15 + TypeScript + Tailwind + Recharts + better-sqlite3 (atau JSON) + zod. Package manager: pnpm/bun. Node 22 tersedia.

**Jalur data:** Sectors REST v2 (`SECTORS_API_KEY`) · OpenRouter (LLM narator + Jev decisions `typesafe/jev-1.13` via `POST https://openrouter.ai/api/alpha/decisions`).

---

## 4. Peta skor sempurna (checklist yang bisa dicentang juri)

### 4.1 Real-world usability — 40%
- [ ] Masalah nyata + angka konkret di README & video (84,6% herding; 72% rugi).
- [ ] Alur inti jalan end-to-end TANPA crash di video (happy path + 2 edge case: ticker tidak ada, data kosong).
- [ ] Bahasa Indonesia awam; istilah dijelaskan saat muncul.
- [ ] Verdict selalu membawa bukti + sitasi + tingkat keyakinan; tidak ada angka tanpa sumber.
- [ ] Disclaimer "bukan rekomendasi investasi" muncul di setiap output (dan di footer).
- [ ] Memory tesis user + watchlist terasa seperti asisten pribadi, bukan kalkulator.
- [ ] Eskalasi level adaptif + self-repair (Repair saat Jev menolak) membuktikan agen bekerja otonom di dalam satu turn.

### 4.2 Video demo & storytelling — 30%
- [ ] **Teaser 1 menit**: hook 5 detik → rumor masuk → verdict keluar → tagline. Upload YouTube publik/sosmed.
- [ ] **Video juri 3 menit**: masalah (25 dtk) → demo hero lengkap (110 dtk) → breadth 2 fitur pendukung (30 dtk) → kedalaman teknis singkat: audit trail + kredit (20 dtk) → batasan jujur + visi (15 dtk).
- [ ] Ada script + storyboard; direkam 2–3 take; caption; audio bersih; tidak ada dead air.
- [ ] Demo memakai data LIVE (bukan mockup). Siapkan cache langkah sebagai jaring pengaman kalau jaringan bermasalah — tapi video tetap menampilkan alur live.
- [ ] Momen dramatis dipertahankan: rumor "TERBANG 50%" → bukti menunjukkan sebaliknya → "kamu berisiko jadi exit liquidity".

### 4.3 Technical depth & execution — 30%
- [ ] Orkestrasi milik sendiri terlihat di kode (planner, pipeline, verifikasi, memory) — bukan wrapper prompt.
- [ ] Penggunaan Sectors inovatif & efisien: registry biaya, `sections=`/`type=` spesifik, `where=` > `q=`, window tepat, cache, credit ledger.
- [ ] Join lintas domain (mis. equity + commodity untuk value trap) sebagai bukti kedalaman.
- [ ] Verifikasi berlapis: Jev citation check menangkap angka karangan; compliance guardrail fail-closed.
- [ ] Audit trail per jawaban (endpoint + window + model + biaya) = bukti "bukan fake demo".
- [ ] Kode rapi: TypeScript strict, zod schema untuk semua payload eksternal, error handling, README arsitektur + diagram.
- [ ] Tes kecil: skenario adversarial (injeksi prompt, hype) + 20–30 contoh kalibrasi threshold + hasilnya dicatat di repo.

### 4.4 Anti-diskualifikasi (wajib)
- [ ] Repo dibuat DALAM build period (sekarang), publik, tetap publik 90 hari.
- [ ] Tidak ada kode migrasi dari proyek lama (riset/benchmark boleh; kode produk harus baru).
- [ ] Tidak ada API key di repo — cek `.gitignore` + scan sebelum submit.
- [ ] Tidak ada eksekusi order; tidak ada output yang berbunyi rekomendasi beli/jual.
- [ ] Freeze setelah submit: tidak ada commit/push/edit setelah menekan submit.
- [ ] Semua anggota (solo: kamu) onboarding Sectors terverifikasi ✅ (kredit sudah cair).

---

## 5. Jadwal 9 hari (21–30 September, full-time)

| Hari | Tanggal | Target | Ukuran selesai |
|---|---|---|---|
| 1 | 21 Sep | Plan final + scaffold repo + verifikasi 2 API key + smoke test Sectors (≤5 kr) + smoke test Jev 1 call | 1 endpoint Sectors + 1 jawaban Jev nyata tercatat di log |
| 2 | 22 Sep | Sectors client + registry endpoint/biaya/window + cache + compute utils + halaman shell UI | Fetch BBCA report + broker-summary tampil di UI |
| 3 | 23 Sep | Pipeline agent v1 hero (guardrail→intent→planner→tools→compute→Jev→narasi→verify) | 1 rumor end-to-end keluar verdict nyata |
| 4 | 24 Sep | Verdict card + evidence table + audit trail + credit meter + memory tesis | 5 kasus nyata lolos (2 negatif, 1 positif, 1 dividen, 1 ticker salah) |
| 5 | 25 Sep | Dividen guard + komparator 4 bank | Keduanya jalan end-to-end |
| 6 | 26 Sep | Polish UI + error/empty states + memory lintas sesi + adversarial test | 10 tes adversarial lulus/tidak crash; sesi baru memuat memory |
| 7 | 27 Sep | README + diagram arsitektur + kalibrasi 20–30 contoh + rapikan repo + script & storyboard video | README siap dibaca juri; script video final |
| 8 | 28 Sep | Rekam teaser + video juri (2–3 take) + edit + upload; buat post sosial + thumbnail | 2 video terupload & bisa diakses |
| 9 | 29 Sep | QA akhir + isi form submission + submit portal | **SUBMITTED** (bukan besoknya) |
| 10 | 30 Sep | Buffer darurat saja. Kalau sudah submit: DIAM. Jangan sentuh repo. | Deadline 23:59 WIB |

---

## 6. Checklist material submission (semua wajib)

- [ ] **Link repo publik** (GitHub) — tetap publik ≥90 hari; tanpa API key.
- [ ] **Teaser 1 menit** — screen recording produk jalan, publik di YouTube/sosmed.
- [ ] **Video juri ≤3 menit** — masalah + audiens + alur inti end-to-end. YouTube publik/unlisted, Vimeo, Google Drive (share on), atau Loom.
- [ ] **Satu kalimat problem statement** — "INVESTIGRAPH membantu investor ritel Indonesia memverifikasi klaim/rumor saham dengan bukti data Sectors sebelum mereka mengambil keputusan."
- [ ] **Track 01 + nama peserta**.
- [ ] **Post sosial** di IG/LinkedIn/Threads/TikTok, tag akun resmi Sectors, pakai [template thumbnail](https://canva.link/mexgt4g89m17xln).
- [ ] Video & submission boleh Bahasa Indonesia — tidak ada penalti. Pakai Indonesia (audiensnya Indonesia).

---

## 7. Aturan disiplin selama build (agar tidak mati di tengah jalan)

1. **Kredit itu bahan bakar.** Target pemakaian: ≤150 kr untuk seluruh build & pengujian; sisakan ≥800 kr untuk demo/darurat. Setiap panggilan lewat registry yang mencatat biaya. Cache TTL agresif.
2. **Jev bukan oracle.** Semua angka & tanggal dihitung kode. Jev hanya menilai makna. Uji wording pertanyaan sebelum kalibrasi threshold (pelajaran riset §7.10–7.11).
3. **Cache untuk demo.** Semua respons Sectors & Jev disimpan; mode replay untuk latihan video; mode live untuk rekaman final.
4. **Satu alur hero selesai dulu, baru melebar.** Jangan sentuh fitur pendukung sebelum hero lolos 5 kasus.
5. **Jujur di README & video.** Sebutkan batasan (bandar = inferensi; tidak scraping sosmed; rentang window). Kejujuran = nilai plus juri, bukan kelemahan.
6. **Bahasa video = jujur, manusiawi, tanpa jargon.** Kalimat pendek. Tunjukkan, jangan ceramahi.

---

## 8. Kamus 5 menit (bekal kamu untuk paham & demo)

| Istilah | Arti sederhana | Kenapa penting untuk demo |
|---|---|---|
| Saham | Bukti kepemilikan kecil atas sebuah perusahaan | Harga naik-turun karena permintaan & penawaran |
| Bandar | Pemain besar dengan modal besar yang bisa menggerakkan harga | "Akumulasi" = mereka diam-diam membeli; "distribusi" = mereka menjual ke ritel yang telat masuk |
| Exit liquidity | Ritel yang membeli di puncak sehingga bandar bisa keluar | Ini yang kita cegah: "kamu berisiko jadi exit liquidity" |
| Pompom | Ajakan beli berlebihan tanpa data di Telegram/TikTok | Masukan utama yang diverifikasi produk kita |
| Dividen | Bagian laba yang dibagikan ke pemegang saham | "Yield 12%" terdengar hebat, tapi bisa jebakan (dividen trap) |
| Yield | Dividen ÷ harga saham (dalam %) | Yield tinggi belum tentu bagus — bisa karena labanya tidak berkelanjutan |
| PER / PBV | Ukuran mahal/murah saham | PER 4x terlihat murah, tapi bisa "value trap" saat siklus sedang puncak |
| Foreign flow | Arus beli/jual investor asing | Sering dijadikan klaim "asing masuk besar" — kita verifikasi dengan data |
| Laporan keuangan | Dokumen angka kinerja perusahaan (laba, utang, kas) | Sumber bukti saat memverifikasi klaim fundamental |
| Broker summary | Data beli/jual per broker sekuritas | Bukti untuk menilai klaim "bandar akumulasi" |

---

## 9. Kalimat kunci untuk video (draft)

- "84 dari 100 investor ritel membeli karena ikut-ikutan, bukan karena bukti."
- "Rumor tidak butuh modal. Bukti butuh data."
- "INVESTIGRAPH: tempel rumornya, lihat buktinya."
- "Kami tidak menyuruh beli atau jual. Kami menunjukkan apa yang data katakan — dan seberapa yakin kami."
- "Bandar itu inferensi, bukan fakta. Kami tunjukkan probabilitasnya, bukan ramalan."
- "Bukan rekomendasi investasi."

---

## 10. Definisi "nilai sempurna" versi kita (self-scoring sebelum submit)

| Kriteria | Target bukti |
|---|---|
| Usability 40% | Juri bisa ikut alur di video dan membayangkan dirinya memakai besok pagi; 0 crash; 2 edge case jujur |
| Video 30% | 3 menit tanpa dead air; masalah→demo→bukti→batasan; teaser 1 menit bikin penasaran |
| Teknis 30% | Audit trail nyata, registry biaya, citation check, memory lintas sesi, diagram arsitektur, tes tercatat |

> Catatan: dokumen ini rencana hidup. Setiap keputusan teknis baru yang mengubah arah wajib dicatat di sini.