# TEST & API COVERAGE PLAN — Berapa tembakan ke Sectors?

> Menjawab: **kalau semua kasus diujikan, berapa endpoint/call/kredit yang ditembakkan?**
> Basis: docs.sectors.app v2 (diverifikasi 21 Sep 2026) + verifikasi live riset (19 Sep).
> Aturan billing resmi: **2xx = biaya endpoint · 404 = 1 kr · 400 = gratis** (kecuali `q=` screener yang gagal setelah LLM = 1 kr) **· 401/403/429/5xx = gratis · hasil kosong (200) tetap ditagih.**

---

## 1. Jawaban singkat (TL;DR)

| Program | Cakupan | Kredit |
|---|---|---|
| **Sweep endpoint** (1 call minimal per endpoint) | **54/54 endpoint IDX + Mining = 100%** | **≈ 61 kr** |
| **Mastery suite** (13 domain × 3 kasus = 39 kasus) | Semua domain, termasuk yang tidak tersentuh kasus normal | **≈ 210 kr** (termasuk sweep) |
| **Level suite** (10 level × 3 kasus = 30 kasus, cache panas) | 10/10 level | **+ 60–90 kr** |
| Kalibrasi Jev + adversarial + variasi window | — | **+ 30–50 kr** |
| **TOTAL PROGRAM UJI** | 54/54 endpoint · 13/13 domain · 10/10 level | **≈ 300–350 kr** |
| Dev harian (Hari 2–7 di luar suite) | — | 50–100 kr |
| Latihan & rekaman video (cache replay + live spot-check) | — | 20–40 kr |
| **Semua terpakai sebelum submit** | — | **≈ 370–490 kr** |
| **Sisa buffer dari 1.000** | — | **≥ 510 kr** |

Kesimpulan: **coverage 100% itu murah.** Yang mahal bukan jumlah endpoint, tapi **kombinasi** (simbol × window × kuartal × tipe). Itulah yang diatur disiplin uji di §6.

---

## 2. Definisi coverage

| Cakupan | Jumlah | Status |
|---|---|---|
| Endpoint IDX + Mining (docs v2) | **54** | target **54/54 = 100%** |
| SGX (12) + KLSE (4) | 16 | **dipotong sadar** — produk IDX; disebut jujur di README |
| Total dokumentasi v2 (opsional, kalau mau klaim penuh) | 70 | +≈16 kr sekali sweep — tidak prioritas |

Coverage untuk juri bukan cuma %endpoint, tapi 3 lapis: **endpoint 54/54 · domain 13/13 · level 10/10**, semua dengan bukti di `MASTERY.md` (timestamp + endpoint + biaya + hasil).

---

## 3. Sweep 54 endpoint — rincian biaya

**IDX (35 endpoint) ≈ 42 kr**

| Keluarga | Endpoint (call minimal) | Kr |
|---|---|---|
| Screener | companies `where` (1) + companies `q` uji mode NL (3) | 4 |
| Helper | subsectors, industries, subindustries, tags | 4 |
| Segmen | companies-segments-list, company-segments | 2 |
| Kalender | company-quarterly-dates, latest-quarterly-dates | 2 |
| Report | company-report 1 section | 1 |
| Report sektor | sector-report 1 section | 1 |
| Fundamental | quarterly-financials 1 kuartal | 1 |
| Kepemilikan | shareholders-composition | 1 |
| Free float | free-float | 1 |
| Aksi korporasi | corporate-actions per-simbol + calendar 1 tipe | 2 |
| Harga | daily (1 simbol), close universe (1 halaman) | 2 |
| Indeks | idx-total, index-daily, index-daily-universe | 3 |
| Ranking | top-changes 1×1, most-traded (2 kr) | 3 |
| IPO | listing-performance | 1 |
| Berita | news, filings, suspensions | 3 |
| Broker | broker-summary (1), broker-summary-top (2), broker-activity (1), broker-activity-top (2), brokers/top (2), broker-registry (1) | 9 |
| Foreign flow | foreign-flow universe (1 halaman) + per-simbol | 2 |
| **Total IDX** | **35 endpoint** | **≈ 42** |

**Mining (19 endpoint) ≈ 19 kr** — semua ~1 kr: companies (+detail, financials, ownership, performance), commodities (+price, export-destination, global-commodity, sales-destination), resources-reserves (+detail), sites (+detail), commodity-production, contracts, license-auctions (+detail), licenses.

**Total sweep = 54 endpoint ≈ 61 kr.**

Biaya terverifikasi docs (21 Sep): broker-summary 1 · broker-activity 1 · foreign-flow per-simbol 1 · company-report 1/section · corporate-actions 1/tipe · screener 1 terstruktur / 3 NL · billing 404=1, 400=0.
Terverifikasi live riset (19 Sep): top-changes 1/kombinasi · most-traded 2 · idx-total 1 · index-daily 1 (kode salah = 400 gratis) · mining 1 · broker-*-top 2 · brokers/top 2 · foreign-flow universe 1/halaman.
Estimasi (dikunci di registry Hari 1–2): free-float, news, filings, suspensions, shareholders-composition, sector-report, listing-performance, mining detail — diasumsikan 1.

