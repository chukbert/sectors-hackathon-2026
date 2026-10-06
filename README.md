# Struk Jadi Saham

> Foto struk belanjamu → kenali perusahaan terbuka di balik tiap merek: dari mana uangnya datang, siapa pemiliknya, dan pertanyaan kritis yang layak kamu ajukan.
> Sectors Hackathon 2026 · **Track: Market Intelligence** · semua angka dari **Sectors API v2**, AI tidak pernah menulis angka.

**Insight turunan, bukan data mentah:** 9 detektor anomali berbasis aritmatika Screener + ukuran kohort seluruh bursa, peringkat dari 962 emiten, rasio "per Rp100 pendapatan", perbandingan se-industri, dan rantai pengendali yang ditelusuri dari data pemegang saham.

---

## 1. Masalahnya

Jutaan orang Indonesia membeli Indomie, Pepsodent, pulsa Telkomsel, dan GoFood setiap minggu, tapi tidak tahu bahwa merek-merek itu dimiliki perusahaan yang sahamnya bisa mereka pelajari — bahkan beli. Aplikasi saham dibuat untuk orang yang *sudah* paham pasar. Pemula yang kritis dan penasaran tidak punya pintu masuk.

**Struk Jadi Saham** memakai benda yang semua orang punya — struk belanja — sebagai pintu masuk itu.

## 2. Cara kerjanya

```
foto / teks struk ──► AI membaca NAMA MEREK saja (Gemini, tanpa angka)
                 ──► merek → emiten (katalog kurasi 57 emiten · 196 merek; tebakan AI ditandai "dugaan")
                 ──► emiten wajib ada di data Sectors, kalau tidak: "bukan emiten"
                 ──► Kartu Kenalan per perusahaan, 100% dari Sectors
```

Setelah scan, kartu kenalan merek **barang** teratas langsung terbuka (bukan alat bayar atau toko), supaya pengguna pertama langsung melihat bahwa ada data nyata di balik belanjaannya.

| Bagian kartu | Isi | Sumber Sectors |
|---|---|---|
| 01 Seberapa besar | Pendapatan, laba, nilai pasar + peringkat dari 962 emiten, utang vs modal, dividen, tren 4 tahun, **"dari setiap Rp100 pendapatan, sisa laba Rp X"** | Screener `include_query_values` (matriks seluruh bursa) |
| 02 Peta uang | Diagram Sankey: segmen pendapatan → biaya → laba (rugi ditandai tangerine) | `/v2/company/get-segments/{symbol}/` |
| 03 Siapa pemiliknya | Pemegang saham, porsi publik, rantai pengendali (ICBP ← 80,5% INDF ← 50,1% First Pacific → Grup Salim) | `major_shareholders`, `affiliates` dari Screener |
| 04 Teman sejenis | Perbandingan dengan emiten se-industri | Matriks Screener |
| 05 Pertanyaan kritis | Pola anomali + berapa emiten lain di bursa dengan pola sama + pertanyaan Sokratik | **Ekspresi aritmatika `where` Screener** |

### Pertanyaan kritis = rumus yang dijalankan Sectors ke seluruh bursa

Setiap pola adalah ekspresi `where` Screener Sectors, ditampilkan apa adanya ke pengguna sebagai bukti:

| Pola | `where` |
|---|---|
| Penjualan naik, tapi laba turun | `revenue[2025] > revenue[2024] and earnings[2025] < earnings[2024]` |
| Laba turun dua tahun berturut-turut | `earnings[2025] < earnings[2024] and earnings[2024] < earnings[2023]` |
| Utang lebih besar dari modal sendiri | `total_debt[2025] > total_equity[2025]` |
| Dividen lebih besar dari laba | `payout_ratio > 1` |
| Rugi di tahun 2025 | `earnings[2025] < 0` |
| Untung di atas kertas, kas operasi minus | `operating_cash_flow[2025] < 0 and earnings[2025] > 0` |
| Margin laba bersih anjlok > 30% | `net_profit_margin[2024] > 0 and net_profit_margin[2025] < net_profit_margin[2024] * 0.7` |
| Laba naik tiga tahun berturut-turut | `earnings[2023] > 0 and earnings[2024] > earnings[2023] and earnings[2025] > earnings[2024]` |
| Penjualan melonjak > 20% | `revenue[2024] > 0 and revenue[2025] > revenue[2024] * 1.2` |

`pagination.total_count` dari Sectors menjadi konteks kohort ("pola ini dimiliki **181** dari 962 perusahaan"). Pengguna menulis tebakannya; AI pendamping menanggapi **tanpa angka dan tanpa saran beli/jual** (dijaga kode, bukan imbauan).

## 3. Kenapa Sectors adalah inti, bukan hiasan

**Uji copot:** jalankan Core dengan `STRUK_SECTORS_OFF=1` — semua endpoint menolak dengan
`"Tanpa data Sectors, aplikasi ini tidak bisa menampilkan apa pun — kami tidak mengarang angka."`
Tidak ada fallback angka dari AI. Ini diuji otomatis (`test_sectors_off_kills_the_app`).

Peran AI sengaja sempit:

| Peran | Yang boleh | Penjaga |
|---|---|---|
| `struk_parse` | baca nama merek dari foto/teks | skema JSON ketat; injeksi di struk diabaikan |
| `struk_explain` | terjemahkan label segmen Sectors + 1 kalimat ringkasan | output ditolak bila ada digit atau frasa rekomendasi |
| `struk_reflect` | tanggapi jawaban pengguna | output ditolak bila ada digit atau frasa rekomendasi → fallback deterministik |

