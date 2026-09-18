# BUILD PLAN v7 — LLM-first + reasoning graf, di atas `sectors-v5/`

> Pendamping `PRD.md` + `ARCHITECTURE.md`. Repo kerja: `sectors-v5/` (turunan v6 dari donor `sectors/`).
> ⚠️ **Utang wajib beres sebelum submit:** `sectors-v5/` belum repo git; aturan lomba menilai commit history dalam build
> period — harus diselesaikan (lihat Fase 5, blocker #1). `.env` (key asli) tidak boleh ikut paket submission.
> Prinsip eksekusi: **LLM memahami bahasa; kode memegang angka, verifikasi, kredit.** Determininistik hanya untuk yang
> obviously deterministic by nature. Semua uji offline (`SEED=1`, tanpa key) — **nol panggilan Sectors live saat dev.**

## 0. Status snapshot (19 Sep 2026)

| Area | Status |
|---|---|
| v6 healing: ticker universal, dua router, evidence 1 pintu, verifier/guard dieksekusi, memori | ✅ |
| Model `meta/muse-spark-1.2` + effort `xhigh`, 5 titik LLM (planner/narator/tutor/bantahan/lanjutan) + ringkas memori | ✅ live-terverifikasi 1 call |
| Output 2 lapis (teknis + awam deterministik) di chat, share, copy | ✅ |
| P0-Fundamental: screener + filter sektor (helper slug) + report 8/8 section + quarterly financials + segmen | ✅ |
| Eval offline | ✅ **34/34 PASS** (`npm run eval`) |
| Cakupan endpoint | 20/54 IDX+Mining (≈37%) — lihat `docs/API_COVERAGE.md` |
| Query compiler LLM-first · entity resolver · graph reasoning | 🔜 fase 1–3 di bawah |
| Paket endpoint: Ranking · Pasar/Sektor · Broker/Mining · SGX/KLSE | 🔜 fase 4 |

## 1. Fase

| Fase | Isi | Selesai bila (gate) | Potong bila mepet |
|---|---|---|---|
| **1. Query compiler** 🔜 | `compiler.ts`: 1 call → JSON (intents/tickers/entities/mode/screen/sektor/komoditas/hops) + validator enum & verifikasi; `planner.ts` refactor: LLM primer, heuristik **fallback** dan tidak menempel intent saat LLM valid | eval kasus: valid · fallback tanpa key · out-of-enum · ticker tak terverifikasi → semua ditolak dengan jalur jujur; multi-intent LLM utuh | schema disederhanakan (buang `hops`, sisakan intents/screen/mode) |
| **2. Entity resolver** 🔜 | `entity.ts`: intent `entitas` — brand/nama → maks 2 kandidat → verifikasi `company/report §overview` (1kr) → jawab identitas + alternatif; arah balik ticker → `§ownership` | "saham Indomaret apa?" terjawab terverifikasi (atau jujur tak ditemukan); kandidat halusinasi tidak pernah lolos | verifikasi 1 kandidat saja |
| **3. Graph reasoning** 🔜 | `chain.ts`: dekomposisi hop (LLM) → telusur edge `ownership/affiliate/contractor/buyer/segment/group` (kode) → claim graph bersitasi → narasi kondisional + bantahan per hop; hop dibatasi budget & cache | kasus "hulu tertekan → hilir grup" menghasilkan kartu dengan 100% klaim edge bersitasi; edge tak terverifikasi dilabeli/dibuang; eval kasus positif + negatif | kedalaman 1 hop; narasi tanpa diagram |
| **4. Paket endpoint** 🔜 | P0-Ranking (top-changes, most-traded, listing-performance) → P0-Pasar/Sektor (idx-total, index-daily multi-kode, index universe, sector-report) → P1-Broker/Mining (**commodities generik** ganti hardcode coal/nikel, licenses/contracts → tutup gap IUP, sites/resources/production/exports) → P2 SGX/KLSE (opsional, berlabel) | tiap paket: fixture + eval hijau + `docs/API_COVERAGE.md` diperbarui; tidak ada pesan yang menyiratkan keterbatasan API | P2 dilewati jujur; P1 mining minimal licenses + commodities |
| **5. Hardening & submit** 🔜 | eval target ≥45 kasus · **selesaikan git/commit-history** · keluarkan `.env` dari paket · demo cases (compiler, entitas, rantai, screener/fundamental) · README/ARCHITECTURE sinkron · video | semua DoD §3 ✅; submit 30 Sep; freeze | eval ≥40; video 1 take; MCP tetap 8 tools |

## 2. File map delta (dari kondisi sekarang)

```
lib/
  compiler.ts     🔜 BARU  schema + prompt + validator output LLM (enum, ticker, kandidat entitas, hop)
  entity.ts       🔜 BARU  brand/nama → kandidat → verifikasi Sectors → jawaban identitas
  chain.ts        🔜 BARU  claim graph: hop, edge bersitasi, narasi kondisional, bantahan per hop
  planner.ts      🔧 refactor  LLM primer (compiler), heuristik fallback; multi-intent LLM tidak ditambahi heuristik
  router.ts       ✅ tetap  fallback keyword; tambah intent `entitas`, `rantai` di jalur heuristik
  evidence.ts     +fetch   commodities list (P1), licenses/contracts/sites/production, ranking, index universe
  credit.ts       ✅ tetap  biaya per kuartal/section sudah benar; tambah estimasi endpoint baru
  awam.ts         +part   entitasPart, rantaiPart (deterministik, tanpa angka baru, tanpa nasihat)
eval/
  run.ts          34 → ≥45  kasus compiler (valid/fallback/out-of-enum), entitas (ada/tidak), rantai (positif/negatif),
                            ranking/pasar/mining saat paketnya masuk
  fixtures         +brand fixture, +grup hulu-hilir, +ranking/sector/mining
docs/
  API_COVERAGE.md +status  per paket; temuan crawl baru; koreksi biaya
  BUILD_PLAN.md    ← dokumen ini
ARCHITECTURE.md    ✅ v7 (compiler/entity/chain sudah digambarkan + penanda status)
PRD.md             ✅ v7 (visi & momen diperbarui)
sectors-deps.txt   +baris endpoint → fitur (bukti kill-test; dipakai di video)
```

## 3. Definition of Done v7

- [ ] Eval offline ≥45 PASS (tanpa `SECTORS_API_KEY` & `OPENROUTER_API_KEY`; SEED=1, 0 kredit)
- [ ] Compiler: output LLM 100% tervalidasi sebelum eksekusi; tanpa key → fallback deterministik penuh
- [ ] Multi-intent: LLM primer; heuristik tidak menempel saat LLM valid (regresi "direksi→kuasa" ada di eval)
- [ ] Entity: kandidat wajib terverifikasi Sectors; gagal → jujur, tidak mengarang ticker
- [ ] Rantai: setiap node/edge klaim bersitasi; edge tak terverifikasi tidak pernah diklaim fakta
- [ ] 0 angka tak-grounding (±0.5% verifier); guard blokir 100% anjuran eksplisit
- [ ] ≤ `SECTORS_BUDGET`/sesi (default 6kr) dengan badge + ledger cocok; semua biaya per docs
- [ ] Live gagal → "data tidak tersedia"; tanpa fallback karangan; `SEED=1` selalu berlabel
- [ ] URL publik HP tanpa login <60s; permalink `/k/{id}` + OG render
- [ ] MCP 8 tools Inspector OK; mati bila Sectors dicabut
- [ ] `docs/API_COVERAGE.md` akurat; pesan "belum didukung" selalu berarti gap ARUS, bukan limit API
- [ ] **Git: riwayat commit dalam build period tersedia** (blocker #1); `.env` tidak ikut; README/ARCHITECTURE/PRD sinkron
- [ ] Freeze 30 Sep dipatuhi (nol perubahan setelah submit)

## 4. Risiko

| Risiko | Mitigasi |
|---|---|
| LLM hallucinate ticker/edge/angka | aturan keras §1 ARCHITECTURE: validator enum + verifikasi Sectors; grounding + guard dieksekusi; fallback deterministik |
| Latensi multi-call (compiler + sintesis + hop) | paralelkan yang independen; narasi hanya 1 pass; timeouts 20s; fallback deterministik sedini mungkin |
| Kredit membengkak di reasoning berlapis | hop & kandidat dibatasi; cache-first; ledger tampil di kartu; `SECTORS_BUDGET` sadar |
| Scope compiler > waktu | fase 1 boleh kehilangan `hops` (di fase 3), schema minimal tetap tervalidasi |
| Git/commit history | blocker #1 di Fase 5, dikerjakan lebih awal bila memungkinkan (jangan menunggu H-1) |
| Pertanyaan liar di luar cakupan | jawab jujur "belum diimplementasikan, API-nya ada" + usul lanjutan; jangan pura-pura |

## 5. Aturan main harian

1. Satu fase = satu tujuan eval; jangan lanjut sebelum eval hijau.
2. Semua perubahan lewat `npx tsc --noEmit` + `npm run eval`; `npm run build` untuk dist.
3. Tidak ada panggilan Sectors live saat dev; verifikasi live hanya dengan kredit sadar + dicatat di ledger.
4. Commit kecil dengan pesan jelas (setelah blocker git beres); nol commit setelah submit.