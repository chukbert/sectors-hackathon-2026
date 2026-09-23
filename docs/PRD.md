# PRD — IDX Multi Agent Consulting Assistant (IDXMACA) untuk Pasar Modal Indonesia

> Track: **AI Agents & Assistants** — Sectors Hackathon 2026
> Melayani: **Grup A (Riset Investasi & Manajemen Aset) + Grup B (IB, Korporasi & Advisory) + Grup C (Kredit, Risiko & Kepatuhan)** — lihat `ICP.md`
> Status: PRD untuk build ~7 hari (submit maksimal 30 September 2026, 23:59 WIB)

## 1. Ringkasan Eksekutif

**Nama produk:** IDX Multi Agent Consulting Assistant (disingkat **IDXMACA**) — AI Analyst Desk untuk pasar modal Indonesia.

**Satu kalimat problem statement (untuk formulir submission):**
> IDXMACA membantu analis riset, banker, dan analis kredit mengubah pertanyaan Bahasa Indonesia menjadi memo analisis yang setiap angkanya terverifikasi dari data Sectors dalam hitungan menit, bukan jam.

**Apa yang dibangun:**
Agen AI multi-langkah dengan purpose-built UI yang menerima pertanyaan Bahasa Indonesia ("bandingkan BBCA, BMRI, BBRI kuartal terakhir + siapa yang akumulasi"), merencanakan dan mengeksekusi panggilan ke Sectors API/MCP secara otonom, menghitung rasio secara deterministik (bukan oleh LLM), memverifikasi setiap angka terhadap sumber data, lalu menghasilkan memo terstruktur dengan sitasi, tabel comps, grafik, dan export DOCX/XLSX/PDF.

**Kenapa satu produk bisa melayani A, B, dan C:**
Ketiga grup ini mengerjakan **pekerjaan yang strukturnya sama** — kumpulkan data emiten → hitung & bandingkan → tulis dokumen untuk pengambil keputusan — tetapi template dokumennya beda:
- A butuh: earnings flash, screener, flow check, snapshot pasar on-demand.
- B butuh: tabel comps, peer benchmark, preseden IPO, peta kepemilikan.
- C butuh: credit memo, early-warning scan, red-flag check, agregasi eksposur grup.
IDXMACA = **satu mesin agen + evidence ledger yang sama**, dengan **playbook (template + alur tool) berbeda per persona**. Ini memaksimalkan skor *real-world usability* (40%) karena satu demo melayani tiga pembeli, dan skor *technical depth* (30%) karena mesinnya bukan sekadar wrapper.

**Aturan track yang dipenuhi (bukan sekadar prompt di client lain):**
- Custom planner → executor → verifier → writer (orkestrasi milik sendiri).
- Custom tool-use pipeline: NL-to-`where` compiler untuk screener + pemilih section hemat kredit.
- Routing antar sumber data (fundamental vs broker flow vs berita vs tambang).
- Memory/state: memo sebelumnya, diff antar kuartal.
- Autonomous task execution: satu perintah menjalankan DAG 5–15 tool calls.
- Purpose-built UI untuk analis (bukan chat generik): panel rencana + estimasi kredit, tabel comps, evidence drawer.
- Sectors sebagai core: cabut Sectors, produk mati total (tidak ada data harga, fundamental, broker, filing, tambang).
- Tanpa eksekusi trading otomatis; ada disclaimer "bukan rekomendasi investasi" di setiap output.

## 2. Target Pengguna (dari ICP.md)