Model: `google/gemini-3.8-flash` via OpenRouter, `reasoning_effort=low`.

## 4. Pemakaian Sectors API yang hemat (dan tidak biasa)

Seluruh bursa (962 emiten × ±50 field) diambil hanya dengan **10 panggilan Screener**, memanfaatkan fakta bahwa
`include_query_values=true` mengembalikan *setiap* field yang disebut di `where` — termasuk cabang `OR` dan field per-tahun:

```
where = symbol like '%' or revenue[2022] > -1e18 or revenue[2023] > -1e18 or … or affiliates in ['Salim'] or …
limit = 200, order_by = symbol, include_query_values = true      → 5 halaman × 2 grup field = 10 kredit
```

Kebenaran rumus lokal dikunci tes: untuk **setiap** pola, evaluasi Python atas matriks harus sama persis dengan `total_count` yang dihitung Sectors (`test_local_rule_matches_sectors_screener_count`, 9 pola).

### Anggaran kredit (saldo awal tim 490)

| Tahap | Panggilan | Kredit |
|---|---|---|
| Validasi asumsi (`tools/validate_api.py`): aritmatika `where`, field list, suffix `.JK`, daftar segmen | 4 | 4 |
| Harvest matriks seluruh bursa | 10 | 10 |
| Harvest segmen pendapatan (43 emiten konsumen) | 43 | 43 |
| Harvest kohort 9 pola | 9 | 9 |
| **Runtime aplikasi (setiap scan, kartu, pertanyaan)** | **0** | **0** |
| **Total** | 66 | **66** → sisa **424** |

Semua respons mentah disimpan di `fixtures/snapshot/` (±2,5 MB, data Sectors asli) dan di-*seed* ke Store saat start. Aplikasi berjalan di mode `offline` — tidak ada panggilan live, tidak ada kredit terbakar saat demo atau saat juri mencoba. Chip di header menampilkan kredit terpakai vs dihemat secara jujur.

Pelajaran API yang kami dokumentasikan di kode: Cloudflare menolak UA `Python-urllib` (pakai UA kustom); filter `symbol in [...]` butuh suffix `.JK`; `listing_date` harus dibandingkan sebagai tanggal (bukan `like`); panggilan beruntun kena 429 (gratis, tapi perlu jeda).

## 5. Arsitektur

```
apps/web    Next.js 14 + ECharts   — halaman Struk Jadi Saham (/), proxy /api/core/*
apps/core   FastAPI                — app/struk/: universe (matriks), rules (9 pola), brands (katalog),
                                     service (kartu, pemilik, kohort, keranjang), narrate (3 peran AI)
apps/store  FastAPI + SQLite       — Sectors Call Store: read-through cache, ledger kredit, mode offline,
                                     seed snapshot, passthrough /sectors/v2/* dengan biaya kanonis
fixtures/snapshot   respons Sectors asli (matrix/, segments/, cohorts/)
tools/harvest.py    pengambil snapshot (--dry dulu, --budget, --sleep)
```

Setiap angka di UI membawa provenans yang bisa dibuka ("dari mana angka ini?"): endpoint Sectors, field, query, waktu ambil, dan kredit untuk tampilan itu.

## 6. Menjalankan

```bash
make setup                      # venv Python + deps Node (butuh uv)
cp .env.example .env            # isi OPENROUTER_API_KEY untuk baca foto struk
make dev                        # Store :8787 + Core :8788 + Web :3000
# buka http://127.0.0.1:3000
```

- `IDXMACA_STORE_MODE=offline` (default) → hanya snapshot, 0 kredit Sectors. `SECTORS_API_KEY` tidak dibutuhkan untuk menjalankan aplikasi.
- Tanpa `OPENROUTER_API_KEY`: input teks tetap jalan (pencocokan katalog deterministik), label peta uang tampil dalam bahasa Inggris asli Sectors; input foto butuh key.
- Uji copot Sectors: `STRUK_SECTORS_OFF=1 make dev`.

Memperbarui snapshot (memakai kredit, selalu dry-run dulu):

```bash
.venv/bin/python tools/harvest.py --dry                    # estimasi kredit, 0 panggilan
IDXMACA_STORE_MODE=live .venv/bin/python tools/harvest.py --budget 70 --sleep 3
```

Tes:

```bash
make test        # Store + Core, termasuk 17 tes Struk Jadi Saham terhadap snapshot asli
```

## 7. Batasan yang kami akui

- Katalog merek dikurasi manual (57 emiten, 196 merek). Merek di luar katalog bisa ditebak AI tapi ditandai **dugaan**; merek milik perusahaan tertutup (Aqua, Mie Sedaap, Sosro) jujur ditandai **bukan emiten**.
- Peta uang tersedia untuk 43 emiten yang segmennya kami ambil (Sectors punya 219); emiten lain menampilkan kotak kosong yang jujur, bukan angka karangan.
- Snapshot bertanggal 6 Oktober 2026, tahun buku 2025.
- Alat informasi dan analisis, **bukan rekomendasi investasi**.

## 8. Riwayat

Repo ini berawal dari **IDXMACA** (asisten multi-agen untuk analis), masih tersedia di `/idxmaca` — dokumentasinya di [`docs/IDXMACA.md`](docs/IDXMACA.md). Kami beralih ke Struk Jadi Saham karena IDXMACA menghabiskan kredit per pertanyaan; arsitektur Store-nya dipakai ulang di sini sehingga runtime menjadi 0 kredit.
