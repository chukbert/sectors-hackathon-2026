# CREDITS — Akuntansi Kredit Sectors IDXMACA

Sumber tunggal kebenaran saldo kredit adalah **portal hackathon** (team page). Dokumen ini
menjelaskan bagaimana IDXMACA mengestimasi, mencatat, dan membatasi pemakaian kredit —
sekaligus pemetaan endpoint internal → path resmi Sectors v2.

## 1. Hukum biaya (docs Sectors v2, changelog "Billing standardization")

| Respons | Biaya |
|---|---|
| `2xx` | Biaya endpoint (1/2/3 kredit, lihat tabel §3) |
| `404` (resource tidak ada tapi query jalan) | 1 kredit |
| `400`, `401/403`, `429`, `5xx` | 0 kredit |
| `400` screener `?q=` (gagal setelah query terkirim ke LLM) | 1 kredit (sunk cost) |
| Screener structured (`where`/`order_by`) | 1 kredit |
| Screener natural-language `?q=` sukses | 3 kredit |

## 2. Cara IDXMACA menghitung

1. **Pra-approve (gratis)** — `POST /v1/store/lookup` memakai `credit_cost()` tanpa memanggil
   Sectors. Plan card menampilkan `est_credits_live` per node + total; `over_budget` bila
   total > `IDXMACA_MAX_CREDITS_PER_RUN` (default 60).
2. **Saat fetch (mode live)** — biaya dihitung dari status + **respons**: kuartal yang
   dikembalikan, halaman (`ceil(limit/30)`), emiten per 100 (free-float), tipe aksi korporasi,
   kombinasi klasifikasi×periode, jumlah section. Untuk respons non-2xx berlaku tabel §1.
3. **Hit cache = 0 kredit**; `credits_saved` hanya menghitung hit atas entri yang aslinya live.
4. **Fail-closed** — endpoint internal yang belum punya padanan path resmi (lihat §4)
   tidak dikirim ke Sectors saat live; Store mengembalikan status 501 `live_route_unavailable`
   dengan 0 kredit supaya tidak ada 404 yang tetap berbiaya.
5. **Chip "sisa"** — `sisa = IDXMACA_CREDIT_START − credits_spent`. `IDXMACA_CREDIT_START`
   diisi manual dari portal (bukan hasil API; Sectors tidak menyediakan endpoint saldo).
   Angka ini hanya mencakup panggilan **lewat IDXMACA**, bukan pemakaian key yang sama oleh
   anggota tim lain.

## 3. Tabel biaya resmi per endpoint