| Persona | Contoh jabatan | Contoh tempat kerja |
|---|---|---|
| A1 Analis riset sell-side | Equity Research Analyst | Mandiri Sekuritas, BRI Danareksa, Mirae Asset, Indo Premier, Trimegah |
| A2 Buy-side | Investment Analyst, Portfolio Manager | Schroders ID, Manulife AM, Mandiri Investasi, Batavia, BPJS TK, Taspen |
| A3 Quant/Trader/Sales | Quant, Dealer, Sales Trader | dealing room sekuritas, MI, prop desk |
| A4 RM/Wealth | RM Priority Banking | BCA Prioritas, Mandiri Prioritas, DBS Treasures |
| B1 Banker/Advisory | IB Analyst, Valuation Analyst (KJPP/Big 4), PE/VC Analyst | IB sekuritas, KJPP, EY/PwC/Deloitte/KPMG ID, Northstar, Saratoga, East Ventures |
| B2 Korporasi | CorpDev, IR Officer, CorpSec, FP&A, Konsultan strategi | emiten BEI, Astra, Telkom, MIND ID, McKinsey/BCG/Bain |
| C1 Kredit | Credit Analyst, Bond Analyst | BCA, Mandiri, BRI, BNI, Pefindo, Fitch Indonesia |
| C2 Risiko/Kepatuhan | Risk Manager, Compliance, Surveillance | bank, MI, sekuritas, OJK, BEI Divisi Pengawasan Transaksi |
| C3 Forensik/Audit | Forensic Accountant, Auditor | KAP Big 4, BPK/BPKP |

## 3. Masalah Nyata yang Diselesaikan (P-01 s.d. P-58)

Setiap masalah di bawah adalah masalah kerja harian yang nyata di pasar Indonesia. Kolom "dipakai IDXMACA" menjelaskan penyelesaiannya.

### 3A. Masalah Grup A — Riset, fund, trader (P-01–P-22)

- **P-01 Data IDX tersebar dan tidak programatik.** Harga di satu tempat, LK tahunan di situs IDX (PDF/XBRL), keterbukaan informasi di tempat lain, aksi korporasi di pengumuman terpisah. Analis membuka 5–10 tab untuk satu emiten. → IDXMACA menarik report, quarterly, corporate actions, filings, news lewat satu pertanyaan.
- **P-02 Screening 900+ emiten tidak bisa manual.** Filter "ROE > 15% dua tahun berturut-turut, DER < 1, yield > 4%" di Excel berarti download ratusan file. → NL screener + compiler ke query terstruktur.
- **P-03 Earnings season overload.** Ratusan emiten rilis LK dalam jendela yang sama; analis junior lembur hanya untuk memindahkan angka ke model. → playbook Earnings Flash: angka kuartal + tren 8 kuartal + valuasi vs histori otomatis.
- **P-04 Tidak tahu emiten mana yang sudah rilis.** Analis mengecek satu per satu. → endpoint latest-quarterly-dates universe untuk polling "siapa yang baru rilis minggu ini".
- **P-05 LLM generik halusinasi data saham Indonesia.** Chatbot umum mengarang P/E, target harga, bahkan ticker yang tidak ada, dan tidak paham istilah lokal (bandarmologi, ARA/ARB, UMA, cum-date). → grounding penuh + verifier numerik.
- **P-06 Bandarmologi manual dan melelahkan.** Mengecek broker summary per saham per hari, mencatat top buyer/seller di spreadsheet. → Flow Check: narasi akumulasi/distribusi per kohort (asing/domestik, ritel/institusi) + grafik.
- **P-07 Arus asing harus dipantau harian.** Sales trader butuh jawaban "asing beli/jual apa hari ini" sebelum market open. → foreign flow universe + top movers dalam panel pasar on-demand.
- **P-08 Morning note kejar tayang.** Riset harian harus jadi sebelum 08:00 dengan data kemarin sore. → **DI LUAR SCOPE** (monitoring terjadwal dihapus; analis menjalankan snapshot on-demand per emiten).
- **P-09 Cum-date dividen / rights issue terlewat.** Investor ritel dan RM sering tahu setelah ex-date. → corporate actions calendar + timeline cum/ex-date on-demand.
- **P-10 Efek dilusi rights issue/private placement sulit dihitung cepat.** → compute layer menghitung dampak jumlah saham beredar dan EPS terdilusi dari data aksi korporasi + ownership.
- **P-11 Insider filing tenggelam.** Transaksi direksi/pemegang saham besar di keterbukaan informasi tidak terpantau. → filings feed per emiten pilihan dengan ringkasan agen.
- **P-12 Suspensi mendadak = risiko likuiditas.** Saham disuspensi BEI (telat LK, UMA) tanpa warning; fund terjebak. → suspensions history + flag emiten yang telat lapor.
- **P-13 Free float kecil = susah keluar.** Aturan free float min 7,5% dan 300 pemegang saham; saham dengan float kecil gampang digoreng. → free float + konsentrasi pemegang saham di setiap memo.
- **P-14 Trauma isu transparansi free float (Jan 2026).** Kekhawatiran MSCI soal transparansi kepemilikan sempat mengguncang IHSG; fund butuh verifikasi float sendiri. → verifikasi float dari data shareholders, bukan klaim.
- **P-15 Valuation band manual.** Grafik P/E historis vs rata-rata 5 tahun dibuat manual per emiten. → compute + chart otomatis dari historical valuation.
- **P-16 Konsensus vs aktual tidak sebanding.** Estimasi analis tahunan vs realisasi kuartalan sulit dibandingkan apel-ke-apel. → modul forecast (future section) vs realisasi dengan catatan metodologi eksplisit.
- **P-17 Metrik bank butuh perlakuan khusus.** NIM, CASA, LDR, NPL, CKPN tidak ada di template umum. → screener/report sadar sektor (field perbankan) + template bank.
- **P-18 Junior menghabiskan 70% waktu untuk kumpul data.** Waktu analisis tersisa sedikit. → target: memo draft < 5 menit, analis fokus pada judgement.
- **P-19 RM priority banking butuh jawaban cepat dan patuh.** Nasabah tanya "BBCA vs BBRI buat dividen?" — RM butuh jawaban bilingual yang bukan rekomendasi. → mode RM: fakta + risiko, tanpa bahasa Buy/Sell, siap forward ke nasabah.
- **P-20 Sales trader butuh market color.** "Siapa yang jualan saham ini seminggu terakhir?" → broker top sellers + foreign share per hari.
- **P-21 Portofolio tidak dipantau overnight.** PM baru sadar ada filing/suspensi/anjlok setelah rugi. → diff memo antar kuartal on-demand (monitoring otomatis di luar scope).
- **P-22 Tidak ada memori cakupan.** Setiap kuartal analis mulai dari nol. → memory: snapshot memo per emiten per kuartal, diff otomatis.

