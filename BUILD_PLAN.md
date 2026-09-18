# BUILD PLAN v7 — LLM-first + reasoning graf, di atas `sectors-v5/`

> Pendamping `PRD.md` + `ARCHITECTURE.md`. Repo kerja: `sectors-v5/` (turunan v6 dari donor `sectors/`).
> ✅ **Git beres 19 Sep:** `sectors-v5/` repo git branch `master`; riwayat donor v6 (10 commit, 17 Sep — dalam build
> period) tertaut sebagai parent; `.env` ter-ignore, nol rahasia di history. Sisa aturan lomba: commit kecil tiap perubahan.
> Prinsip eksekusi: **LLM memahami bahasa; kode memegang angka, verifikasi, kredit.** Determininistik hanya untuk yang
> obviously deterministic by nature. Semua uji offline (`SEED=1`, tanpa key) — **nol panggilan Sectors live saat dev.**

## 0. Status snapshot (19 Sep 2026)

| Area | Status |
|---|---|
| v6 healing: ticker universal, dua router, evidence 1 pintu, verifier/guard dieksekusi, memori | ✅ |
| Model `google/gemini-3.8-flash` + effort `high` (sesuai `.env`), titik LLM: compiler/narator/tutor/bantahan/lanjutan + ringkas memori | ✅ live-terverifikasi (19 Sep: IHSG, ranking, CPO) |
| Output 2 lapis (teknis + awam deterministik) di chat, share, copy | ✅ |
| P0-Fundamental: screener + filter sektor (helper slug) + report 8/8 section + quarterly financials + segmen | ✅ |
| Eval offline | ✅ **53/53 PASS** (`npm run eval`) |
| Cakupan endpoint | 26/54 IDX+Mining (≈48%) — lihat `docs/API_COVERAGE.md` |
| Repo git + riwayat commit (blocker #1) | ✅ 19 Sep — `master`, donor history tertaut (17 Sep) |
| Query compiler LLM-first · entity resolver · graph reasoning | ✅ fase 1–3 selesai 19 Sep |
| Paket endpoint: Ranking · Pasar · Mining generik | ✅ inti selesai; SGX/KLSE dipotong sadar (label di README) |

## 1. Fase

| Fase | Isi | Selesai bila (gate) | Potong bila mepet |
|---|---|---|---|
| **1. Query compiler** ✅ | `compiler.ts`: 1 call → JSON (intents/tickers/entities/mode/screen/sektor/komoditas/ranking/hops) + validator enum & verifikasi; `planner.ts` refactor: LLM primer, heuristik **fallback** dan tidak menempel intent saat LLM valid | eval kasus: valid · fallback tanpa key · out-of-enum · ticker tak terverifikasi → semua ditolak dengan jalur jujur; multi-intent LLM utuh — ✅ 41/41 | schema disederhanakan (buang `hops`, sisakan intents/screen/mode) |
| **2. Entity resolver** ✅ | `entity.ts`: intent `entitas` — brand/nama → maks 2 kandidat → verifikasi `company/report §overview` (1kr) → jawab identitas + alternatif; arah balik ticker → `§ownership` | "saham Indomaret apa?" terjawab terverifikasi (atau jujur tak ditemukan); kandidat halusinasi tidak pernah lolos — ✅ 45/45 | verifikasi 1 kandidat saja |
| **3. Graph reasoning** ✅ | `chain.ts`: dekomposisi hop (LLM) → telusur edge `ownership/affiliate/contractor/buyer/segment/group` (kode) → claim graph bersitasi → narasi kondisional + bantahan per hop; hop dibatasi budget & cache | kasus "hulu tertekan → hilir grup" menghasilkan kartu dengan 100% klaim edge bersitasi; edge tak terverifikasi dilabeli/dibuang; eval positif + negatif — ✅ 48/48 | kedalaman 1 hop; narasi tanpa diagram |
| **4. Paket endpoint** ✅ inti | P0-Ranking (top-changes, most-traded) → P0-Pasar (idx-total, index-daily multi-kode) → P1-Mining (commodities generik, licenses/IUP, contracts) | tiap paket: fixture + eval hijau + `docs/API_COVERAGE.md` diperbarui; tidak ada pesan yang menyiratkan keterbatasan API — ✅ 52/52 | listing-performance, sector-report, sites/resources/exports, SGX/KLSE dilewati jujur (label README) |
| **5. Hardening & submit**  | eval target ≥45 kasus · **git/commit-history ✅ 19 Sep** · keluarkan `.env` dari paket · demo cases (compiler, entitas, rantai, screener/fundamental) · README/ARCHITECTURE sinkron · video | semua DoD §3 ✅; submit 30 Sep; freeze | eval ≥40; video 1 take; MCP tetap 8 tools |

## 2. File map delta (dari kondisi sekarang)

```
lib/
  compiler.ts     ✅ schema + prompt + validator output LLM (enum, ticker, kandidat entitas, screen, sektor, komoditas, ranking, hop)
  entity.ts       ✅ brand/nama → kandidat → verifikasi Sectors → jawaban identitas (+ arah balik pemilik)
  chain.ts        ✅ claim graph: hop, edge bersitasi, narasi kondisional, bantahan per hop
  planner.ts      ✅ LLM primer (compiler), heuristik fallback; multi-intent LLM tidak ditambahi heuristik
  router.ts       ✅ fallback keyword + parseRanking; intent `entitas`, `rantai` di jalur heuristik
  evidence.ts     ✅ +26 endpoint: commodities list/licenses/contracts/top-changes/most-traded/idx-total
  credit.ts       ✅ biaya per kuartal/section/most-traded/top-changes benar
  awam.ts         ✅ entitasPart · pemilikPart · rantaiPart · rankingPart · idxTotalPart
eval/
  run.ts          53 kasus: compiler (valid/fallback/out-of-enum/ticker), entitas (ada/tidak), rantai (positif/negatif/kontraktor),
                  mining generik/IUP, ranking movers/traded, fundamental/screener + disiplin grounding/budget/SEED
  fixtures        ✅ brand/ownership seed, ranking, idx-total, commodities/licenses/contracts
docs/
  API_COVERAGE.md ✅ Rev 4 — 26/54, paket inti selesai, gap tersisa jujur
  BUILD_PLAN.md   ← dokumen ini
ARCHITECTURE.md   ✅ v7 (compiler/entity/chain ✅ terpasang)
PRD.md            ✅ v7 (F13–F15 ✅)
sectors-deps.txt  ✅ baris endpoint → fitur (bukti kill-test; dipakai di video)
```

## 3. Definition of Done v7

- [x] Eval offline ≥45 PASS — **53/53** (tanpa `SECTORS_API_KEY` & `OPENROUTER_API_KEY`; SEED=1, 0 kredit)
- [x] Compiler: output LLM 100% tervalidasi sebelum eksekusi; tanpa key → fallback deterministik penuh
- [x] Multi-intent: LLM primer; heuristik tidak menempel saat LLM valid (regresi "direksi→kuasa" ada di eval)
- [x] Entity: kandidat wajib terverifikasi Sectors; gagal → jujur, tidak mengarang ticker
- [x] Rantai: setiap node/edge klaim bersitasi; edge tak terverifikasi tidak pernah diklaim fakta
- [x] 0 angka tak-grounding (±0.5% verifier); guard blokir 100% anjuran eksplisit
- [x] ≤ `SECTORS_BUDGET`/sesi (default 6kr) dengan badge + ledger cocok — ✅ live 19 Sep: 10kr untuk 8 call verifikasi, ledger cocok
- [x] Live gagal → "data tidak tersedia"; tanpa fallback karangan; `SEED=1` selalu berlabel
- [x] URL publik HP tanpa login <60s; permalink `/k/{id}` + OG render
- [x] MCP 8 tools Inspector OK; mati bila Sectors dicabut
- [x] `docs/API_COVERAGE.md` akurat (Rev 4, 26/54); pesan "belum didukung" selalu berarti gap ARUS, bukan limit API
- [x] **Git: riwayat commit dalam build period tersedia** (blocker #1); `.env` tidak ikut; README/ARCHITECTURE/PRD sinkron
- [ ] Freeze 30 Sep dipatuhi (nol perubahan setelah submit)

## 4. Risiko

| Risiko | Mitigasi |
|---|---|
| LLM hallucinate ticker/edge/angka | aturan keras §1 ARCHITECTURE: validator enum + verifikasi Sectors; grounding + guard dieksekusi; fallback deterministik |
| Latensi multi-call (compiler + sintesis + hop) | paralelkan yang independen; narasi hanya 1 pass; timeouts 20s; fallback deterministik sedini mungkin |
| Kredit membengkak di reasoning berlapis | hop & kandidat dibatasi; cache-first; ledger tampil di kartu; `SECTORS_BUDGET` sadar |
| Scope compiler > waktu | fase 1 boleh kehilangan `hops` (di fase 3), schema minimal tetap tervalidasi |
| Git/commit history | ✅ beres 19 Sep (bootstrap + donor history tertaut); sisa: commit kecil tiap perubahan |
| Pertanyaan liar di luar cakupan | jawab jujur "belum diimplementasikan, API-nya ada" + usul lanjutan; jangan pura-pura |

## 5. Aturan main harian

1. Satu fase = satu tujuan eval; jangan lanjut sebelum eval hijau.
2. Semua perubahan lewat `npx tsc --noEmit` + `npm run eval`; `npm run build` untuk dist.
3. Tidak ada panggilan Sectors live saat dev; verifikasi live hanya dengan kredit sadar + dicatat di ledger.
4. Commit kecil dengan pesan jelas (setelah blocker git beres); nol commit setelah submit.