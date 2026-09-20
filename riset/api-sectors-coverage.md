# API Coverage Audit — ARUS vs docs.sectors.app (v2)

> Metode: **docs-only crawl** (llms.txt + halaman API reference + OpenAPI). **Nol panggilan API.**
> Revisi 2 (19 Sep 2026): koreksi path/biaya dari crawl mendalam. **Temuan inti: batasan ARUS = gap implementasi ARUS,
> bukan batasan API.** Dengan SECTORS_API_KEY yang sama, semua endpoint di bawah bisa diakses.
> Revisi 3 (19 Sep 2026): **P0-Fundamental selesai** — screener + filter sektor (helper slug) + 8/8 report section
> reachable + quarterly financials + revenue segments. Endpoint terpakai 14 → 20.
> Revisi 4 (19 Sep 2026): **v7 + P0-Ranking/Pasar + P1-Mining inti** — top-changes, most-traded, idx-total, daftar
> `mining/commodities/`, `mining/licenses/` (IUP), `mining/contracts/`. Endpoint terpakai 20 → **26** (≈48%).
> Revisi 5 (19 Sep 2026): **verifikasi LIVE endpoint baru** (10kr dari 1.000, ledger di kartu) — shapecocok docs:
> top-changes/most-traded/idx-total/commodities ✓; **daftar komoditas live = 18 item (logam + coal grades), CPO/agri TIDAK ada**
> → pesan "tidak ditemukan di daftar" ARUS terbukti benar; licenses per emiten operator ✓ (PTBA 7 IUP); ADRO (holding) 0
> baris lisensi/kontrak = wajar, data ada di level operator.

> Revisi 6 (19 Sep 2026): **bug indeks diperbaiki** — `index-daily` memakai kode **lowercase** (`ihsg`, `lq45`, `idx30`, …)
> dan responsnya **array `{index_code,date,price}`**, bukan `{data:[{close}]}`. Kode lama `IDXCOMPOSITE` → **400 gratis**
> (bukan 404) sehingga tidak masuk ledger dan kartu bilang "0 call Sectors". Verified live: `ihsg` → 42 baris,
> IHSG 6.462,43 (17 Sep). Ledger kini mencatat upaya gagal (`HTTP 400/404/429/5xx`, jaringan) walau 0kr, dan **404
> ditagih 1kr sesuai docs**.

## Ringkasan

| | Jumlah |
|---|---|
| Endpoint IDX + Mining di docs v2 | **54** |
| Dipakai ARUS (`lib/evidence.ts`) | **26** (≈48%) |
| Grup fitur belum tersentuh | **SGX, KLSE** (dipotong sadar: ARUS asisten IDX; label jujur di README) |
| SGX (7) + KLSE (4) | di luar cakupan ARUS |

Cakupan saat ini: daily, broker-summary, brokers(registry), broker-activity, foreign-flow(per simbol), filings, news,
suspensions, corporate-actions (market-wide), company/report (**8/8 section**), index-daily (multi-kode), **idx-total**,
mining price (generik, diverifikasi `mining/commodities/`), sales-destination, performance, screener + filter sektor,
helper slug (subsectors/industries/subindustries), financials/quarterly, company/get-segments,
**top-changes**, **most-traded**, **mining/licenses (IUP)**, **mining/contracts (owner↔kontraktor)**.

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

## Verifikasi live (19 Sep 2026 — 10kr dari 1.000)

| Endpoint | Hasil live | Biaya |
|---|---|---|
| `/companies/top-changes/?classifications=top_gainers&periods=1d` | ✓ shape docs; `price_change` desimal | 1kr |
| `/most-traded/?start…&end…` | ✓ keyed by date; volume desc | 2kr |
| `/idx-total/` | ✓ 21 baris untuk 30 hari (hari bursa) | 1kr |
| `/mining/commodities/` | ✓ 18 item — **tanpa CPO/agri** (logam + Coal HBA 1–3) | 1kr |
| `/mining/licenses/?company=pt-bukit-asam-tbk` | ✓ 7 IUP, fields persis docs | 1kr |
| `/mining/licenses/?company=pt-alamtri-resources-indonesia-tbk` (ADRO) | ✓ 200 kosong — holding, lisensi di operator | 1kr |
| `/mining/contracts/?mine_owner=…` | ✓ 200 kosong (sama, level operator) | 1kr |
| `/index-daily/ihsg/` | ✓ 42 baris; IHSG 6.462,43 (17 Sep) — array `{index_code,date,price}` | 1kr |
| Chat live `top gainer hari ini apa?` (compiler LLM + narrator) | ✓ intents `pasar`, 1kr, kartu ranking | 1kr |

Catatan: smoke chat kedua (`komoditas CPO gimana?`) → jawaban jujur "tidak ditemukan di daftar" (0kr, list dari cache) —
sesuai temuan live bahwa CPO memang tidak ada di database harga Sectors. **Klaim lama v6 "di Sectors data CPO ADA" terbukti keliru**;
pesan v7 tidak lagi menyiratkan itu.

## Status per grup (path v2 asli)

