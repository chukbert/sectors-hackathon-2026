# ARUS — asisten riset IDX (v6)

*Ikan kecil lihat harga. ARUS lihat arus — uang, barang, kuasa.*

Asisten multi-agent untuk **ticker IDX apa pun** (bukan cuma daftar demo): satu chat → satu Kartu Arus dengan verdict
probabilistik, bukti bersitasi, bantahan, dan angka yang semuanya dihitung kode. Tanpa login. Live gagal = jujur
"data tidak tersedia" — tidak ada fallback karangan.

Track: Sectors Hackathon 2026 · Track 01 AI Agents & Assistants. Alat riset & edukasi. **Bukan nasihat keuangan. Tanpa eksekusi order.**

> Catatan versi: kode di repo ini = **v6** (terpasang & teruji 34/34 offline). `ARCHITECTURE.md`, `PRD.md`, dan
> `BUILD_PLAN.md` sudah dirombak ke arah **v7 — query compiler LLM-first + entity resolver + graph reasoning**
> (ditandai 🔜); bagian ber-tanda ✅ adalah yang sudah berjalan.

## Yang berubah di v6 (self-healing)

- **Ticker universal.** Nol whitelist. Token 4-huruf-kapital apa pun = kandidat ticker; huruf kecil dicek ke daftar simbol.
  Tidak ada ticker → klarifikasi `data-kurang`, **tidak menerbitkan kartu tentang emiten lain** (`lib/resolve.ts`).
- **Dua router.** Heuristik keyword (selalu jalan) + **LLM planner multi-intent** via OpenRouter (`lib/planner.ts`).
  Pertanyaan majemuk ("kenapa ANTM naik dan ex-date kapan?") dijalankan sebagai >1 analisis lalu digabung satu kartu.
- **Satu pintu evidence.** Semua fetch Sectors di `lib/evidence.ts`; cache-first, cache-404 negatif, circuit breaker,
  timeouts, ledger kredit (`lib/sectors.ts`). Live gagal → metrik itu ditandai tidak tersedia.
- **Angka = hasil hitung.** FOMO, Kohort Flow (broker registry × summary × foreign-flow), likuiditas, dividen, drawdown,
  cluster insider, DNA broker, divergence — semuanya di `lib/metrics.ts` + `lib/{barang,dna,kuasa,graph,gnn}.ts`. Nol konstanta ajaib.
- **Verifier & guard dieksekusi.** Prosa LLM diuji grounding angka (±0.5%, `lib/ground.ts`); gagal → prosa deterministik.
  Guardrail memblokir anjuran eksplisit — hasilnya dipakai, bukan dibuang.
- **Memori dipakai.** Portofolio ("portofolio saya: BUMI 30 BRMS 30…"), watchlist, pola perilaku → masuk ke jawaban.
- **LLM di lima titik (semua lewat verifier/guard).** `planner` (routing multi-intent + validasi ticker) · `narrator`
  (prosa kartu) · `tutor` (menulis ulang Bagian 2) · `bantahan` (sisi lain) · `lanjutan` (pertanyaan berikutnya) —
  plus ringkasan memori di `/api/memory` (di-cache). Setiap output LLM diuji grounding angka + guardrail; gagal/tanpa
  key → versi deterministik. Tanpa Sectors tetap jalan (SEED=1).
- **Output dua lapis.** Setiap kartu dibagi **Bagian 1 · Data faktual (bacaan teknis)** dan **Bagian 2 · Pelan-pelan
  (arti per istilah + analogi + apa yang terbaca dari kondisi ini)** — dasar Bagian 2 deterministik (`lib/awam.ts`),
  lalu diperhalus tutor LLM hanya bila lolos verifikasi.
- **MCP 8 tools jujur.** Parameter benar-benar dipakai; `import "dotenv/config"`; tanpa Sectors = mati (kill test).
- **Eval & calib jujur.** 34 kasus dengan assertion yang bisa gagal (regresi SMAR→ANTM, ticker asing, multi-intent,
  budget ≤6kr, grounding, label SEED, struktur Bagian 2 bebas nasihat, fallback deterministik, screener + fundamental) +
  calib dengan kontrol negatif. Semua offline, 0 kredit.

## Format output: 2 bagian

1. **Bagian 1 — Data faktual & bacaan teknis.** Verdict + keyakinan, narasi, visual (arus uang, rantai barang, grup,
   anomali), metrik, bukti bersitasi, bantahan, dan rincian endpoint. Untuk yang sudah paham istilah pasar.