---

## 4. Fire count per level (pemakaian user nyata)

| L | Endpoint unik | Call | Kredit dingin | Catatan |
|---|---|---|---|---|
| 1 | 1 | 0–1 | 0–1 | cache-first |
| 2 | 1–2 | 1–2 | 0–2 | |
| 3 | 2–3 | 2–4 | 2–4 | |
| 4 | 3–4 | 3–8 | 3–7 | quarterly borongan |
| 5 | 5–8 | 6–14 | 6–12 | report sections ×N |
| 6 | 8–12 | 10–20 | 8–16 | quarterly 8Q mahal |
| 7 | 10–14 | 12–22 | 10–18 | report + broker + flow |
| 8 | 12–18 | 15–26 | 12–22 | keluarga broker |
| 9 | 15–22 | 20–35 | 15–28 | + mining/komoditas |
| 10 | 25–35 | 35–60 | 25–50 (cap 70) | bertahap per fase |

Produk menyentuh **±30–35 dari 54 endpoint** pada kasus normal. Long-tail (auction-detail, site-detail, resources-detail, ownership tree, global-commodity, export-destination, share universe penuh, index-daily-universe, dll.) disentuh oleh kasus khusus + sweep — cukup 1× demi coverage.

L10 contoh (3 kandidat, fase 2): screener 1 + 3×(report 5 sections=5 + quarterly 4Q=4 + dividend 1) = 31 + broker/flow 3×3=9 + kalender 2 ≈ **43 kr** → di dalam cap 70. Bertahap: fase 1 = 2–4, fase 2 = 10–25, fase 3 = 8–20.

---

## 5. Program uji (fase)

| Fase | Isi | Kredit |
|---|---|---|
| 0 | **Sweep 54/54** — 1 call minimal per endpoint, semua di-cache; validasi simbol/slug dulu agar tidak kena 404 (1 kr) | 61 |
| 1 | **Mastery suite 39 kasus** (13 domain × 3: mudah/tipikal/adversarial) — incremental di atas cache sweep | +130–170 |
| 2 | **Level suite 30 kasus** (10 level × 3) — sebagian besar reuse cache | +60–90 |
| 3 | Kalibrasi Jev (0 kr Sectors), adversarial tambahan, variasi window terpilih | +30–50 |
| — | **Total** | **≈ 290–340** |

Set simbol tetap untuk dedupe cache: **BBCA** (bank besar), **BBRI/BMRI** (bank), **TLKM** (telco), **ITMG/ADRO** (mining), **GOTO** (rugi beruntun), 1 small-cap illiquid, 1 emiten IPO baru, **IHSG/LQ45** (indeks). Semua kasus memakai kolam ini → cache panas.

---

## 6. Disiplin anti-ledakan biaya (aturan uji)

1. **Variasi dipilih, bukan semua.** Report: hanya section relevan per domain (bukan 8/8 tiap kasus). top-changes: 2 periode (1d, 30d) dari 10 kombinasi. Corporate-actions: 3 dari 7 tipe. Quarterly: 4–8 kuartal hanya untuk kasus fundamental/dividen.
2. **Universe feed** (close, foreign-flow, latest-dates): 1 halaman untuk uji. Full pagination (≈32 halaman) **tidak dijalankan** — bukan kebutuhan produk.
3. **404 itu biaya 1 kr** → validasi simbol/slug dari cache registry sebelum tembak; `400` gratis → parameter buruk tidak apa-apa, simbol salah tidak.
4. **Empty 200 tetap ditagih** → cek ketersediaan (segments-list, commodities list, dll.) sebelum menarik data dalam.
5. **Cache adalah aset uji.** Semua respons sweep disimpan di **API Hit Store** ([`API-HIT-STORE.md`](./API-HIT-STORE.md)) dengan TTL: harga/flow harian, fundamental per rilis kuartal, broker per hari bursa, window historis immutable. Suite dijalankan `REPLAY=1` (0 kr); `LIVE=1` hanya untuk run bukti final + rekaman.
6. **Sebelum tembak >6 kr: tampilkan rencana.** Itu juga yang dilihat juri di video.

---

## 7. Yang dikunci Hari 1–2

- Registry endpoint: path + biaya (dari docs) + window maks + parameter + TTL cache → ganti semua "estimasi" di dokumen ini dengan angka pasti.
- Ledger kredit dari panggilan nyata pertama (sweep mini 5–10 endpoint) sebagai smoke test mapping payload.
- Validasi kolam simbol uji: pastikan ada data untuk bank/mining/rugi/small-cap/IPO (hindari 404 beruntun).