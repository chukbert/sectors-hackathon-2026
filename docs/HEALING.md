# HEALING.md — audit brutal v5 → ARUS v6 (self-healing)

> Dokumen kerja. Ditulis 19 Sep 2026. Semua temuan diverifikasi dari kode + `.cache/` + repo donor `sectors/` (v4).
> Batasan: **nol panggilan live Sectors selama perbaikan** (kredit sangat terbatas). Semua uji = SEED=1 / fixture.

## Temuan (bukti)

1. **Ticker hardcode + default diam-diam.** `lib/orchestrator.ts` `pickSymbol()` = whitelist 14 ticker; di luar itu
   jatuh ke default per cabang (ANTM/BRMS/BMRI/ADRO/YP). "gimana kabar SMAR?" dijawab kartu ANTM
   (`.cache/chats/4865151224790651.json`). Melanggar janji PRD "tanpa ticker → klarifikasi, tidak menebak".
   v4 (`sectors/lib/agents.ts:32,222`) sudah punya solusi benar: `plausibleTickers()` + tolak menerbitkan kartu.
2. **Angka hardcode tampil sebagai hasil analisis.** FOMO selalu 86 (`chgPct:40,volX:4,newsHype:8`), likuiditas selalu
   `avgValueB:8/freeFloat:40`, exposure `?? 0.68`, `exDays:3`, `fcfCover:1`. Tidak ada yang berasal dari data.
3. **Guard & verifier tidak tersambung.** `guardText()` dan `verifyNumbers()` hasilnya di-`void`
   (`orchestrator.ts:199-204`); verifier memverifikasi angka terhadap dirinya sendiri. Narasi LLM tidak diverifikasi.
4. **Fitur diklaim tidak ada.** F3 GrupGraph/Autopsi, F4 Katalis, F6 Kalender = stub. `news/` di-fetch lalu dibuang;
   `corporate-actions/` cuma dummy. "autopsi portofolio" = broker-summary 1 simbol.
5. **Memory write-only.** `addPola` menulis; tidak pernah dibaca untuk menjawab. "Memory/state" syarat track = kosmetik.
6. **MCP separuh palsu.** `commodity_chain(slug)` mengabaikan slug; `event_cluster(sector)` mengabaikan sector;
   `mcp/server.ts` tidak memuat `dotenv`; tool baru error tanpa env export.
7. **Eval & calib teater.** 40 kasus v4 hanya cek `out.includes("verdict")` (selalu true). Calib 1.00 by construction.
8. **Rate-limit tidak memblokir** (flag di-set, tidak dipakai). `rateLimited` mati.
9. **Kredit bocor tanpa pengaman**: 404 diulang (biaya berulang), tidak ada circuit breaker, TTL salah tempat.

## Prinsip healing

- **Ticker universal, bukan whitelist.** Token 4 huruf kapital apa pun = kandidat (minus stopword Indonesia);
  huruf kecil dicek ke daftar simbol IDX statis (data, bukan gerbang). Tidak ada kandidat → klarifikasi, 0 kredit,
  **tidak menerbitkan kartu tentang emiten lain.** Ticker dari portofolio selalu disebut sumbernya.
- **Angka = hasil hitung kode.** LLM hanya prosa; prosa diverifikasi ulang (`lib/ground.ts`) terhadap pool JSON tool +
  angka turunan; gagal → jatuh ke prosa deterministik. Guardrail dieksekusi, bukan dihitung lalu dibuang.
- **Live gagal = jujur.** Tidak ada fallback fixture di mode live. Fixture hanya saat `SEED=1`, dan kartu berlabel SEED.
- **Hemat kredit itu fitur.** Cache-404 negatif, circuit breaker, TTL per keluarga data, cache-first, ledger jujur.
- **Semua intent untuk semua ticker**: gerak, rumor, risiko, dividen, kalender, likuiditas, banding, autopsi,
  barang (tambang), dna (broker), kuasa (insider), pagi. Plus obrolan tanpa ticker.

## Peta modul

| Modul | Peran |
|---|---|
| `lib/resolve.ts` | ekstraksi & resolusi ticker universal + konteks portofolio |
| `lib/seed.ts` | fixture deterministik berlabel SEED untuk semua endpoint yang dipakai |
| `lib/evidence.ts` | fetcher generik Sectors (1 tempat), kembalikan `{data, seed, ok}` |
| `lib/metrics.ts` | FOMO, Kohort Flow, likuiditas, dividen, return — pure code, nol konstanta ajaib |
| `lib/graph.ts` | GrupGraph (union-find ownership) + autopsi portofolio |
| `lib/ground.ts` | verifier grounding angka (±0.5%) — hasil dieksekusi |
| `lib/orchestrator.ts` | router → evidence → compute → verifier → decider → bantah → sintesis → guard → memori |
| `lib/sectors.ts` | cache + kredit + breaker + cache-404 + `ARUS_CACHE` |
| `mcp/server.ts` | 8 tool dengan parameter yang benar-benar dipakai |

## Kriteria terima (offline, SEED=1)

- `gimana kabar SMAR?` → kartu menyebut SMAR, **tidak** menyebut ANTM.
- `kenapa smar naik?` (huruf kecil) → tetap SMAR.
- `kenapa ZZZZ naik?` → `data-kurang` + klarifikasi, bukan ANTM.
- `autopsi portofolio BBCA BMRI ANTM` → group score + grup nyata dari ownership.
- `banding ADRO vs PTBA` → dua ticker, angka keduanya.
- `ex-date BMRI kapan?` → tanggal dari corporate-actions (bukan "3 hari" konstan).
- Semua kartu SEED berlabel SEED; budget ≤ 6kr; tanpa `OPENROUTER_API_KEY` tetap deterministik.
## Status (19 Sep 2026) — SELESAI untuk lingkup ini

- [x] Ticker universal + tolak menebak (`lib/resolve.ts`) — regresi SMAR/ZZZZ/IHSG diuji.
- [x] Dua router + multi-intent (`lib/planner.ts`) — LLM divalidasi, fallback heuristik deterministik.
- [x] Evidence 1 pintu + hemat kredit (`lib/evidence.ts`, `lib/sectors.ts`) — cache-404, breaker, budget 6kr.
- [x] Semua metrik dari data (`lib/metrics.ts` + vertical) — nol konstanta ajaib.
- [x] Verifier & guard dieksekusi (`lib/ground.ts`, `lib/guard.ts`) — sweep 12 pertanyaan 100% grounded.
- [x] Memori dipakai (portofolio/watchlist/pola) — autopsi & konteks.
- [x] MCP 8 tools jujur + `dotenv` + parameter dihormati.
- [x] Eval jujur **22/22 PASS** offline 0 kredit (`EVAL_REPORT.md`); calib dengan kontrol negatif.

Catatan: pertanyaan sisa sebelum submit — (1) repo git: `sectors-v5` masih di luar version control, sementara
aturan lomba memeriksa commit history; (2) uji live e2e (Sectors + OpenRouter) dilakukan pemilik kredit, bukan di sini;
(3) hapus `.env` dari paket submit, freeze 30 Sep.