### 3B. Masalah Grup B — IB, korporasi, advisory (P-23–P-36)

- **P-23 Tabel trading comps makan waktu berjam-jam.** Kumpulkan P/E, EV/EBITDA, P/BV, margin, growth untuk 5–10 peer dari sumber berbeda. → Comps Builder: usul peer set + tarik metrik seragam + median peer.
- **P-24 Pemilihan peer subjektif dan dipertanyakan klien.** "Kenapa peer-nya ini?" → peer dari klasifikasi sub-industri IDX + filter ukuran yang transparan dan bisa diedit.
- **P-25 Fairness opinion butuh sumber terdokumentasi.** Transaksi material/afiliasi (aturan OJK) wajib ada opini kewajaran dengan comps yang bisa diaudit. → setiap angka comps punya sitasi endpoint + tanggal tarik.
- **P-26 Pitch IPO butuh preseden listing.** "Sektor ini biasanya naik berapa setelah IPO?" → listing performance (7/30/90/365 hari) per sektor sebagai lampiran pitch.
- **P-27 Penentuan rentang harga IPO.** Butuh multiples peer + preseden + free float pasca-IPO. → paket data pitch otomatis.
- **P-28 Analisis dilusi dan struktur kepemilikan.** Rights issue, standby buyer, pengendali baru. → shareholders composition + corporate actions dalam satu tampilan.
- **P-29 Pemetaan konglomerasi untuk related-party/M&A.** "Emiten ini grup siapa, afiliasinya apa?" → affiliates + major shareholders + ownership tree (tambang) untuk screening target dan benturan kepentingan.
- **P-30 IR menyiapkan board pack tiap kuartal.** Kumpulkan kinerja vs peer, pergerakan saham, arus investor. → paket IR otomatis: kinerja, valuasi vs peer, flow asing/broker, filing insider.
- **P-31 IR tidak tahu siapa yang jual-beli sahamnya.** → broker summary + institutional flow atas ticker sendiri.
- **P-32 FP&A/konsultan butuh benchmark kompetitor cepat.** Margin, ROE, leverage vs kompetitor listed untuk proyek strategi. → subsector report + revenue segments.
- **P-33 Analisis segmen pendapatan manual.** Kontribusi per lini bisnis harus dibaca dari catatan LK. → revenue & cost segments siap grafik Sankey.
- **P-34 Data SGX/KLSE untuk pitch regional.** Perbandingan lintas bursa (IDX vs SGX vs KLSE) butuh format seragam. → report SGX/KLSE dalam format memo yang sama.
- **P-35 Dokumen pitch harus rapi dan bisa diedit.** Output chatbot tidak bisa langsung masuk deck. → export DOCX/XLSX dengan tabel comps mentah.
- **P-36 Junior IB lembur untuk pitch book.** Pekerjaan berulang tiap proyek. → template playbook yang bisa dipakai ulang per proyek/deal.

