# INVESTIGRAPH — Sectors Hackathon 2026, Track 01 (AI Agents & Assistants)

Asisten riset saham IDX berbasis data untuk investor ritel. Satu pertanyaan bahasa Indonesia masuk, satu dokumen jawaban keluar: **angka dari Sectors API**, **hitungan di kode**, **tiga varian narasi** (Pemula/Menengah/Advanced), dan **jejak audit** yang bisa diperiksa.

Doktrin produk: **Masteri Konstan, Cakupan Variabel** — 10 level analisis, biaya kredit mengikuti kesulitan pertanyaan, bukan mengikuti panjang chat.

> Bukan rekomendasi jual/beli. Semua angka diberi sitasi; keputusan investasi tanggung jawab pengguna.

## Cara kerja (ringkas)

```
user → guardrail (Jev) → klasifikasi level (aturan + Jev) → planner (template level × domain)
     → Credit Governor → resolver cache-first (memory → cache → irisan/near-miss → live)
     → Argument Compiler (fakta + turunan dihitung kode) → Narrator 3 varian
     → verifier Jev (sitasi, kritik narasi, compliance fail-closed) → AnswerDoc → render
```

- **Agent logic milik sendiri**: kontrol alur di kode (template level/domain), LLM hanya di titik yang butuh bahasa/penilaian.
- **Jev (typesafe/jev-1.13 via OpenRouter)** dipakai untuk: guardrail input, klasifikasi level, verifikasi sitasi, kritik narasi, compliance, dan skor turunan terpilih.
- **Sectors API** adalah satu-satunya sumber angka. LLM tidak pernah menulis digit mentah: narasi memakai placeholder `{{f:FACTID|format}}` yang diisi kode sesuai mode bahasa.
- **Cache-first**: semua respons API disimpan (SQLite + blob gzip content-addressed) bersama ledger kredit per panggilan. Mode `replay` menjawab 100% dari cache (0 kr), `hybrid` mencoba cache/irisan dulu, `live` selalu menembak API.
- **3 varian narasi disimpan sekaligus** → ganti mode bahasa instan tanpa panggilan API/LLM/Jev.

## Menjalankan

```bash
pnpm install
cp .env.example .env        # isi SECTORS_API_KEY + OPENROUTER_API_KEY
pnpm seed                  # muat cache riset (opsional, untuk mode replay)
pnpm dev                   # http://localhost:3000
```

Build produksi: `pnpm build && pnpm start`.

## Skrip

| Skrip | Fungsi | Biaya |
|---|---|---|
| `pnpm seed` | impor cache respons riset ke store (replay mode) | 0 kr |
| `pnpm smoke` | cek resolver + 1 panggilan Jev; `--live` menambah ≤5 kr Sectors; `--chat` menjalankan satu turn penuh | 0–5 kr |
| `pnpm sweep --dry-run` | daftar seluruh endpoint + estimasi biaya | 0 kr |
| `pnpm sweep --live --budget=61` | uji seluruh endpoint terdaftar | ±61 kr |
| `pnpm mastery` | 39 kasus mastery (13 domain × 3) melalui pipeline penuh | 0 kr (replay/near-miss) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | kualitas kode | 0 kr |

## Arsitektur berkas

```
src/lib/config.ts              konfigurasi env, cap kredit per level, 13 domain
src/lib/db/                    SQLite: api_hits, cache_entries, fact_memory, sessions/turns/memory_items
src/lib/sectors/registry.ts    47 endpoint Sectors (IDX + mining) + ekstraktor fakta deterministik
src/lib/sectors/client.ts      resolver cache-first: memory → cache → irisan/near-miss → live + billing rule
src/lib/llm/openrouter.ts      LLM client (JSON mode, effort, retry)
src/lib/llm/jev.ts             Jev decisions client + logging audit (data/jev-log.jsonl)
src/lib/agent/                 guardrail, slots, classifier, digest, planner, governor, compiler, narrator, verifier, pipeline
src/lib/output/answerdoc.ts    kontrak AnswerDoc (zod)
src/components/                shell chat + Visual Registry (Recharts/SVG/tabel) + render placeholder
scripts/                       seed, smoke, sweep, mastery
```

## Aturan biaya (billing Sectors)

- HTTP 2xx = biaya penuh endpoint (mis. report 1 kr/section, quarterly 1 kr/kuartal, most-traded 2 kr).
- **404 tetap 1 kr**, **400 gratis**, 401/403/429/5xx gratis; respons kosong (200) tetap ditagih.
- Setiap panggilan (atau cache hit) tercatat di `api_hits`; view `credit_ledger` merollup per hari/sesi.
- Credit Governor membatasi per level: L1–2=2 kr, L3–4=8, L5–6=16, L7–8=24, L9=40, L10=70, plus budget harian.

## Batasan yang dinyatakan jujur

- Cakupan pasar: **IDX + ekstensi mining**; SGX/KLSE tidak termasuk.
- Beberapa endpoint berbatas: `daily`/`index-daily`/`idx-total` ≤90 hari, `broker-summary`/`broker-activity` (non-top) ≤14 hari, harga komoditas ≤3 tahun.
- Tanpa eksekusi order, tanpa rekomendasi jual/beli; compliance diperiksa berlapis dan gagal-tertutup (fail-closed).

## Lisensi & kredit data

Data: [Sectors Financial API](https://docs.sectors.app). Keputusan Jev: model `typesafe/jev-1.13` via OpenRouter.