# Pain Points Investor/Trader Ritel Indonesia — Teratasi oleh Sectors API

> Tanggal: 2026-09-18
> Track: AI Agents & Assistants — Sectors Hackathon 2026
> Sumber API: https://docs.sectors.app (Financial API v2)
> ICP: investor / trader individual Indonesia
> Aturan: Sectors MCP/REST wajib jadi core data source. Automated trade execution dilarang.
> Catatan: dokumen ini produk informasi/analisis, bukan rekomendasi investasi.

## 1. Konteks ICP (ringkas)

- Total investor pasar modal: **30,27 juta SID per 7 Agu 2026** (+9,9 juta YtD, +48,78%), terdiri dari **saham 10,05 juta, reksa dana 29,02 juta, SBN 1,58 juta** (KSEI/BEI).
- Akun aset digital/crypto: **22,93 juta per Jul 2026** (OJK).
- Yang aktif transaksi hanya **~1-1,4 juta/bulan**. 40%+ SID dorman (<2 transaksi/12 bulan).
- Ritel menyumbang **51,1% nilai transaksi Jul 2026** (vs asing 35,8%).
- Demografi: **54,12% investor saham <30 tahun, 57,4% pegawai**, 64,44% di Jawa.
- Gap literasi: inklusi 18-25 th **89,96%** vs literasi **73,22%** (SNLIK 2025). Literasi nasional 2022 **49,68%**.
- Dampak: **72% konsumen aset digital rugi**, 72% pemula 2021-2023 rugi >30%, <15% kuasai fundamental.

## 2. 14 Pain Points LOLOS (core solution = Sectors API)

### PP-01 — Tenggelam di 900+ emiten, screening manual 2 jam tiap pagi
- Sakitnya: mau cari saham sesuai modal kecil + profil risiko harus buka ratusan chart. Screener existing cuma tabel angka tanpa penjelasan.
- Endpoint: `GET /v2/companies/` — mode `?q=` natural language (3 kredit) atau `where=` + `order_by=` terstruktur (1 kredit).
- Contoh: `q="bank dividen yield >5% PBV <1.5"` atau `where=yield_ttm>0.05 and pb_mrq<1.5 and roe_ttm>0.1`
- Field kunci: `pe_ttm, pb_mrq, roe_ttm, yield_ttm, payout_ratio, esg_score, intrinsic_value, indices, tags`
- Butuh agent karena: routing q vs where untuk hemat kredit, validasi slug via helper `subsectors/industries`, + menjelaskan kenapa lolos.

### PP-02 — Tidak paham istilah LK (EBITDA, liabilitas, arus kas operasi)
- Sakitnya: LK ditulis untuk institusi. Riset kualitatif: 3 istilah di atas paling membingungkan, ritel akhirnya skip LK dan percaya TikTok.
- Endpoint: `GET /v2/company/quarterly-financials/{symbol}/` + `GET /v2/company/report/{symbol}/?sections=financials` + helper `GET /v2/company/quarterly-dates/{symbol}/`
- Butuh agent karena: Sectors supply angka akurat (anti-halusinasi), LLM menerjemahkan ke bahasa sederhana + visual tren. Tanpa Sectors, LLM ngarang angka.

### PP-03 — Laporan tahunan 200-300 halaman tidak kebaca (57% investor = karyawan)
- Sakitnya: tidak ada waktu baca AR + LK kuartalan 4 emiten sekaligus.
- Endpoint: `GET /v2/company/report/{symbol}/?sections=overview,financials,management,ownership` + `GET /v2/company/segments/{symbol}/` (Sankey revenue/cost) + cek ketersediaan via `GET /v2/companies-segments-list/`
- Hemat kredit: minta `sections=` spesifik, jangan default all 8 (8 kredit).
- Butuh agent karena: multi-step ringkas + sitasi angka + bandingkan QoQ/YoY.