### 3C. Masalah Grup C — Kredit, risiko, kepatuhan (P-37–P-52)

- **P-37 Spreading LK manual untuk analisis kredit.** Memindahkan 5 tahun LK ke template + hitung DSCR, ICR, DER, current ratio. → credit memo: spread 5 tahun + tren rasio otomatis.
- **P-38 Monitoring covenant portofolio debitur.** Puluhan debitur, masing-masing dicek kuartalan. → early-warning scan daftar debitur on-demand per run.
- **P-39 Kasus Sritex (2024).** Tanda distress (ekuitas negatif, arus kas operasi, suspensi) terlihat jauh sebelum pailit tetapi tidak diagregasi. → rule engine menangkap ekuitas negatif + suspensi + insider jual sebagai skor bahaya.
- **P-40 Kasus Waskita/WIKA (restrukturisasi obligasi 2023).** Leverage dan likuiditas memburuk bertahap. → tren DER, current ratio, interest coverage multi-tahun dengan flag ambang.
- **P-41 Kasus Garuda (PKPU 2021–2022).** Ekuitas negatif dan arus kas minus. → aturan "ekuitas negatif" dan "OCF negatif saat laba positif" sebagai red flag kelas berat.
- **P-42 Saham sebagai agunan kredit.** Bank/multifinance terima saham sebagai jaminan tanpa ukuran likuiditas yang konsisten. → modul collateral: volume rata-rata, volatilitas, free float, riwayat suspensi → tier haircut yang dijelaskan.
- **P-43 Margin financing sekuritas.** Pilihan saham marginable dan haircut per saham harus dikaji berkala. → paket data likuiditas + konsentrasi + suspensi per saham.
- **P-44 Liquidity mismatch reksa dana/saham.** Fund pegang saham yang volume hariannya kecil relatif terhadap posisi. → rasio posisi vs ADV (average daily volume) dari most-traded/daily.
- **P-45 Deteksi goreng saham / UMA.** Lonjakan harga+volume tanpa fundamental, sering berakhir suspensi BEI. → gabungkan top movers + konsentrasi broker + suspensi history + filing insider menjelang berita.
- **P-46 Indikasi insider trading.** Broker tertentu akumulasi besar sebelum pengumuman. → korelasi broker concentration + filings + news timeline.
- **P-47 Batas regulasi MI (POJK).** Batas eksposur per emiten per reksa dana. → cek konsentrasi otomatis dari daftar pegangan.
- **P-48 BMPK bank (maks 25% modal untuk satu grup).** Eksposur harus diagregasi per grup/konglomerasi, bukan per PT. → agregasi eksposur via peta afiliasi/konglomerasi.
- **P-49 Earnings quality.** Laba naik tetapi OCF negatif, piutang meledak — tanda manipulasi. → aturan forensik + penjelasan LLM.
- **P-50 Keterlambatan laporan keuangan.** Telat LK = denda + suspensi; sinyal distress klasik. → deteksi dari latest-quarterly-dates universe ("siapa yang belum lapor").
- **P-51 Audit trail untuk komite kredit.** Setiap angka di memo kredit harus bisa ditelusuri ke sumber. → evidence ledger: angka → endpoint + parameter + timestamp.
- **P-52 Bahasa analis tidak konsisten.** Setiap analis menulis format berbeda; komite sulit bandingkan. → template memo kredit standar.

### 3D. Masalah lintas grup (P-53–P-58)