| Endpoint resmi | Biaya kredit |
|---|---|
| `/v2/broker-activity/{broker_code}/` | 1 |
| `/v2/broker-activity/{broker_code}/top/` | 2 |
| `/v2/broker-summary/{symbol}/` | 1 |
| `/v2/broker-summary/{symbol}/top/` | 2 |
| `/v2/brokers/` | 1 |
| `/v2/brokers/top/` | 2 |
| `/v2/close/` | 1 /halaman. The full ~950-ticker universe is ~32 pages at the maximum `limit` of 30 (~32 credits per full pull) |
| `/v2/companies/` | 1 for structured queries. Using the natural-language `?q=` parameter costs 3s |
| `/v2/companies/list_companies_with_segments/` | 1 |
| `/v2/companies/quarterly-financial-dates/` | 1 /halaman. The full universe is ~32 pages at the maximum `limit` of 30 (~32 credits per full sweep). Use `since` to poll incrementally for far fewer credits |
| `/v2/companies/top-changes/` | 1 /klasifikasi × period combination. Default behavior (2 classifications × 5 periods) consumes 10 credits |
| `/v2/company/corporate-actions/{symbol}/` | 1 |
| `/v2/company/get-segments/{symbol}/` | 1 |
| `/v2/company/get_quarterly_financial_dates/{symbol}/` | 1 |
| `/v2/company/report/{symbol}/` | 1 /section. Default behavior (all 8 sections) consumes 8 credits |
| `/v2/company/shareholders-composition/{symbol}/` | 1 |
| `/v2/corporate-actions/` | 1 /tipe. Default (all 7 types) consumes 7 credits |
| `/v2/daily/{symbol}/` | 1 |
| `/v2/filings/` | 1 |
| `/v2/financials/quarterly/{symbol}/` | 1 /kuartal |
| `/v2/foreign-flow/` | 1 /halaman. The full universe (typically 550-700 tickers with foreign activity on the day) is about 20-25 pages at the maximum `limit` of 30 |
| `/v2/foreign-flow/{symbol}/` | 1 |
| `/v2/free-float/` | 1 /100 emiten |
| `/v2/idx-total/` | 1 |
| `/v2/index-daily/` | 1 |
| `/v2/index-daily/{index_code}/` | 1 |
| `/v2/industries/` | 1 |
| `/v2/klse/companies/` | 1 |
| `/v2/klse/companies/top/` | 1 /klasifikasi. Default behavior (all 5 classifications) consumes 5 credits |
| `/v2/klse/company/report/{symbol}/` | 1 /section. Default behavior (all 4 sections) consumes 4 credits |
| `/v2/klse/sectors/` | 1 |
| `/v2/listing-performance/{symbol}/` | 1 |
| `/v2/mining/commodities/` | 1 |
| `/v2/mining/commodities/{commodity_name}/price/` | 1 |
| `/v2/mining/companies/` | 1 |
| `/v2/mining/companies/financials/{slug}/` | 1 |
| `/v2/mining/companies/ownership/{slug}/` | 1 |
| `/v2/mining/companies/performance/{slug}/` | 1 |
| `/v2/mining/companies/{slug}/` | 1 |
| `/v2/mining/contracts/` | 1 |
| `/v2/mining/exports/` | 1 |
| `/v2/mining/global-commodity/` | 1 |
| `/v2/mining/license-auctions/` | 1 |
| `/v2/mining/license-auctions/{wiup_code}/` | 1 |
| `/v2/mining/licenses/` | 1 |
| `/v2/mining/resources-reserves/` | 1 |
| `/v2/mining/resources-reserves/{province}/` | 1 |
| `/v2/mining/sales-destination/{slug}/` | 1 |
| `/v2/mining/sites/` | 1 |
| `/v2/mining/sites/{slug}/` | 1 |
| `/v2/mining/total-production/` | 1 |
| `/v2/most-traded/` | 2 |
| `/v2/news/` | 1 |
| `/v2/sgx/buybacks/` | 1 |
| `/v2/sgx/close/` | 1 /halaman. The full universe (roughly 560-600 tickers) is about 20 pages at the maximum `limit` of 30 (~20 credits per full pull) |
| `/v2/sgx/companies/` | 1 for structured queries. Using the natural-language `?q=` parameter costs 3s |
| `/v2/sgx/companies/top/` | 1 /klasifikasi. Default behavior (all 5 classifications) consumes 5 credits |
| `/v2/sgx/company/report/{symbol}/` | 1 /section. Default behavior (all 4 sections) consumes 4 credits |
| `/v2/sgx/daily/{symbol}/` | 1 |
| `/v2/sgx/filings/` | 1 |
| `/v2/sgx/news/` | 1 |
| `/v2/sgx/sectors/` | 1 |
| `/v2/sgx/short-sell/` | 1 |
| `/v2/sgx/subsectors/` | 1 |
| `/v2/sgx/tags/` | 1 |
| `/v2/subindustries/` | 1 |
| `/v2/subsector/report/{sub_sector}/` | 1 /section. Default behavior (all 6 sections) consumes 6 credits |
| `/v2/subsectors/` | 1 |
| `/v2/suspensions/` | 1 |
| `/v2/tags/` | 1 |

## 4. Pemetaan endpoint internal → path live

Fixture memakai path kanonis internal. Saat live, Store menerjemahkan
(`apps/store/app/live_routes.py`) dan **menolak** yang tak dikenal.