### PP-04 — Tidak bisa bandingkan 3-5 emiten se-sektor apple-to-apple
- Contoh: BBCA vs BBRI vs BMRI vs BBNI (NIM, CASA, NPL, valuasi).
- Endpoint: `GET /v2/company/report/{symbol}/?sections=valuation,financials,peers,future` + `GET /v2/subsector/report/{subsector}/` + `GET /v2/companies/`
- `valuation` sudah berisi `pe/pb/ps/pcf/peg + pe_peer_avg/pb_peer_avg + intrinsic_value + forward_pe`. `peers` + `future` (forecast EPS + analyst rating buy/hold/sell).
- Butuh agent karena: contoh persis syarat track — planning → eksekusi 4 report → normalisasi → sintesis. Tidak bisa selesai 1 call.

### PP-05 — Tidak bisa bedakan murah vs value trap siklikal
- Contoh: PER 4x batubara terlihat murah padahal puncak siklus.
- Endpoint: `quarterly-financials` + `GET /v2/mining/commodities-trade/commodity-price?commodity_name=coal&start_year=2023&end_year=2026` (monthly, max 3 tahun) + `mining-companies-financials` + `mining-companies-performance` (volume produksi/penjualan, strip ratio, reserves)
- Butuh agent karena: join 2 domain (equity + komoditas) yang tidak ada di satu app pun.

### PP-06 — Dividen trap yield 12%
- Sakitnya: tergiur yield, tidak cek payout dari laba recurring atau sekali jual aset.
- Endpoint: `report sections=dividend` (history, yield_ttm, payout_ratio, cash_payout_ratio, last_ex_date) + `GET /v2/corporate-actions/` + `screener where=yield_ttm>0.08 and payout_ratio>0.8`
- Butuh agent karena: cek 5 tahun dividen + laba + FCF, flag payout >80% + cash payout >100%.

### PP-07 — Buta valuasi wajar versi ritel
- Maunya: "PBV 2.1x sekarang vs histori vs peers artinya apa?"
- Endpoint: `report sections=valuation,overview` — `last_close_price vs intrinsic_value, historical_valuation by year, forward_pe, 52w_low/high, all_time_high`
- Butuh agent karena: translasi angka ke narasi + konteks histori + peer avg.

### PP-08 — Beli karena pompom, bukan tesis (84,6% herding)
- Sakitnya: beli karena nama yang dibicarakan, beli di pucuk, jadi exit liquidity.
- Endpoint (verifier): `report + quarterly-financials + foreign-flow + broker-summary-top + most-traded + top-changes` — user paste rumor/ticker, agent verifikasi dengan data.
- Sectors tidak scraping TikTok/Telegram — input rumor dari user, verifikasi pakai Sectors.
- Butuh agent karena: tool-use pipeline + devil's advocate, bukan sekadar chat.

### PP-09 — Tidak punya second opinion sebelum klik BUY
- Contoh: "mau beli saham gorengan ini, yakin? free float 12%, rugi 3 kuartal, volume anomali 10x?"
- Endpoint: sama seperti PP-08 + `GET /v2/free-float/` + `GET /v2/suspensions/?symbol=`
- Butuh agent karena: orkestrasi 5 tool + memory tesis awal + wajib disclaimer (bukan financial advice, sesuai code of conduct).

### PP-10 — Tidak bisa verifikasi klaim "bandar akumulasi / foreign masuk besar"
- Endpoint Badarmologi (paling kuat di Sectors):
  - `GET /v2/broker-summary/{symbol}/?start=&end=` (max 14 hari, per-broker buy/sell/net lot/val/freq + split foreign/domestic `f_*`)
  - `GET /v2/broker-summary-top/{symbol}/` (top buyers/sellers)
  - `GET /v2/broker-activity/{broker_code}/` + `broker-activity-top`
  - `GET /v2/brokers/top/?origin=foreign&cohort=institutional`
  - `GET /v2/foreign-flow/{symbol}/` + `GET /v2/foreign-flow/` (universe harian)
  - `GET /v2/shareholders/{symbol}/` (monthly by kategori) + `GET /v2/broker-registry/`