- **P-53 Terminal global mahal dan dangkal untuk Indonesia.** Bloomberg/Refinitiv/CapIQ mahal; cakupan emiten kecil-menengah IDX kurang dalam. → Sectors + IDXMACA sebagai lapisan analis murah di atas data lokal yang dalam.
- **P-54 Tidak ada data layer yang siap AI agent.** Portal ESDM Minerba, pengumuman IDX tidak terstruktur untuk LLM. → IDXMACA + Sectors (MCP/REST, NL screener) sebagai jembatan.
- **P-55 Data tambang tersebar di portal ESDM.** IUP/IUPK, lelang WIUP, kontrak, cadangan per provinsi tidak terstruktur. → playbook tambang: lisensi + lelang + produksi + harga komoditas + tujuan ekspor dalam satu memo (pembeda vs kompetitor).
- **P-56 Nama perusahaan vs ticker membingungkan.** "Bank BCA" vs BBCA, "Adaro" vs ADRO/ALAMTRI, bilingual ID/EN. → entity resolver (nama → ticker, toleran typo).
- **P-57 Output chatbot tidak bisa masuk kerja.** Tidak ada tabel mentah, sitasi, export. → tabel + XLSX + sitasi klik-terverifikasi.
- **P-58 Kepatuhan: dilarang memberi rekomendasi.** Aturan hackathon: produk informasi/analisis, bukan nasihat investasi. → verifier memblokir bahasa Buy/Sell/Hold + disclaimer otomatis.

## 4. Proposisi Nilai per Persona (Jobs-to-be-Done)

1. **Analis riset (A):** "Siapkan draft earnings flash 2 emiten + peer sebelum market open." → < 5 menit dari satu perintah.
2. **PM/RM (A):** "Jelaskan ke nasabah/komite kenapa saham X bergerak minggu ini, dengan data." → flow + news + valuasi dalam 1 halaman.
3. **Banker/KJPP (B):** "Buatkan tabel comps 6 peer + median untuk pitch/fairness opinion." → XLSX + sumber per sel.
4. **IR/CorpDev (B):** "Siapa yang akumulasi saham kami + bagaimana posisi vs peer kuartal ini?" → paket IR on-demand.
5. **Analis kredit (C):** "Spread 5 tahun + tren rasio + red flag untuk komite besok." → credit memo standar.
6. **Risk/Compliance (C):** "Scan 20 debitur: siapa yang memburuk kuartal ini?" → early-warning table + bukti.

## 5. Scope MVP (Realistis 7 Hari)

**P0 — wajib jadi dan didemokan:**
1. Mesin agen: router → planner (estimasi kredit via `lookup` Store + approval) → executor paralel via Store Service → compute deterministik → verifier → writer → export. Taksonomi output: `INTENT-OUTPUT.md` (38 intent IO-01–IO-38). Kontrak cache: `STORE.md`.
2. Playbook 1 "Earnings & Company Memo" (A + fondasi C): ticker → quarterly + report sections hemat + news + corporate actions + filings → memo 1–2 halaman + grafik. (IO-01,02,03,04,05,10,25,26,28)
3. Playbook 2 "Comps Builder" (B + A): deskripsi natural → peer set → tabel comps + median + export XLSX. (IO-08,11,15)
4. Playbook 3 "Credit & Red-Flag Memo" (C): ticker/portofolio kecil → spread + rasio + rule-based flags + narasi. (IO-03,07,10,14,21,24,25,26,27,38)
5. NL screener sebagai sub-tool (compiler NL → `where` terstruktur; fallback `q` hanya bila perlu). (IO-11; ranking IO-12,13)
6. Flow Check sebagai sub-tool (broker top + foreign flow + narasi). (IO-21,24; pendalaman IO-22,23)
7. Evidence drawer: tiap angka bisa diklik → sumber endpoint + waktu tarik.
8. Disclaimer otomatis + filter bahasa rekomendasi.

**P1 — jika sempat (menaikkan skor usability):**
9. Diff memo antar kuartal (on-demand via memory; tanpa monitoring terjadwal).
10. Ownership map sederhana (major shareholders + affiliates + konglomerasi).
11. Playbook tambang (lisensi + produksi + harga + ekspor) — pembeda unik.
12. Mode RM (bilingual, fakta-vs-risiko, siap forward).

**P2 — di luar lomba (tulis di roadmap):** alert real-time, scheduled pipeline, backtest, multi-bahasa penuh, mobile.

**Yang eksplisit TIDAK dibuat:** eksekusi order (dilarang), prediksi harga sebagai janji return, penasihat otomatis tanpa manusia.

