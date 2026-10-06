<div align="center">

# Struk → Saham

**Kamu sudah jadi pelanggan mereka. Sekarang kenali perusahaannya.**

Foto struk belanja — atau satu kemasan produk — dan lihat perusahaan terbuka di balik tiap merek:<br>
dari mana uangnya datang, siapa pemiliknya, dan pertanyaan kritis yang layak kamu ajukan.

![Sectors API v2](https://img.shields.io/badge/data-Sectors%20API%20v2-2b4bff?style=flat-square)
![Track](https://img.shields.io/badge/track-Market%20Intelligence-c8f046?style=flat-square&labelColor=0b0d12)
![Runtime credits](https://img.shields.io/badge/kredit%20runtime-0-ff7a1a?style=flat-square)
![AI numbers](https://img.shields.io/badge/angka%20dari%20AI-0-0b0d12?style=flat-square)
![Tests](https://img.shields.io/badge/tes-102%20lulus-2b4bff?style=flat-square)
[![CI](https://github.com/chukbert/sectors-hackathon-2026/actions/workflows/ci.yml/badge.svg)](https://github.com/chukbert/sectors-hackathon-2026/actions/workflows/ci.yml)

### 🌐 Coba langsung: **[sectors.muflichlabs.online](https://sectors.muflichlabs.online)** — tanpa daftar, tanpa install

<img src="docs/img/hero.png" alt="Halaman utama Struk Jadi Saham" width="100%">

</div>

---

## Untuk juri: 60 detik

- **Masalah.** Jutaan orang membeli Indomie, Pepsodent, dan pulsa Telkomsel tiap minggu tanpa tahu bahwa pemilik merek itu perusahaan terbuka yang bisa mereka pelajari. Aplikasi saham dibuat untuk orang yang *sudah* paham pasar.
- **Yang kami bangun.** Foto struk belanja (atau satu kemasan) → setiap merek dipetakan ke emitennya → **kartu kenalan** yang 100% dibangun dari data Sectors: ukuran perusahaan dalam bahasa awam, peta uang (segmen pendapatan), rantai pemilik sampai grup konglomerasi, dan **pertanyaan kritis** yang dihitung Sectors ke seluruh bursa.
- **Sectors adalah inti.** Jalankan dengan `STRUK_SECTORS_OFF=1` dan semua endpoint menolak: *tidak ada angka tanpa Sectors* (diuji otomatis). Setiap angka di layar bisa dibuka asal-usulnya: endpoint, field, query, waktu ambil.
- **Pemakaian Sectors yang tidak biasa.** Seluruh bursa (962 emiten × ±50 field) diambil hanya dengan **10 panggilan Screener**, memanfaatkan `include_query_values`. Total 66 kredit untuk seluruh proyek; **0 kredit per pengguna**. 9 pola anomali adalah ekspresi `where` Sectors, dan rumus lokal kami dikunci tes agar sama persis dengan `total_count` Sectors.
- **AI dipagari kode, bukan imbauan.** AI hanya membaca nama merek. Keluarannya ditolak bila memuat angka atau saran beli/jual. Hasil evaluasi pada 59 baris struk: **98% terpetakan benar, 0 dari 18 merek non-emiten dikarang menjadi emiten** (tabel di [§3](#ukur-sendiri-seberapa-jujur-pembacaan-struknya)).
- **Bisa diverifikasi.** Demo live di atas · `docker compose up --build` · 102 tes + CI · semua respons Sectors mentah ada di `fixtures/snapshot/`.

---

## Input → Output

### 📦 Foto satu produk → kartu kenalan sahamnya

![Foto kemasan Sari Roti menjadi kartu kenalan ROTI](docs/img/demo-produk.png)

Foto bungkus **Sari Roti Sandwich Cokelat** dari tangan → AI membaca mereknya → katalog mencocokkan ke **ROTI** → dicek ke data Sectors → kartu kenalan PT Nippon Indosari Corpindo Tbk.
Dari setiap Rp100 pendapatannya, hanya sekitar **Rp6,9** yang jadi laba bersih — dan dividennya **259%** dari laba. Itu yang layak ditanyakan.

### 🧾 Foto satu struk → peta pemilik belanjaanmu

![Struk swalayan asli menjadi peta pemilik](docs/img/demo-struk.png)

Struk swalayan asli, 28 baris barang, difoto miring dan buram → Promina (ICBP), Pepsodent, Bango, Rinso, Lux (UNVR), La Fonte (INDF, ditandai **dugaan AI**) — **dikelompokkan per pemilik**: ICBP dan INDF sama-sama bermuara ke **Grup Salim**.
Milo, Kinder Joy, Downy, Hi-Lo, Pronas jujur ditandai **bukan emiten** — pemiliknya tidak tercatat di BEI, jadi kami tidak mengarang. Kartu merek **barang** pertama langsung terbuka.

<sub>Input adalah foto asli dari ponsel (nomor kartu pembayaran di struk kami samarkan). Output adalah screenshot asli aplikasi setelah foto itu diunggah lewat jalur foto — tanpa disunting.</sub>

---

## Isi kartu kenalan

Setiap kartu dibangun 100% dari data Sectors. Contoh di bawah: **ICBP** (Indomie).

<table>
<tr>
<td width="50%"><b>01 · Seberapa besar?</b><br><sub>"Dari setiap Rp100 pendapatan…", peringkat dari 962 emiten, tren 4 tahun</sub><br><img src="docs/img/card-b1.png"></td>
<td width="50%"><b>02 · Peta uang</b><br><sub>Segmen pendapatan → biaya → laba (Sankey dari endpoint segments)</sub><br><img src="docs/img/card-b2.png"></td>
</tr>
<tr>
<td><b>03 · Siapa pemiliknya?</b><br><sub>Porsi publik + rantai pengendali: ICBP ← INDF ← First Pacific → Grup Salim</sub><br><img src="docs/img/card-b3.png"></td>
<td><b>05 · Pertanyaan kritis</b><br><sub>Pola dihitung Sectors ke seluruh bursa — "dimiliki 181 dari 962 perusahaan"</sub><br><img src="docs/img/card-b5.png"></td>
</tr>
</table>

<details>
<summary><b>📱 Tampilan ponsel</b></summary>
<br>
<p align="center">
<img src="docs/img/mobile-result.png" width="300">&nbsp;&nbsp;<img src="docs/img/mobile-card.png" width="300">
</p>
</details>

---

## 1. Masalahnya

Jutaan orang Indonesia membeli Indomie, Pepsodent, pulsa Telkomsel, dan GoFood setiap minggu, tapi tidak tahu bahwa merek-merek itu dimiliki perusahaan yang sahamnya bisa mereka pelajari — bahkan beli. Aplikasi saham dibuat untuk orang yang *sudah* paham pasar. Pemula yang kritis dan penasaran tidak punya pintu masuk.

**Struk Jadi Saham** memakai benda yang semua orang punya — struk belanja, atau bungkus produk di meja — sebagai pintu masuk itu.

**Insight turunan, bukan data mentah** (track Market Intelligence): 9 detektor anomali berbasis aritmatika Screener + ukuran kohort seluruh bursa, peringkat dari 962 emiten, rasio "per Rp100 pendapatan", perbandingan se-industri, dan rantai pengendali yang ditelusuri dari data pemegang saham.

## 2. Cara kerjanya

```mermaid
flowchart LR
    A["📷 Foto struk<br>📦 Foto produk<br>⌨️ Teks"] --> B["AI membaca<br><b>nama merek saja</b><br><i>tanpa angka</i>"]
    B --> C["Katalog kurasi<br>57 emiten · 196 merek<br><i>tebakan AI = 'dugaan'</i>"]
    C --> D{"Ada di data<br>Sectors?"}
    D -- tidak --> E["'bukan emiten'<br>(Aqua, Mie Sedaap…)"]
    D -- ya --> F["Kartu Kenalan<br><b>100% data Sectors</b>"]
    F --> G["01 Ukuran · 02 Peta uang<br>03 Pemilik · 04 Sejenis<br>05 Pertanyaan kritis"]
    style B fill:#0b0d12,color:#c8f046,stroke:#0b0d12
    style F fill:#2b4bff,color:#fff,stroke:#2b4bff
    style E fill:#ff7a1a,color:#0b0d12,stroke:#ff7a1a
```

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
Tidak ada fallback angka dari AI.
 Ini diuji otomatis (`test_sectors_off_kills_the_app`).

Peran AI sengaja sempit:

| Peran | Yang boleh | Penjaga |
|---|---|---|
| `struk_parse` | baca nama merek dari foto/teks | skema JSON ketat; injeksi di struk diabaikan |
| `struk_explain` | terjemahkan label segmen Sectors + 1 kalimat ringkasan | output ditolak bila ada digit atau frasa rekomendasi |
| `struk_reflect` | tanggapi jawaban pengguna | output ditolak bila ada digit atau frasa rekomendasi → fallback deterministik |

Model: `google/gemini-3.8-flash` via OpenRouter, `reasoning_effort=low`.

### Ukur sendiri: seberapa jujur pembacaan struknya?

`fixtures/eval/struk_eval.json` berisi 59 baris dari 6 struk (minimarket, swalayan, apotek, gaya hidup/digital) ditulis seperti singkatan kasir (`TEH PUCUK HRM 350ML`, `SO GOOD SOSIS 375G`) beserta kunci jawabannya. Sebanyak 18 baris sengaja berisi merek yang pemiliknya **tidak** tercatat di BEI (Aqua, Sedaap, Downy, Gulaku, Teh Botol Sosro, Pertamax, McDonald's, dan lainnya), yaitu jebakan untuk melihat apakah aplikasi mengarang emiten.

| Jalur | Baris benar | Emiten ditemukan | Merek non-emiten dikarang jadi emiten | Emiten salah |
|---|---|---|---|---|
| Katalog saja (tanpa AI) | 54/59 (92%) | 36/41 (88%) | 0/18 (0%) | 0 |
| **Aplikasi (AI + katalog + verifikasi data Sectors)** | **58/59 (98%)** | **40/41 (98%)** | **0/18 (0%)** | **0** |

Satu-satunya yang meleset: `BODREX` (Tempo Scan, TSPC). Merek ini di luar katalog dan AI tidak cukup yakin, jadi aplikasi memilih **tidak menebak**. Kami sengaja tidak menambalnya ke katalog agar angka di atas tidak dicurangi. Hasil per baris ada di `fixtures/eval/struk_eval_result.json`. Ulangi sendiri dengan `python tools/eval_struk.py` (0 kredit Sectors, 6 panggilan AI).

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

Cara tercepat, satu perintah (butuh Docker saja):

```bash
docker compose up --build       # → http://127.0.0.1:3000
```

Tanpa Docker:

```bash
make setup                      # venv Python + deps Node (butuh uv)
cp .env.example .env            # isi OPENROUTER_API_KEY untuk baca foto struk
make dev                        # Store :8787 + Core :8788 + Web :3000
# buka http://127.0.0.1:3000
```

- `IDXMACA_STORE_MODE=offline` (default) → hanya snapshot, 0 kredit Sectors. `SECTORS_API_KEY` tidak dibutuhkan untuk menjalankan aplikasi.
- Demo publik (`PUBLIC_DEMO=1`): proxy hanya membuka endpoint Struk, dan AI dibatasi kuota per pengunjung + per hari (`apps/core/app/struk/quota.py`). Saat kuota habis, input teks otomatis memakai katalog deterministik; data Sectors tidak pernah ikut terbatasi.
- Tanpa `OPENROUTER_API_KEY`: input teks tetap jalan (pencocokan katalog deterministik), label peta uang tampil dalam bahasa Inggris asli Sectors; input foto butuh key.
- Uji copot Sectors: `STRUK_SECTORS_OFF=1 make dev`.

Memperbarui snapshot (memakai kredit, selalu dry-run dulu):

```bash
.venv/bin/python tools/harvest.py --dry                    # estimasi kredit, 0 panggilan
IDXMACA_STORE_MODE=live .venv/bin/python tools/harvest.py --budget 70 --sleep 3
```

Tes:

```bash
make test        # 102 tes Store + Core, termasuk tes Struk Jadi Saham terhadap snapshot Sectors asli
```

CI (GitHub Actions) menjalankan tes yang sama, ditambah typecheck dan build web serta build image Docker, di setiap push.

## 7. Batasan yang kami akui

- Katalog merek dikurasi manual (57 emiten, 196 merek). Merek di luar katalog bisa ditebak AI tapi ditandai **dugaan**; merek milik perusahaan tertutup (Aqua, Mie Sedaap, Sosro) jujur ditandai **bukan emiten**.
- Peta uang tersedia untuk 43 emiten yang segmennya kami ambil (Sectors punya 219); emiten lain menampilkan kotak kosong yang jujur, bukan angka karangan.
- Snapshot bertanggal 6 Oktober 2026, tahun buku 2025.
- Alat informasi dan analisis, **bukan rekomendasi investasi**.

## 8. Riwayat

Repo ini berawal dari **IDXMACA** (asisten multi-agen untuk analis), masih tersedia di `/idxmaca` — dokumentasinya di [`docs/IDXMACA.md`](docs/IDXMACA.md). Kami beralih ke Struk Jadi Saham karena IDXMACA menghabiskan kredit per pertanyaan; arsitektur Store-nya dipakai ulang di sini sehingga runtime menjadi 0 kredit.
