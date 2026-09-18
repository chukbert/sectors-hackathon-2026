# ARUS — asisten riset IDX (v7)

*Ikan kecil lihat harga. ARUS lihat arus — uang, barang, kuasa.*

Asisten multi-agent untuk **ticker IDX apa pun** (bukan cuma daftar demo): satu chat → satu Kartu Arus dengan verdict
probabilistik, bukti bersitasi, bantahan, dan angka yang semuanya dihitung kode. Tanpa login. Live gagal = jujur
"data tidak tersedia" — tidak ada fallback karangan.

Track: Sectors Hackathon 2026 · Track 01 AI Agents & Assistants. Alat riset & edukasi. **Bukan nasihat keuangan. Tanpa eksekusi order.**

> **v7 — LLM memahami bahasa, kode memegang angka.** Query compiler LLM-first (1 call → JSON tervalidasi kode),
> entity resolver (brand → kandidat → **verifikasi Sectors**), dan graph reasoning (hop bersitasi + narasi kondisional).
> Heuristik v6 hidup hanya sebagai jaring pengaman saat LLM absen/invalid. Semua diuji `npm run eval` — **52/52 offline, 0 kredit**.

## Yang berubah (v6 → v7)

**v7 — bahasa liar masuk, angka tetap kode:**

- **Query compiler LLM-first** (`lib/compiler.ts`): 1 call → JSON ketat (intents · tickers · entities · fundamental_mode ·
  screen · sektor · komoditas · ranking · hops). Validator kode menolak enum ngawur, ticker tak ada di pesan/portofolio,
  metric screener di luar whitelist, kata sektor tak dikenal, edge hop tak dikenal. Multi-intent murni dari LLM — heuristik
  **tidak menempelkan** intent tambahan saat LLM valid (regresi "direksi → kuasa" dikunci di eval). Tanpa key → heuristik utuh, 0 kredit.
- **Entity resolver** (`lib/entity.ts`): `saham Indomaret apa?` → kandidat ticker dari model → **wajib diverifikasi**
  `company/report §overview` (maks 2 kandidat, 1kr) → jawab identitas + alternatif; gagal verifikasi = jujur "tidak
  ditemukan", ticker halusinasi tidak pernah lolos. Arah balik: ticker → `§ownership` ("ini induk siapa?").
- **Graph reasoning** (`lib/chain.ts`): hop tervalidasi ditelusuri ke edge data (`ownership`/`group`/`affiliate` dari
  §ownership + known-list; `contractor` dari `mining/contracts/`); edge tanpa data **dibuang & dilabeli**, bukan diklaim.
  Narasi dampak selalu **kondisional** ("jika coal tertekan → X satu grup berpotensi ikut…") + bantahan per hop.
- **Komoditas generik** (P1): kata apa pun (`cpo`, `emas`, `tembaga`, …) → kandidat slug → **verifikasi ke
  `mining/commodities/`** → seri harga Sectors. Nol hardcode coal/nikel.
- **Mining IUP** (P1): `mining/licenses/` per emiten → sisa bulan izin → flag risiko perpanjangan di kartu tambang.
- **Ranking & pasar** (P0): top gainers/losers, most-traded, idx-total (market cap total), indeks multi-kode
  (LQ45/IDX30/BUMN20/HIDIV20/Kompas100/JII70/SMInfra18) — angka apa adanya dari Sectors.

**Fondasi v6 (healing) yang tetap berlaku:**

- **Ticker universal.** Nol whitelist. Token 4-huruf-kapital apa pun = kandidat ticker; huruf kecil dicek ke daftar simbol.
  Tidak ada ticker → klarifikasi `data-kurang`, **tidak menerbitkan kartu tentang emiten lain** (`lib/resolve.ts`).
- **Heuristik = jaring pengaman.** Keyword router (`lib/router.ts`) + parser deterministik hidup hanya saat LLM absen/invalid.
- **Satu pintu evidence.** Semua fetch Sectors di `lib/evidence.ts`; cache-first, cache-404 negatif, circuit breaker,
  timeouts, ledger kredit (`lib/sectors.ts`). Live gagal → metrik itu ditandai tidak tersedia.
- **Angka = hasil hitung.** FOMO, Kohort Flow (broker registry × summary × foreign-flow), likuiditas, dividen, drawdown,
  cluster insider, DNA broker, divergence — semuanya di `lib/metrics.ts` + `lib/{barang,dna,kuasa,graph,gnn}.ts`. Nol konstanta ajaib.
