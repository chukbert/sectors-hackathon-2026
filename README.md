# IDXMACA — IDX Multi Agent Consulting Assistant

> Track **AI Agents & Assistants** · Sectors Hackathon 2026
> Satu pertanyaan Bahasa Indonesia → rencana agen + estimasi kredit → data terverifikasi → memo 3 lensa + 8 panel visual, semua angka bisa diklik ke sumbernya.

Dokumen produk: [`docs/PRD.md`](docs/PRD.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/INTENT-OUTPUT.md`](docs/INTENT-OUTPUT.md) · [`docs/STORE.md`](docs/STORE.md) · [`docs/ICP.md`](docs/ICP.md)

---

## 1. Apa ini

IDXMACA menerima pertanyaan seperti:

> "Bandingkan BBCA, BMRI, BBRI kuartal terakhir + siapa yang akumulasi + risiko kreditnya?"

lalu menjalankan pipeline milik sendiri:

```
query → Router → Entity Resolver → Planner (DAG + estimasi kredit via Store.lookup) → [user Approve]
      → Executor paralel (wajib lewat Store Service) → Compute deterministik → Evidence Ledger
      → Verifier (angka vs ledger + filter bahasa rekomendasi) → Writer (panel + memo L3) → UI/Export
```

Prinsip yang ditegakkan kode, bukan imbauan:

1. **Store-first.** Tidak ada agen yang menembak Sectors langsung. Semua lewat Store Service read-through (`docs/STORE.md`): hit = 0 kredit, miss = tembak + simpan. Kunci kanonis SHA256, TTL per jenis data, negative caching, single-flight.
2. **LLM tidak pernah menghitung.** Semua angka dari compute Python murni; LLM hanya menarasikan dan memilih visual dari whitelist.
3. **Verifier dua lapis.** Lapis kode (penentu) memastikan setiap angka ada di ledger dengan toleransi pembulatan yang terukur, memblokir frasa rekomendasi (beli/jual/hold/target price/…), dan menyuntik disclaimer. Lapis judge LLM (low effort) membaca ulang nada.
4. **Memori sesi wajib.** Satu-satunya pintu ke model adalah gateway yang selalu merakit konteks: ringkasan + N turn verbatim + state entitas + pointer ledger. "Tambahkan DBS", "yang tadi", "jelaskan risiko kreditnya saja" tetap nyambung.
5. **Kill-switch per panel.** Satu fetch gagal → panel terkait empty-state jujur; panel lain tetap tayang. Tidak ada data karangan.

## 2. Struktur repo

```
apps/web      Next.js 14 + TypeScript + React + ECharts — UI chat ala Gemini (paritas token warna/font/radius)
apps/core     FastAPI — router, planner, compiler NL→where, executor, compute, rule engine, verifier, writer, memori, export
apps/store    FastAPI + SQLite — Sectors Call Store (read-through cache wajib), fixture/offline/live mode
packages/prompts   System prompt per peran (router, planner, compiler, writer_panel, writer_l3, judge, memory)
packages/evals     20 pertanyaan baku + harness skor (target ≥90%)
fixtures/sectors   Data demo deterministik (generator: tools/gen_fixtures.py) — angka ilustrasi, bukan data real
tools/             gen_fixtures.py · serve.sh · web.sh · smoke_test.py
docs/              PRD, ARCHITECTURE, INTENT-OUTPUT, STORE, ICP
```

## 3. Quickstart (lokal, 0 kredit)

```bash
make setup          # venv Python + deps Node
make fixtures       # (opsional) regenerate data demo
make serve          # Store :8787 + Core :8788 + Web :3000 (build & start)
# buka http://127.0.0.1:3000
```

Mode default = **fixture**: data demo dari `fixtures/sectors/*.json`, **0 kredit Sectors, 0 panggilan LLM**
(narasi template deterministik). Cocok untuk dev UI dan rehearsal video.

### Mode live (data nyata + LLM nyata)

```bash
cp .env.example .env
# isi SECTORS_API_KEY dan OPENROUTER_API_KEY, set:
#   IDXMACA_STORE_MODE=live
#   IDXMACA_LLM_MODE=live
make serve
```

- `IDXMACA_STORE_MODE=auto` → pakai Sectors live bila key ada, fallback fixture bila gagal (bisa dimatikan).
- `IDXMACA_LLM_MODE=auto` → LLM live bila `OPENROUTER_API_KEY` ada, selain itu template.

### Docker

```bash
cp .env.example .env   # isi key bila mau live
make docker            # web :3000, core :8788, store :8787
```

## 4. Model & peran agen

Satu model untuk semua peran — `meta/muse-spark-1.3` via OpenRouter (`POST /v1/chat/completions`) — dibedakan
`reasoning_effort`, `temperature`, dan prompt:

| Peran | Effort | Tugas |
|---|---|---|
| Router | low | query → playbook + intent + deteksi chat bebas |
| Planner | high | DAG node, fetch-sharing, estimasi kredit via `store.lookup` |
| Compiler NL→`where` | medium | screener terstruktur (1 kredit) alih-alih NL `q` (3 kredit) |
| Writer panel | medium | narasi per panel + pilihan visual (whitelist chart) |
| Writer L3 | **xhigh** | memo 3 lensa + follow-up |
| Judge bahasa | low | lapis 2 kepatuhan |
| Memory | low | pemadatan konteks sesi |

Semua panggilan tercatat di tabel `llm_calls` (peran, model, effort, token, biaya) dan tampil di UI.

## 5. Sectors Call Store (ringkas)

| Kemampuan | Implementasi |
|---|---|
| Kunci kanonis | `SHA256(method \| path_norm \| params_norm)`, alias disatukan (`bbca`=`BBCA`), sections di-sort |
| Validasi sebelum lookup | clamp broker/foreign-flow ≤14 hari, daily/indeks ≤90 hari; request invalid = 400 gratis, tidak jadi cache sampah |
| TTL | helper 7 hari · report/screener 24 jam · quarterly imutabel · EOD harian · event append-only |
| Negative caching | 404 disimpan 6 jam; 4xx/5xx/429 tidak disimpan |
| Single-flight | 3 agen minta key yang sama saat miss → 1 tembakan |
| Provenans | tiap respons membawa `source`, `fetched_at`, `credits_spent`, `cache_key` → diteruskan ke evidence ledger |
| Stats | `GET /v1/store/stats`: hit-rate, kredit dipakai/dihemat, top keys (bahan demo) |

## 6. UI (purpose-built, bukan chat generik)

- **Rencana agen** di muka: intent count, node fetch, estimasi `X Store-hit + Y live ≈ Z kredit`, 5 gelombang, tombol Approve.
- **Render progresif** lewat SSE: L0 strip → panel P1–P8 terisi saat nodenya selesai → memo L3.
- **8 panel domain**: Snapshot/Valuasi · Kinerja/Segmen · Pasar/Momentum · Flow/Kepemilikan · Event/Governance · Peer/Sektor · Tambang/Regional · Risiko.
- **Tabel comps heatmap, timeline, checklist, gauge, peta titik, donut** — ECharts untuk chart, HTML/JSX untuk tabel (siap XLSX).
- **Evidence drawer**: klik angka/`ev-0xx` → endpoint + parameter + waktu tarik + status store/live + nilai mentah.
- **Export**: XLSX (per panel + sheet Evidence), DOCX (memo + tabel), PDF (halaman print).
- **Sesi**: daftar sesi, lanjut lintas reload, konteks entitas terlihat di composer.
- **Kepatuhan terlihat**: badge "semua angka terlacak ke ledger", "tanpa bahasa rekomendasi", disclaimer di setiap output.

## 7. Eval

```bash
make test     # unit test Store (23) + Core (28)
make eval     # 20 pertanyaan baku end-to-end → skor
```

`make eval` menjalankan 20 pertanyaan (ID/EN, typo ticker, emiten suspensi, tambang, SGX, chat bebas, follow-up multi-turn)
dan memeriksa: intent tepat, run selesai, panel tidak kosong, verifier angka & bahasa lolos, bukti ada, kredit dalam budget.
Terakhir: **20/20 (100%)** di mode fixture.

## 8. Skrip demo 3 menit

1. **0:00 Hook** — buka UI, ketik pertanyaan bank 3 emiten. Tunjukkan **rencana + estimasi kredit** sebelum satu kredit pun keluar.
2. **0:30 A-Playbook** — Approve. Tunjukkan L0 + panel valuasi/kinerja mengisi progresif; klik satu angka → evidence drawer (endpoint, params, fetched_at, Store-hit 0 kredit).
3. **1:15 B-Playbook** — ketik "comps 6 peer bank…" → tabel + export XLSX; tunjukkan sheet Evidence berisi sumber per angka.
4. **1:50 C-Playbook** — "scan red-flag 10 debitur" → gauge + checklist aturan terpicu (ekuitas negatif, suspensi, insider jual) dengan bukti.
5. **2:30 Trust & memory** — follow-up "tambahkan DBS" → jawaban memakai konteks sesi; tunjukkan badge verifier + disclaimer.
6. **2:45 Tutup** — Store stats: "cabut Sectors = produk mati; cabut Store = kredit habis."

## 9. Keputusan desain yang bisa diuji

- Fixture mode = nol kredit → semua pengembangan UI/eval tidak membakar kuota.
- Estimasi kredit selalu tampil di tombol persetujuan (satu klik). Bila estimasi melebihi budget run, tombol yang sama memberi tahu dan tetap menjalankan atas persetujuan eksplisit; API tetap menolak (`409 over_budget`) tanpa `force=true`.
- Akuntansi kredit mengikuti tabel resmi docs (1/2/3, per section/kuartal/halaman/tipe) — lihat `docs/CREDITS.md`; biaya final dihitung dari respons aktual, bukan hanya estimasi.
- Endpoint internal yang belum dipetakan ke path resmi Sectors **gagal-tertutup** saat live (0 kredit, bukan 404 berbiaya). Padanan path ada di `apps/store/app/live_routes.py`.
- `IDXMACA_CREDIT_START` mengisi chip "sisa kredit" (default 1000; isi dari portal hackathon — Sectors tidak menyediakan endpoint saldo).
- Angka di memo tidak bisa "nyelip": verifier membandingkan token angka di teks dengan nilai ledger (toleransi = 1% atau setengah digit terakhir yang ditampilkan).
- Bahasa rekomendasi diblokir di dua lapis (regex + judge), disclaimer otomatis.

## 10. Peta jalan (di luar scope lomba)

- Scheduler cache-warm untuk query ≥20 intent (Q1–Q5) agar memo komite pagi tiba sebelum jam 08:00.
- Tambang lebih dalam (cadangan per provinsi, kontrak owner–kontraktor), KLSE flow, multi-user workspace tim.
- Backtest sinyal red-flag, alert real-time, mobile.

## 11. Catatan data

Semua angka di mode fixture adalah **data ilustrasi** yang dihasilkan `tools/gen_fixtures.py` (deterministik).
Bukan data pasar nyata. Untuk data nyata, jalankan mode live dengan `SECTORS_API_KEY`.

Produk ini alat informasi/analisis, **bukan rekomendasi investasi**; tidak ada eksekusi order atau koneksi broker.