## 6. Arsitektur Agen

```
Query (ID/EN)
  → Intent Router (persona + playbook + horizon; petakan query ke DAG intent-output `INTENT-OUTPUT.md` §2)
  → Entity Resolver (nama → ticker IDX/SGX/KLSE; validasi 404 = 1 kredit, hindari)
  → Planner (DAG tool calls + estimasi kredit via `POST /v1/store/lookup` + tunjukkan ke user → Approve)
  → Executor (paralel via Store Service — kontrak cache wajib: `STORE.md`, retry 503, clamp broker 14 hari & idx 90 hari)
  → Compute deterministik (Python: YoY, CAGR, margin, ROE/ROA, DSCR/ICR, median peer, z-score, ADV)
  → Evidence Ledger {nilai → endpoint, param, timestamp, raw}
  → Verifier (cek angka vs ledger; blokir Buy/Sell/Hold; tambah disclaimer)
  → Writer (memo ID/EN + tabel + chart spec)
  → Renderer (UI + DOCX/XLSX/PDF)
  → Memory (snapshot per ticker/kuartal; diff berikutnya)
```

**Kenapa lolos bar track AI Agents:**
- Planner milik sendiri (bukan prompt di Claude/ChatGPT + MCP).
- NL-to-`where` compiler dengan whitelist field screener + validasi lokal (400 terstruktur = gratis, jadi salah validasi tidak bayar).
- Compute di luar LLM (LLM hanya narasi; angka dari kode).
- Verifier independen yang bisa menolak draft.
- State/memory antar sesi.

## 7. Katalog Tool → Endpoint Sectors (inti)

| Kebutuhan | Endpoint | Catatan kredit (dari docs v2) |
|---|---|---|
| Screening hemat | `GET /v2/companies/` terstruktur | 1 kredit; NL `q` = 3 kredit → pakai hanya sbg fallback |
| Profil + valuasi + peer | `GET /v2/company/report/{symbol}/?sections=` | 1 kredit/section; JANGAN default 8 sekaligus — pilih overview, valuation, financials, peers, ownership, dividend sesuai playbook |
| Kuartalan | quarterly financials + quarterly dates | cek dates dulu agar `report_date` valid |
| Harga & pasar | daily, full-universe close, index daily, idx market cap, top movers, most traded, IPO performance | perhatikan clamp rentang (mis. idx 90 hari, broker 14 hari) |
| Flow | broker summary/top per symbol, activity/top per broker, broker registry, top brokers, foreign flow universe/by-symbol | narasi per kohort dari registry |
| Event | corporate actions (+calendar), shareholders, filings, suspensions, news | filings/suspensi = bahan red flag |
| Sektor | subsector report, revenue segments, helper lists (subsector/industry/tags) | untuk peer set & benchmark |
| Tambang | mining companies/detail/financials/ownership/performance, sites, produksi, resources/reserves, harga komoditas, ekspor, sales destination, kontrak, lisensi, lelang | playbook pembeda |
| Regional | SGX/KLSE screener + report | format memo sama |

**Strategi hemat 1.000 kredit tim:**
mengikuti kontrak `STORE.md` (read-through cache, kunci kanonis, TTL, single-flight); estimasi-di-muka via `lookup` + approval user; fixture JSON saat dev UI agar tidak boros; satu memo penuh ditarget ≤ 25–35 kredit (mis. 3 emiten × sections pilihan + quarterly + flow + filings + news, bukan full-report semua); bulk universe endpoint untuk scan banyak emiten sekaligus.

## 8. Anti-HalusinasI & Kepatuhan

1. Angka hanya dari compute/ledger; LLM dilarang menghitung di kepala.
2. Setiap angka di memo punya sitasi klik → endpoint + parameter + timestamp.
3. Verifier menolak draft bila ada angka tanpa sumber, atau ada bahasa rekomendasi ("beli", "jual", "target price X, buy").
4. Disclaimer di setiap output: "Alat informasi dan analisis, bukan rekomendasi investasi. Verifikasi ke sumber primer (IDX/KI) sebelum keputusan."
5. Tidak ada koneksi broker/eksekusi order dalam bentuk apa pun.

## 9. UX (Purpose-Built, Bukan Chat Generik)