- **Verifier & guard dieksekusi.** Prosa LLM diuji grounding angka (±0.5%, `lib/ground.ts`); gagal → prosa deterministik.
  Guardrail memblokir anjuran eksplisit — hasilnya dipakai, bukan dibuang.
- **Memori dipakai.** Portofolio ("portofolio saya: BUMI 30 BRMS 30…"), watchlist, pola perilaku → masuk ke jawaban.
- **LLM di titik naratif (semua lewat verifier/guard).** compiler · narrator · tutor · bantahan · lanjutan — plus ringkasan
  memori di `/api/memory` (di-cache). Setiap output LLM diuji grounding angka + guardrail; gagal/tanpa key → deterministik.
- **Output dua lapis.** Setiap kartu dibagi **Bagian 1 · Data faktual (bacaan teknis)** dan **Bagian 2 · Pelan-pelan
  (arti per istilah + analogi + apa yang terbaca dari kondisi ini)** — dasar Bagian 2 deterministik (`lib/awam.ts`),
  lalu diperhalus tutor LLM hanya bila lolos verifikasi.
- **MCP 8 tools jujur.** Parameter benar-benar dipakai; `import "dotenv/config"`; tanpa Sectors = mati (kill test).
- **Eval jujur.** 52 kasus dengan assertion yang bisa gagal (regresi SMAR→ANTM, ticker asing, multi-intent, validator
  compiler, entity & rantai, budget, grounding, label SEED, struktur Bagian 2 bebas nasihat, fallback deterministik) +
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
| barang | `coal naik kok ADRO turun?` · `komoditas CPO gimana?` | divergence komoditas vs volume + exposure; komoditas generik diverifikasi ke `mining/commodities/`; IUP via `mining/licenses/` |
| dna | `broker YP aman?` | fingerprint 14hr: distribusi/conduit asing/gorengan |
| entitas | `saham Indomaret apa?` · `siapa induk ADRO?` | kandidat dari model → verifikasi `§overview`; arah balik ke `§ownership` |
| rantai | `kalau coal jatuh, siapa di grup BUMI yang kena?` | hop bersitasi (ownership/group/affiliate/contractor) + narasi kondisional + bantahan per hop |
| screener | `saham apa yang paling murah?` · `saham bank termurah?` | Sectors screener: PE/PB/yield/ROE/DER/market cap/growth + filter sektor (slug divalidasi ke helper list, 1kr, angka apa adanya) |
| fundamental | `PE ANTM berapa?` · `laba SMAR gimana?` · `segmen TLKM?` | report §valuation/financials/future/management/peers/overview (1kr/section), quarterly financials (1kr/kuartal), segments — apa adanya dari Sectors |
| kuasa | `ada cluster insider?` | ≥4 insider-sell 1 sektor 7hr, rights wave |
| pagi | `scan pagi` | GNN-lite anomali dari close 90hr |
| pasar | `IHSG gimana?` · `top gainer hari ini?` · `saham paling ramai?` · `market cap IDX?` · `LQ45 gimana?` | index-daily multi-kode, top-changes (1kr), most-traded (2kr), idx-total (1kr) |

## Jalankan

```bash
npm install
cp .env.example .env   # isi SECTORS_API_KEY + OPENROUTER_API_KEY
npm run eval           # 52 kasus jujur, SEED=1, offline, 0 kredit
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
"kemungkinan relasi"; komoditas monthly (coal bi-weekly), EOD bukan realtime; **daftar komoditas harga Sectors =
logam + coal grades (CPO/agri tidak ada — ARUS menjawab jujur "tidak di daftar", verified live 19 Sep)**;
lisensi/kontrak mining terdata di level operator (holding seperti ADRO bisa 0 baris — bukan berarti tidak ada);
proyeksi analis (§future) = pihak ketiga yang dikutip Sectors, bukan ramalan ARUS; **cakupan endpoint ARUS 26/54**
(lihat `docs/API_COVERAGE.md`) — yang belum: sector-report per subsektor, sebagian top-list broker/universe close &
foreign-flow, resources/sites/production/exports/global mining, dan multi-market SGX/KLSE (API-nya tersedia, ini gap
ARUS yang dinyatakan terbuka); `SEED=1` = data contoh, bukan data pasar.

Dokumen: `ARCHITECTURE.md` (v7: pembagian tugas LLM vs kode) · `PRD.md` (v7) · `BUILD_PLAN.md` (v7) ·
`docs/API_COVERAGE.md` (audit cakupan endpoint Sectors) · `docs/HEALING.md` (audit v6).