| Internal (kanonis) | Path live Sectors | Biaya |
|---|---|---|
| `/v2/company/report/{symbol}` | `/v2/company/report/{symbol}/` | 1/section (8 default) |
| `/v2/company/report/{symbol}/quarterly` | `/v2/financials/quarterly/{symbol}/` (`n_quarters`) | 1/kuartal |
| `/v2/company/quarterly-dates` | `/v2/companies/quarterly-financial-dates/` (limit) | 1/halaman |
| `/v2/company/report/{symbol}/quarterly-dates` | `/v2/company/get_quarterly_financial_dates/{symbol}/` | 1 |
| `/v2/companies` (screener) | `/v2/companies/` | 1 (3 bila `?q=`) |
| `/v2/companies/free-float` | `/v2/free-float/` | 1/100 emiten |
| `/v2/universe/close` | `/v2/close/` (limit ≤30/halaman) | 1/halaman |
| `/v2/company/daily/{symbol}`, `/v2/companies/daily/{symbol}` | `/v2/daily/{symbol}/` | 1 |
| `/v2/index/daily?symbol=IHSG` | `/v2/index-daily/IHSG/` | 1 |
| `/v2/idx/market-cap` | `/v2/idx-total/` | 1 |
| `/v2/movers/top` (type/period 1 kombinasi) | `/v2/companies/top-changes/` | 1/kombinasi |
| `/v2/movers/most-traded` | `/v2/most-traded/` | 2 |
| `/v2/broker/summary/{symbol}` | `/v2/broker-summary/{symbol}/` | 1 |
| `/v2/broker/top-buyers/{symbol}`, `/v2/broker/top-sellers/{symbol}` | `/v2/broker-summary/{symbol}/top/` | 2 |
| `/v2/broker/registry` | `/v2/brokers/` | 1 |
| `/v2/broker/top` | `/v2/brokers/top/` | 2 |
| `/v2/broker/activity/{broker}` | `/v2/broker-activity/{broker_code}/` | 1 |
| `/v2/foreign-flow/{symbol}` | `/v2/foreign-flow/{symbol}/` | 1 |
| `/v2/company/corporate-actions/{symbol}` | `/v2/company/corporate-actions/{symbol}/` | 1 |
| `/v2/corporate-actions/calendar` (`types`) | `/v2/corporate-actions/` (`type`) | 1/tipe (7 default) |
| `/v2/filings/{symbol}` | `/v2/filings/?symbol=` | 1 |
| `/v2/suspensions/{symbol}` | `/v2/suspensions/?symbol=` | 1 |
| `/v2/news/{symbol}` | `/v2/news/?symbols=` | 1 |
| `/v2/subsector/report/{slug}` (sections) | `/v2/subsector/report/{sub_sector}/` | 1/section (6 default) |
| `/v2/helpers/subsectors` (+industries/subindustries/tags) | `/v2/subsectors/` dst. | 1 |
| `/v2/sgx/company/report/{symbol}` (sections) | sama | 1/section (4 default) |
| `/v2/sgx/short-sell`, `buybacks`, `filings`, `news` | sama | 1 |
| `/v2/commodities` | `/v2/mining/commodities/` | 1 |
| `/v2/mining/auctions` | `/v2/mining/license-auctions/` | 1 |
| Mining per emiten (`/v2/mining/{symbol}/...`) | — (butuh slug; belum dipetakan) | gagal-tertutup |
| `/v2/ipo/performance` | — (live `listing-performance` per simbol) | gagal-tertutup |

Catatan efisiensi yang sudah diterapkan di katalog:

- IPO `n_quarters: 8` (IO-03/IO-04) — dibagi pakai antar intent lewat cache.
- IO-10 memakai universe 1 halaman + tanggal per emiten scope (bukan sapuan 32 halaman).
- IO-17 memakai screener `order_by=market_cap desc&limit=200` = **1 kredit**, menggantikan
  `close` universe yang ~32 kredit; heatmap dihitung dari top 200 market cap.
- IO-12/13 memakai screener terurut (1 kredit per query), bukan endpoint ranking fiktif.
- IO-25 kalender memakai 2 tipe (dividend + upcoming_dividend) = 2 kredit, bukan 7 default.
- IO-29/IO-35 meminta section eksplisit.