# STORE — Sectors Call Store (Cache Wajib IDXMACA)

> **Hukum wajib:** tidak ada agen yang boleh menembak Sectors API langsung.
> Setiap request **wajib mampir ke Store dulu**: cek apakah (endpoint + params persis) pernah ditembakkan.
> Pernah → ambil dari Store (0 kredit). Belum → Store yang menembak ke Sectors, hasilnya **langsung disimpan**, baru dikembalikan ke agen.

## 1. Arsitektur

```
Agent 1..N ──► Store Service ──► api.sectors.app
                  │ SQLite (dev) / Postgres (prod)
                  │ API key Sectors HANYA hidup di Store Service
```

- Agen memegang **Store client**, bukan API key Sectors. Key hanya di-mount sebagai env di Store Service.
  Aturan ini ditegakkan secara struktural (bukan imbauan): tanpa key, agen memang tidak bisa bypass.
- Pola akses = **read-through**: agen cukup panggil `fetch`, Store yang memutuskan hit vs tembak.

## 2. API Store Service

| Method & path | Fungsi |
|---|---|
| `POST /v1/store/fetch` `{endpoint, params}` | Jalur utama: kembalikan data (dari Store bila hit, dari Sectors + simpan bila miss) |
| `POST /v1/store/lookup` `{endpoint, params}` | Cek kering (dry-run, tanpa tembak): `{hit: true/false, fetched_at, expires_at}` — dipakai planner untuk estimasi kredit |
| `POST /v1/store/invalidate` `{endpoint?, params?, older_than?}` | Bust cache per kunci / pola / umur |
| `GET /v1/store/stats` | Hit rate, kredit hemat vs terpakai, top-miss keys (untuk eval & demo) |

Respons `fetch` selalu membawa provenans:
`{data, source: "store-hit" | "sectors-live", fetched_at, credits_spent: 0 | N, cache_key}` —
provenans ini diteruskan ke evidence ledger IDXMACA (tiap angka memo tahu ia dari cache jam berapa atau live).

## 3. Kunci kanonis (agar "persis" benar-benar persis)

`cache_key = SHA256(METHOD + "|" + path_norm + "|" + params_norm)` dengan normalisasi:
- path lowercase tanpa trailing slash; `symbol`/slug uppercase (`bbca` = `BBCA` = `BBCA.JK` → `BBCA`).
- query params di-sort by key; alias disatukan (`sections=a,b` = `sections=b,a`).
- tanggal ke format ISO `YYYY-MM-DD`; validasi clamp **sebelum** lookup (broker ≤14 hari, IDX ≤90 hari) agar request invalid tidak pernah jadi key sampah.
- API key / auth header **tidak ikut** key.

## 4. TTL per jenis data (hemat tanpa basi)

| Data | TTL | Alasan |
|---|---|---|
| Helper list (subsektor, industri, tags, broker registry) | 7 hari | Hampir statis |
| Company report sections, subsector report | 24 jam | Berubah harian (harga di dalamnya) |
| Quarterly financials + dates | Sampai ada `report_date` baru (cek via Latest Quarterly Dates) | LK lampau imutabel |
| Daily/close/index/foreign-flow/most-traded/movers | Sampai bursa tutup berikutnya (EOD) | Snapshot harian |
| Corporate actions calendar, filings, suspensions, news | Append-only + `since` (gabung, bukan timpa) | Event tidak berubah, hanya bertambah |
| Screener terstruktur | 24 jam | Hasil stabil harian |
| Mining (lisensi, lelang, cadangan) | 7 hari (lelang aktif: 24 jam) | Jarang berubah kecuali lelang berjalan |

## 5. Negative caching (404 = 1 kredit, jangan bayar dua kali)

- `404` (ticker/slug tidak ada) **tetap disimpan** dengan TTL pendek (6 jam) — lookup salah yang diulang tidak membakar kredit lagi.
- `400/401/403/429/5xx` tidak disimpan (gratis / bisa berubah); `429` memicu backoff + antrean, bukan retry membabi-buta.
- Empty `200` (filter tidak cocok) disimpan normal — itu jawaban valid, bukan error.

## 6. Single-flight (dedup paralel)

- Bila 3 agen meminta key yang sama saat key itu sedang miss dan dalam penerbangan, hanya **1 tembakan** ke Sectors; ketiganya menunggu hasil yang sama.
- Mencegah balapan saat DAG paralel (mis. 3 emiten × section sama) membakar kredit ganda.

## 7. Alur planner (estimasi-di-muka)

1. Planner susun DAG → untuk tiap node panggil `lookup` (gratis, tanpa tembak).
2. Tampilkan ke user: "12 calls: 9 dari Store (0 kredit) + 3 live (~5 kredit)" → user Approve.
3. Executor jalankan via `fetch`; tiap miss langsung `put` atomik (transaksi: simpan respons + `credits_spent` + `fetched_at`).
4. Budget guard: bila estimasi live > sisa budget run, run ditolak sebelum satu kredit pun keluar.

## 8. Skema (konseptual)

```sql
CREATE TABLE sectors_calls (
  cache_key     TEXT PRIMARY KEY,
  method        TEXT NOT NULL,
  endpoint      TEXT NOT NULL,
  params        JSON NOT NULL,
  response      JSON NOT NULL,      -- respons mentah Sectors apa adanya
  http_status   INT  NOT NULL,
  credits_spent INT  NOT NULL DEFAULT 0,
  hit_count     INT  NOT NULL DEFAULT 0,
  fetched_at    TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL
);
```

## 9. Dev & demo

- Mode fixture: Store di-seed dari JSON (`fixtures/sectors/*.json`) sehingga dev UI + video rehearsal **nol kredit**.
- Mode offline: `fetch` yang miss mengembalikan error jujur "belum ada di Store (mode offline)", bukan karangan.
- `GET /v1/store/stats` adalah bahan demo technical depth: "hit rate 78%, 213 kredit dihemat".
