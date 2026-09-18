# API Coverage Audit — ARUS vs docs.sectors.app (v2)

> Metode: **docs-only crawl** (llms.txt + halaman API reference + OpenAPI). **Nol panggilan API.**
> Revisi 2 (19 Sep 2026): koreksi path/biaya dari crawl mendalam. **Temuan inti: batasan ARUS = gap implementasi ARUS,
> bukan batasan API.** Dengan SECTORS_API_KEY yang sama, semua endpoint di bawah bisa diakses.
> Revisi 3 (19 Sep 2026): **P0-Fundamental selesai** — screener + filter sektor (helper slug) + 8/8 report section
> reachable + quarterly financials + revenue segments. Endpoint terpakai 14 → 20.

## Ringkasan

| | Jumlah |
|---|---|
| Endpoint IDX + Mining di docs v2 | **54** |
| Dipakai ARUS (`lib/evidence.ts`) | **20** (≈37%) |
| Grup fitur belum tersentuh | **Ranking, SGX, KLSE** (sisanya sudah parsial/penuh) |
| SGX (7) + KLSE (4) | di luar cakupan ARUS (asisten IDX) |

Cakupan saat ini: daily, broker-summary, brokers(registry), broker-activity, foreign-flow(per simbol), filings, news,
suspensions, corporate-actions (market-wide), company/report (**8/8 section**: dividend+ownership lama;
overview/valuation/future/peers/financials/management via intent `fundamental`), index-daily (IDXCOMPOSITE),
mining price (coal/nikel), sales-destination, performance, **screener `where/order_by/include_query_values` + filter
sektor**, **helper slug (subsectors/industries/subindustries — tags ⏳)**, **financials/quarterly (n_quarters)**,
**company/get-segments**.

## Koreksi penting vs draf pertama

- `ranking/top-tickers` & `ranking/top-growth` **tidak ada di v2** (404; v1-only). Padanan v2: **screener**
  `order_by=-yield_ttm`, `-market_cap`, `-roe`, dst.
- Path tepat: `/v2/idx-total/`, `/v2/listing-performance/{symbol}/`, `/v2/brokers/top/`,
  `/v2/financials/quarterly/{symbol}/`, `/v2/company/get-segments/{symbol}/`,
  `/v2/company/get_quarterly_financial_dates/{symbol}/`.
- Biaya (docs): screener struktur 1kr / NL `q` 3kr · most-traded 2kr · top-changes 1kr per (klasifikasi×periode) —
  default 2×5 = 10kr · broker-summary/top & broker-activity/top 2kr · brokers/top 2kr · report **1kr per section**
  (semua 8 = 8kr) · quarterly financials **1kr per kuartal** · close & foreign-flow universe **1kr per halaman**
  (limit max 30 → ±32 halaman untuk 950 ticker) · mining rata-rata 1kr.

## Status per grup (path v2 asli)

### Screener & helper — ✅ (screener inti ✅, helper slug ✅ dipakai; tags ⏳)
- `GET /v2/companies/` — `where`/`order_by`/`desc`/`limit`(≤200)/`offset`/`include_query_values`; `q` (NL) menimpa semua.
  Operator `= != > >= < <= like in`, `and`/`or`, `field[YYYY]`, `field[Qi-YYYY]` (44 field kuartalan), aritmetika.
  Respons: `results[]` (row: `symbol`,`company_name`,`query_values?`), `pagination`, `llm_translation`.
- `GET /v2/subsectors/`, `/v2/industries/`, `/v2/subindustries/`, `/v2/tags/` — slug resolver (1kr).
  ARUS memakai 3 pertama untuk memetakan kata sektor → `sub_sector`/`sector`/`industry` (kata tak dikenal = filter
  tidak dipasang, bukan menebak); `tags` belum dipakai.
- `GET /v2/companies/list_companies_with_segments/`, `/v2/companies/quarterly-financial-dates/` (universe, paginasi),
  `/v2/company/get_quarterly_financial_dates/{symbol}/` — belum dipakai (segmen & jadwal per simbol sudah cukup).

### Fundamental & laporan — ✅ (via intent `fundamental`)
- `GET /v2/company/report/{symbol}/?sections=` — enum lengkap: **`overview, valuation, future, peers, financials,
  dividend, management, ownership`** (1kr/section). **8/8 section kini reachable** oleh ARUS.
- `GET /v2/financials/quarterly/{symbol}/` — param `report_date`, `approx`, `n_quarters`; array `QuarterlyFinancialItem`
  (40 field; field bank ekstra di `financials_sector_metrics`); 1kr/kuartal. Dipakai mode `kinerja` (5 kuartal).
