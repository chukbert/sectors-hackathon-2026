# Kredit Sectors

Catatan tentang bagaimana kredit dihitung dan dijaga. **Tabel anggaran proyek dan buku resep hemat kredit ada di [README §4](../README.md#4-pemakaian-sectors-api-yang-hemat-dan-tidak-biasa).** Itulah buku besarnya; setiap panggilan Sectors baru dicatat di sana. Saldo resmi tetap di portal hackathon, karena Sectors tidak menyediakan endpoint saldo.

## Aturan penagihan (docs Sectors v2)

| Respons | Biaya |
|---|---|
| `2xx` | Biaya endpoint |
| `404` (query jalan, resource tidak ada) | 1 kredit |
| `400`, `401/403`, `429`, `5xx` | 0 |
| Screener `?q=` bahasa alami, sukses | 3 kredit |
| Screener terstruktur (`where`, `order_by`) | 1 kredit per halaman |
| `400` pada screener `?q=` yang sudah terlanjur diproses | 1 kredit |

Hal yang menjebak:

- Filter `symbol in [...]` tanpa suffix `.JK` menghasilkan `200` kosong yang **tetap ditagih**.
- 404 ditagih, jadi menebak simbol yang tidak punya data itu mahal. Karena itu daftar `list_companies_with_segments` (1 kredit) dipanggil dulu dan hanya 219 emiten bersegmen yang diambil.
- Cloudflare di depan Sectors menolak User-Agent `Python-urllib` (403, gratis). Pakai UA kustom.
- Panggilan beruntun kena 429 (gratis). Beri jeda (`--sleep`).

## Endpoint yang dipakai Paham Emiten

| Endpoint Sectors | Biaya | Dipakai untuk |
|---|---|---|
| `GET /v2/companies/` (Screener, `include_query_values=true`) | 1 per halaman (maks. 200 baris) | Matriks 962 emiten × 77 field: 25 halaman |
| `GET /v2/companies/list_companies_with_segments/` | 1 | Daftar emiten yang punya data segmen |
| `GET /v2/company/get-segments/{symbol}/` | 1 | Peta uang per emiten (219 emiten) |

Saat runtime aplikasi tidak memanggil satu pun dari ketiganya, karena semuanya sudah ada di `fixtures/snapshot/` dan di-seed ke Store.

## Bagaimana Store menghitung

- `keys.credit_cost(endpoint, params, status, body)` menerapkan tabel di atas. Path `/sectors/v2/...` bernilai 1 kredit (3 bila ada `q`). Untuk endpoint internal lama, biaya bergantung data (jumlah seksi laporan, kuartal, halaman) dan dihitung dari parameter serta isi respons.
- Cache hit selalu 0 kredit. Entri yang di-seed dari snapshot tidak mencatat pengeluaran, karena kreditnya sudah dibayar saat panen.
- `GET /v1/store/stats` melaporkan `credits_spent` (total pengeluaran yang dicatat Store) dan `credits_saved` (hit atas entri yang aslinya berbiaya). Header Paham Emiten menampilkan keduanya.
- Angka ini hanya mencakup panggilan **lewat Store**. Pemakaian key yang sama di luar Store (mis. `tools/validate_api.py` dan `tools/probe_snowflake.py` yang memanggil API langsung) tidak tercatat di ledger Store dan hanya tercatat di tabel anggaran README.

## Menjaga anggaran

- `tools/harvest.py --dry` menampilkan rencana dan estimasi kredit tanpa satu pun panggilan.
- `tools/harvest.py --budget N` berhenti sebelum melewati N kredit.
- Panen hanya di mode `IDXMACA_STORE_MODE=live`; semua mode lain 0 kredit.
- Setelah panen, commit respons mentah di `fixtures/snapshot/` supaya tidak perlu diambil ulang.