- Kolom kiri: input + pilihan persona/playbook + daftar emiten.
- Kolom tengah: memo terstruktur (Ringkasan → Kinerja → Valuasi vs histori & peer → Dividen → Kepemilikan & Flow → Event & Risiko), tabel comps, grafik.
- Kolom kanan: **Rencana agen** (DAG + estimasi kredit + Approve), **Evidence drawer**, **Diff vs kuartal lalu**.
- Aksi: Export DOCX/XLSX/PDF, salin tabel, mode RM (1-pager), mode komite kredit.
- Bahasa: toggle ID/EN; input campuran ("bandingkan BBCA sama BMRI, siapa yang diakumulasi asing?") tetap dipahami.

## 10. Alur Demo (untuk video judging 3 menit)

1. **Hook (20 dtk):** analis ketik satu kalimat → memo 3 bank + comps + red flag dalam ±2 menit. (pola query Q1, `INTENT-OUTPUT.md` §9)
2. **A-playbook (50 dtk):** earnings flash 1 emiten: tren kuartal, valuasi vs histori, insider + flow.
3. **B-playbook (50 dtk):** comps builder 6 peer + median + export XLSX; tunjukkan sitasi per sel.
4. **C-playbook (40 dtk):** credit memo + early-warning scan 10 debitur; sorot 1 emiten dengan ekuitas negatif/suspensi.
5. **Trust (20 dtk):** klik angka → evidence; verifier menolak bahasa rekomendasi; disclaimer.
6. **Tutup:** arsitektur + peta kredit + "cabut Sectors = produk mati".

## 11. Metrik Keberhasilan & Eval

- Time-to-draft memo: manual ~2–4 jam → target < 5 menit.
- Traceability: 100% angka material tersitasi (diukur otomatis oleh verifier).
- Kredit per memo: target ≤ 30 (diukur + ditampilkan).
- Eval harness: 20 pertanyaan baku (ID/EN, typo ticker, emiten suspend, tambang, SGX) → skor: jawaban benar, angka cocok ledger, tanpa bahasa rekomendasi. Target lolos 90%+.
- Uji halusinasi: minta data ticker fiktif → harus menolak + menyarankan resolver, bukan mengarang.

## 12. Rencana Build 7 Hari

- H1: repo (dibuat dalam periode build), skeleton API+UI, Store Service (`STORE.md`), koneksi Sectors + fixture; kunci taksonomi intent (`INTENT-OUTPUT.md` §2).
- H2: NL-to-where compiler + Earnings Memo + compute rasio.
- H3: Comps Builder + XLSX export + evidence drawer.
- H4: Credit/Red-flag + flow check + verifier.
- H5: memory/diff + polish UI + disclaimer.
- H6: eval harness + hemat kredit + video teaser + README.
- H7: judging video 3 menit + submission portal + freeze repo (tanpa commit setelah submit, kecuali rotasi kredensial bocor).

## 13. Risiko & Mitigasi

- Kredit habis saat dev → fixture + cache + estimasi; dev UI tanpa panggil API.
- Halusinasi angka → compute deterministik + verifier; LLM hanya narasi.
- Data kosong (emiten kecil/tambang) → empty-state jujur + saran alternatif, bukan karangan.
- Scope creep 3 persona → satu mesin, tiga template; P1/P2 dicatat sebagai roadmap.
- Video lemah (bobot 30%) → skrip di §10, screen recording nyata, narasi masalah→audiens→workflow.

## 14. Kenapa Ini Menang

- **Usability 40%:** menyelesaikan 57 dari 58 masalah nyata A+B+C (P-08 di luar scope) dengan workflow yang bisa dipakai hari ini (memo, comps, credit scan + export).
- **Video 30%:** satu cerita "satu pertanyaan → tiga meja (riset, deal, kredit)" yang mudah difilmkan dan dimengerti juri.
- **Technical 30%:** planner+compiler+compute+verifier+memory+evidence di atas Sectors MCP/REST; penggunaan endpoint dalam (screener terstruktur, sections hemat, broker/foreign flow, filings/suspensi, tambang) membuktikan kedalaman, bukan satu call hiasan. Terstruktur sebagai 38 intent-output (`INTENT-OUTPUT.md`) di atas Store read-through (`STORE.md`).