2. **Bagian 2 — Pelan-pelan: artinya apa.** Gaya tutor untuk yang baru ikut investasi: tiap istilah dijelaskan
   *arti → analogi sehari-hari ("ibarat toko…") → apa yang terbaca di kartu ini*, dikelompokkan **🟢 sisi yang mendukung /
   🟡 perlu diperhatikan / ⚪ istilah & konteks**, ditutup ringkasan pemula (`kartu.awam.intisari`) — murni penjelasan
   kondisi, bukan rekomendasi atau ajakan beli/jual.

## Intent yang didukung

| Intent | Contoh | Inti |
|---|---|---|
| kenapa-gerak | `kenapa SMAR naik?` | return, kohort uang, asing, insider |
| rumor | `SMAR mau ke 500?` | FOMO berbasis data + distribusi ritel + filing |
| risiko | `risiko BUMI apa?` | drawdown, distribusi, streak asing, suspensi |
| dividen | `yield SMAR aman?` | riwayat yield, konsistensi, ex-date |
| kalender | `ex-date BMRI kapan?` | corporate-actions (dividen/rights/split/AGM) |
| likuiditas | `likuiditas BRMS?` | nilai transaksi 20hr, market cap, hari volume nol |
| banding | `banding ADRO vs PTBA` | return/volume/FOMO side-by-side |
| autopsi | `autopsi portofolio saya` | Group Score dari ownership (union-find) |
| barang | `coal naik kok ADRO turun?` | divergence komoditas vs volume + exposure |
| dna | `broker YP aman?` | fingerprint 14hr: distribusi/conduit asing/gorengan |
| screener | `saham apa yang paling murah?` · `saham bank termurah?` | Sectors screener: PE/PB/yield/ROE/DER/market cap/growth + filter sektor (slug divalidasi ke helper list, 1kr, angka apa adanya) |
| fundamental | `PE ANTM berapa?` · `laba SMAR gimana?` · `segmen TLKM?` | report §valuation/financials/future/management/peers/overview (1kr/section), quarterly financials (1kr/kuartal), segments — apa adanya dari Sectors |
| kuasa | `ada cluster insider?` | ≥4 insider-sell 1 sektor 7hr, rights wave |
| pagi | `scan pagi` | GNN-lite anomali dari close 90hr |
| pasar | `IHSG gimana?` | index-daily |

## Jalankan

```bash
npm install
cp .env.example .env   # isi SECTORS_API_KEY + OPENROUTER_API_KEY
npm run eval           # 34 kasus jujur, SEED=1, offline, 0 kredit
npm run calib          # konsistensi aturan + kontrol negatif
npm run dev            # :3000 — HP tanpa login
npm run mcp            # MCP 8 tools via stdio (Inspector)
```

- `SEED=1` → fixture berlabel SEED (cache di `ARUS_CACHE`, default `.cache/`). Tanpa key dan tanpa `SEED=1` → error jujur.
- Tanpa `OPENROUTER_API_KEY` → planner memakai heuristik, sintesis deterministik (semua kartu tetap terbit).
- Budget: 6 kredit/sesi (badge ⚡ + ledger per endpoint). Cache 404 negatif & circuit breaker menghemat kredit.

## MCP

`npx @modelcontextprotocol/inspector tsx mcp/server.ts` — 8 tools:
`kohort_flow(symbol) · group_neighborhood(symbol) · fomo_meter(symbol) · rumor_verdict(text) ·
portfolio_group_score(symbols) · commodity_chain(slug) · broker_dna(code) · event_cluster(sector)`.
Semua menghormati parameter dan memakai pipeline yang sama dengan chat. Cabut Sectors = MCP mati.

## Limitasi jujur

Broker = proxy kohort, bukan identitas; DNA = pola historis, bukan vonis; ownership = laporan terakhir, label
"kemungkinan relasi"; komoditas monthly (coal bi-weekly), EOD bukan realtime; proyeksi analis (§future) = pihak ketiga
yang dikutip Sectors, bukan ramalan ARUS; **cakupan endpoint ARUS 20/54 endpoint IDX+Mining Sectors**
(lihat `docs/API_COVERAGE.md`) — izin IUP, ranking, mayoritas pasar/indeks & broker, multi-market SGX/KLSE belum
diimplementasikan (API-nya tersedia, ini gap ARUS); `SEED=1` = data contoh, bukan data pasar.

Dokumen: `docs/HEALING.md` (audit + perubahan v6) · `docs/API_COVERAGE.md` (audit cakupan endpoint Sectors) · `ARCHITECTURE.md` · `docs/PRD-v5.md` (perencanaan).