- `GET /v2/company/get-segments/{symbol}/?financial_year=` — **Sankey-ready** (`revenue_breakdown[]`: value, source, target).
  Dipakai mode `segmen`; porsi dihitung ARUS dari nilai yang dikembalikan (dilabeli).
- `GET /v2/company/shareholders-composition/` — komposisi pemegang saham. Belum dipakai (ownership §report sudah ada).
- `GET /v2/sector-report/…` (subsector report, per section) — **belum ada intent sektor** (P0-Pasar/Sektor).

### Ranking & discovery — ❌
- `GET /v2/companies/top-changes/` — `sub_sector`, `n_stock`(≤10), `classifications` (top_gainers|top_losers),
  `periods` (1d|7d|14d|30d|365d), `min_mcap_billion`; `price_change` = desimal (0.25=+25%).
- `GET /v2/most-traded/` — `start`/`end`(≤90hr, default 30hr), `sub_sector`, `adjusted`, `n_stock`(≤10); 2kr.
- `GET /v2/listing-performance/{symbol}/` — `chg_7d/30d/90d/365d` + jadwal book building/offering, `prospectus_url`; 1kr.

### Pasar & indeks — ◐ (hanya IHSG)
- `GET /v2/idx-total/` — market cap total IDX (≤90hr, ≥2021-01-01); 1kr.
- `GET /v2/index-daily/{index_code}/` — kode: ihsg, lq45, idx30, idxbumn20, idxhidiv20, kompas100, jii70, sminfra18, dll.
- `GET /v2/index-daily/` — semua indeks 1 hari; `GET /v2/close/` — semua ticker 1 hari (1kr/halaman).
- `GET /v2/foreign-flow/` — universe asing 1 hari (1kr/halaman).

### Broker — ◐
- `GET /v2/broker-summary/{symbol}/top/` — top buyers/sellers + share; filter `cohort/origin/foreign`, `n_brokers`; 2kr (≤90hr).
- `GET /v2/broker-activity/{code}/top/` — akumulasi/distribusi per broker; 2kr (≤90hr).
- `GET /v2/brokers/top/` — ranking broker harian (`metric=gross|net`, origin/cohort/foreign); 2kr.
- Catatan: `/broker-summary/{sym}` & `/broker-activity/{code}` di ARUS dibatasi 14 hari — endpoint top mendukung 90 hari.

### Mining extension — ◐ 4/19
Tersedia & belum dipakai: `mining/companies` (+detail/financials USD/ownership), `mining/commodities` (daftar SEMUA
komoditas), `mining/commodities/{slug}/price` (3 thn; ARUS hardcode coal/nikel → **ini akar keluhan "hanya coal/nikel"**),
`mining/exports`, `mining/global-commodity`, `mining/total-production` (nasional + YoY), `mining/sites` (+detail:
resources/reserves, lat/long), `mining/resources-reserves(+detail)`, `mining/licenses` (**IUP/IUPK + expiry + CNC**),
`mining/contracts` (owner↔kontraktor), `mining/license-auctions(+detail)`.

## Lubang yang melanggar janji kejujuran
1. ~~"IUP belum dipetakan"~~ → sekarang berlabel "gap implementasi ARUS" (endpoint ADA). Harus diimplementasikan (P1).
2. ~~Blacklist CPO/emas~~ → akarnya `commodityFor()` hardcode coal/nikel + `COAL_SYMBOLS/NICKEL_SYMBOLS`; `mining/commodities`
   menyediakan daftar lengkap. Pesan "belum didukung" tidak boleh menyiratkan batasan API.
3. Fundamental (PE/PB/ROE/laba) nol — padahal bisa 1kr lewat screener.
4. "Sektor X gimana" mustahil — tidak ada helper slug + sector report.
5. Budget 6kr/sesi adalah **self-imposed** (tim punya 1.000 kredit); kini bisa diatur `SECTORS_BUDGET` env.

## Rencana paket (disetujui, dikerjakan berurutan)
| Paket | Isi | Status |
|---|---|---|
| P0-Fundamental | screener (`where/order_by/include_query_values`), helper slug, report sections lengkap, quarterly financials, segments |  screener ✅ · sisanya ⏳ |
| P0-Ranking | top-changes, most-traded, listing-performance | ⏳ |
| P0-Pasar/Sektor | idx-total, index-daily multi-kode, index universe, sector report | ⏳ |
| P1-Broker/Mining | broker top lists, commodities generik, licenses, contracts, production, sites, resources, exports/global | ⏳ |
| P2-Multi-market | SGX/KLSE | ⏳ |

Aturan tetap: LLM tidak menghitung; angka screener = sitasi `companies/?where=…`; live gagal → "data tidak tersedia".