### Screener & helper — ✅ (screener inti ✅, helper slug ✅ dipakai; tags ⏳)
- `GET /v2/companies/` — `where`/`order_by` (desc = awalan `-`, mis. `-market_cap`; **param `desc` ditolak API 400**)/
  `limit`(≤200)/`offset`/`include_query_values`; `q` (NL) menimpa semua.
  **Taksonomi screener = slug persis** (`sub_sector = 'banks'`, `industry = 'agricultural-products'` untuk perkebunan/sawit —
  terverifikasi live 20 Sep: 56 emiten, AALI/TAPG/DSNG dkk). **Field `roe`/`pb`/`pe`/`der` polos ditolak 400** — pakai
  `_ttm`/`_mrq` (`roe_ttm`, `pb_mrq`, `yield_ttm`) atau kurung tahun `roe[2024]`/`revenue[Q2-2025]`.
  `like '%Plantation%'` lolos 200 tapi 0 baris → `applySectorTermFilter()` (planner) memetakan kata sektor ID → slug kanonik.
  Operator `= != > >= < <= like in`, `and`/`or`, `field[YYYY]`, `field[Qi-YYYY]` (44 field kuartalan), aritmetika.
  **`where` menolak field telanjang `roe`/`pb`/`pe` (400 INVALID_WHERE_CLAUSE — "requires bracket notation");**
  pakai snapshot `roe_ttm`/`pb_mrq`/`pe_ttm`/`yield_ttm` atau ber-year `roe[2024]`. `repairScreenerWhere` menormalisasi otomatis.
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

### Ranking & discovery — ✅ inti (listing-performance ⏳)
- `GET /v2/companies/top-changes/` — ✅ dipakai (1 klasifikasi × 1 periode = 1kr): `top_gainers`/`top_losers` × `1d…365d`;
  `price_change` desimal. Intent `pasar` (deteksi ranking deterministik + field `ranking` dari compiler).
- `GET /v2/most-traded/` — ✅ dipakai (2kr): `start`/`end`, `n_stock`; respons keyed by date.
- `GET /v2/listing-performance/{symbol}/` — ⏳ belum (kandidat nominal kecil; API tersedia).

### Pasar & indeks — ◐ (IHSG + multi-kode + idx-total ✅)
- `GET /v2/idx-total/` — ✅ dipakai (1kr): market cap total IDX, 90hr.
- `GET /v2/index-daily/{index_code}/` — ✅ **verified live**: kode lowercase (`ihsg`,`lq45`,`idx30`,`idxbumn20`,
  `idxhidiv20`,`kompas100`,`jii70`,`sminfra18`,`srikehati`,`idxg30/q30/v30`,`idxesgl`,`economic30`,`ftse`,`sti`,`idxvesta28`);
  respons **array** `{index_code,date,price}`. Kode tidak valid → **400 gratis** ("Please provide a valid index code").
- `GET /v2/index-daily/` (semua indeks 1 hari) & `GET /v2/close/` (universe) — ⏳ belum (hemat kredit; bukan gap API).

### Broker — ◐
- `GET /v2/broker-summary/{symbol}/top/` — top buyers/sellers + share; filter `cohort/origin/foreign`, `n_brokers`; 2kr (≤90hr).
- `GET /v2/broker-activity/{code}/top/` — akumulasi/distribusi per broker; 2kr (≤90hr).
- `GET /v2/brokers/top/` — ranking broker harian (`metric=gross|net`, origin/cohort/foreign); 2kr.
- Catatan: `/broker-summary/{sym}` & `/broker-activity/{code}` di ARUS dibatasi 14 hari — endpoint top mendukung 90 hari.

### Mining extension — ◐ 6/19
Tersedia & belum dipakai: `mining/companies` (+detail/financials USD/ownership), `mining/exports`,
`mining/global-commodity`, `mining/total-production`, `mining/sites` (+detail), `mining/resources-reserves(+detail)`,
`mining/license-auctions(+detail)`.
Sudah dipakai: `mining/commodities/{slug}/price` ✅ **generik** (kata → kandidat slug → verifikasi `mining/commodities/`),
`mining/commodities/` (daftar) ✅, `mining/sales-destination` ✅, `mining/companies/performance` ✅,
`mining/licenses/` ✅ (IUP/IUPK + expiry + CNC → flag risiko perpanjangan), `mining/contracts/` ✅ (owner↔kontraktor →
edge `contractor` di chain).

## Lubang yang melanggar janji kejujuran
1. ~~"IUP belum dipetakan"~~ → ✅ **selesai**: `mining/licenses/` dipakai di intent `barang` (flag izin <12bln).
2. ~~Blacklist CPO/emas~~ → ✅ **selesai**: komoditas generik diverifikasi ke `mining/commodities/`; hardcode coal/nikel hanya
   jalur cepat untuk 2 slug itu (nol tebakan slug).
3. ~~Fundamental (PE/PB/ROE/laba) nol~~ → ✅ selesai (screener + report).
4. ~~"Sektor X gimana" mustahil~~ → ✅ filter sektor via helper slug; sector-report per subsektor ⏳ (gap terbuka).
5. Budget 6kr/sesi tetap **self-imposed** (tim punya 1.000 kredit); diatur `SECTORS_BUDGET` env.

## Rencana paket (disetujui, dikerjakan berurutan)
| Paket | Isi | Status |
|---|---|---|
| P0-Fundamental | screener, helper slug, report sections, quarterly, segments | ✅ selesai |
| P0-Ranking | top-changes, most-traded, listing-performance | ✅ inti (listing ⏳) |
| P0-Pasar/Sektor | idx-total, index-daily multi-kode, index universe, sector report | ◐ idx-total + multi-kode ✅; universe & sector-report ⏳ |
| P1-Broker/Mining | broker top lists, commodities generik, licenses, contracts, production, sites, resources, exports/global | ◐ commodities/licenses/contracts ✅; broker-top & sites/resources/export ⏳ |
| P2-Multi-market | SGX/KLSE |  dipotong sadar (asisten IDX; dinyatakan di README) |

Aturan tetap: LLM tidak menghitung; angka screener = sitasi `companies/?where=…`; live gagal → "data tidak tersedia".