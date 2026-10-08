# Store: pintu tunggal ke Sectors

> **Aturan:** Core tidak pernah menembak Sectors langsung. Setiap permintaan mampir ke Store. Pernah diambil dengan endpoint dan parameter yang sama → dikembalikan dari cache, 0 kredit. Belum → Store yang menembak (hanya di mode `live`), menyimpan hasilnya, lalu mengembalikannya.

Kode: `apps/store/app/`. Konteks arsitektur ada di [ARCHITECTURE.md](ARCHITECTURE.md); angka kredit di [CREDITS.md](CREDITS.md).

## Mode

Diatur lewat `IDXMACA_STORE_MODE` (nama variabel warisan IDXMACA, sengaja tidak diganti).

| Mode | Perilaku | Dipakai untuk |
|---|---|---|
| `offline` | Hanya cache. Entri kedaluwarsa tetap dikembalikan (`store-hit-stale`). Yang tidak ada → 503 `offline_no_cache`, tidak dikarang. | **Demo, Docker, juri** (default di kode, `docker-compose.yml`, dan `.env.example`) |
| `live` | Miss → tembak Sectors, simpan. Butuh `SECTORS_API_KEY`. | Panen snapshot (`tools/harvest.py`) |

Nilai mode lain (mis. `fixture`, `auto` dari versi lama) ditolak saat start dengan `ValueError`, jadi salah konfigurasi tidak diam-diam jatuh ke sumber lain.

Key Sectors hanya dibaca di Store (`sectors_client.py`), dikirim mentah di header `Authorization`. Klien memakai User-Agent kustom karena Cloudflare di depan Sectors menolak UA bawaan Python.

## Alur `POST /v1/store/fetch`

1. **Normalisasi** parameter (`keys.normalize_params`): urutan, huruf besar kecil, tipe nilai. Dua permintaan yang sama artinya selalu jadi satu kunci.
2. **Kunci kanonis** lalu cek cache. Segar → `store-hit`, 0 kredit (entri hasil seed snapshot juga dihitung hit).
3. **Mode `offline`**: pakai entri kedaluwarsa bila ada, selain itu 503.
4. **Single-flight**: bila kunci yang sama sedang diambil, permintaan berikutnya menunggu hasil yang sama. Satu tembakan, bukan banyak.
5. **Live**: `live_routes.translate` memetakan endpoint ke path Sectors. Hanya path `/sectors/v2/...` (yang dipakai Paham Emiten) yang diteruskan, apa adanya ke `/v2/.../` dengan parameter tak berubah. Path lain → **501 `live_route_unavailable`, 0 kredit** (fail-closed, supaya tidak ada 404 berbiaya).
6. **Simpan** dan catat biaya (`keys.credit_cost`).

Respons selalu membawa provenans: `source` (`store-hit`, `store-hit-stale`, `sectors-live`), `fetched_at`, `credits_spent`, `cache_key`, `http_status`, `warnings`, `mode`. Core meneruskannya ke UI sebagai `src` di setiap blok kartu.

## Endpoint

| Endpoint | Fungsi |
|---|---|
| `POST /v1/store/fetch` `{endpoint, params}` | Jalur utama (alur di atas) |
| `POST /v1/store/lookup`, `GET /v1/store/lookup` | Cek kering: hit atau tidak, segar atau tidak, estimasi kredit bila live. Tidak menembak. |
| `POST /v1/store/invalidate` | Hapus per `cache_key`, per endpoint+params, atau per umur (`older_than` detik) |
| `GET /v1/store/stats` | `cached_keys`, `fresh_keys`, `store_hits`, `hit_rate`, `credits_spent`, `credits_saved`, `top_keys`, `mode`, `credit_start`, `credit_remaining` |
| `GET /v1/store/keys` | Daftar kunci tersimpan (maks. 500) |
| `GET /v1/health` | Status dan mode |

## Kunci kanonis

`cache_key = SHA256("GET|" + path_norm + "|" + params_json)`

- **Path**: huruf kecil untuk kata kunci jalur (`v1`, `v2`, `company`, `companies`); segmen alfanumerik lain (simbol, `sectors`, `report`, `get-segments`) dijadikan huruf besar, sehingga `bbca` dan `BBCA` memberi kunci yang sama. Host dibuang.
- **Parameter**: diurutkan menurut nama; nilai kosong dibuang; `"true"`/`"false"` jadi boolean; string angka jadi integer; nilai pada kunci simbol (`symbol`, `symbols`, `code`, `ticker`, `slug`, `broker`) jadi huruf besar; daftar diurutkan; `sections` huruf kecil.
- API key dan header autentikasi **tidak** ikut kunci.

## TTL

`ttl.py`. Semua path `/sectors/v2/...` (Screener, segmen, daftar segmen) bertahan **30 hari**: fundamental tahunan dan kepemilikan berubah per laporan, bukan per hari. Path lain memakai `IDXMACA_DEFAULT_TTL` (24 jam).

**Negative cache**: respons `404` disimpan `IDXMACA_NEGATIVE_TTL` (6 jam) karena 404 tetap ditagih satu kredit. Status 400/401/403/429/5xx tidak disimpan. `200` kosong disimpan normal.

## Seed snapshot dan ledger

Saat start, Store membaca `fixtures/snapshot/**/*.json` (respons Sectors asli hasil `tools/harvest.py`) dan memasukkannya ke cache dengan `INSERT OR IGNORE`, tanpa mencatat pengeluaran (kreditnya sudah dibayar saat panen). Hasilnya aplikasi langsung penuh data tanpa satu pun panggilan ke Sectors.

Skema SQLite (`db.py`, WAL):

```sql
sectors_calls(cache_key PK, method, endpoint, params, response, http_status,
              credits_spent, hit_count, fetched_at, expires_at, origin)
credit_events(id, cache_key, credits, source, at)
```

`credit_events` mencatat `spend` (kredit negatif) setiap kali Store menyimpan hasil panggilan, dan `saved` setiap kali sebuah hit melayani entri yang aslinya berbiaya. `credits_saved` di `/v1/store/stats` adalah jumlah `saved` itu. Chip di header Paham Emiten menampilkan `credits_spent` dan `credits_saved`.

## Konfigurasi

| Variabel | Default | Arti |
|---|---|---|
| `IDXMACA_STORE_MODE` | `offline` | `offline` atau `live` |
| `SECTORS_API_KEY` | kosong | Key Sectors; hanya Store yang membacanya |
| `SECTORS_BASE_URL` | `https://api.sectors.app` | |
| `SECTORS_AUTH_SCHEME` | kosong | Kosong = key mentah di `Authorization`; isi `Bearer` bila Sectors berubah |
| `IDXMACA_DATA_DIR` / `IDXMACA_STORE_DB` | `./.data` / `<data>/store.db` | Lokasi SQLite |
| `IDXMACA_SNAPSHOT_DIR` | `fixtures/snapshot` | Sumber seed |
| `IDXMACA_SECTORS_RETRIES` / `IDXMACA_SECTORS_TIMEOUT` | `2` / `30` s | Retry dengan backoff untuk 429/5xx dan galat jaringan |
| `IDXMACA_DEFAULT_TTL` / `IDXMACA_NEGATIVE_TTL` | 24 jam / 6 jam | |
| `IDXMACA_CREDIT_START` | `1000` | Hanya untuk menghitung `credit_remaining` di `/stats`; Paham Emiten tidak menampilkannya |