- Butuh agent karena: gabungkan broker net + foreign_share + konsentrasi top buyer dalam 1 verdict.

### PP-11 — Nyangkut di saham illiquid / gorengan, tidak bisa keluar saat panic
- Endpoint: `GET /v2/free-float/` + `GET /v2/daily/{symbol}/` (close/volume/market cap, max 90 hari) + `GET /v2/most-traded/` + `GET /v2/suspensions/` + `shareholders`
- MSCI juga soroti keterbatasan transparansi struktur kepemilikan BEI — endpoint ini menjawab langsung.
- Butuh agent karena: flag free float <15% + volume sepi + riwayat suspensi sebelum user masuk.

### PP-12 — Ketinggalan earnings, ex-date dividen, RUPS, rights issue, stock split
- Sakitnya: karyawan tidak pantau jam bursa 08:45-15:15. Lewat cum-date sehari = hilang yield setahun. Bingung dilusi rights issue.
- Endpoint:
  - `GET /v2/latest-quarterly-dates/` (satu call untuk semua emiten, untuk freshness polling)
  - `GET /v2/corporate-actions/?type=dividend,upcoming_dividend,right_issue,stock_split,agm&start=&end=` (end bisa future = kalender, max 90 hari, minta type spesifik jangan all 7 = 7 kredit)
  - `GET /v2/filings/` (insider buy/sell) + `GET /v2/news/` + `GET /v2/suspensions/`
- Butuh agent karena: autonomous watcher + jelaskan dampak (ex-date, cum-date, recording, payment, rasio split/rights) bahasa sederhana.

### PP-13 — Buta rotasi sektoral & foreign flow (tahu dari berita besoknya)
- Endpoint: `foreign-flow universe` (sort net IDR/hari) + `brokers/top` + `most-traded` + `top-changes?classifications=top_gainers&periods=7d,30d` + `index/daily/{index_code}` + `subsector/report`
- Butuh agent karena: pre-open/after-close briefing otomatis untuk watchlist user. Autonomous task execution.

### PP-14 — Bingung IPO: prospektus 300 halaman, layak ikut atau tidak?
- Endpoint: `GET /v2/listing-performance/{symbol}/` (7/30/90/365d since listing) + `report + quarterly-financials/dates + corporate-actions`
- Butuh agent karena: rangkum valuasi vs peers + kinerja IPO sejenis + penggunaan dana dalam 3 menit.

## 3. Yang TIDAK diambil sebagai core (agar lolos eligibility)

- Partial (Sectors hanya kaki satu, butuh data luar): makro BI-rate/USDIDR/inflasi (Sectors cuma punya idx-total, index-daily, commodity-price, news), trading plan presisi (daily cuma close/volume/market cap, tanpa open/high/low), filter syariah eksplisit (cuma ada esg_score/indices/tags), multi-asset crypto (Sectors nol crypto), onboarding dormant.
- Gugur (tanpa endpoint, gagal syarat "Sectors as core"): fee/pajak overtrading, verifikasi bodong/lisensi influencer, jurnal/memory profil risiko (itu memori agent, bukan data), scalp intraday 08:45/orderbook/RSI realtime.

## 4. Implikasi build (hemat 1.000 kredit tim)

- Selalu pakai `sections=` dan `type=` spesifik. Default report all = 8 kredit, calendar all = 7 kredit, screener `q=` = 3 kredit vs `where=` = 1 kredit.
- Broker window max 14 hari, daily/foreign per-symbol max 90 hari, calendar max 90 hari. Desain agent polling, bukan full scan tiap chat.
- Prioritas demo 3 menit: PP-10 verifier → PP-06 dividen → PP-04 comparator.
