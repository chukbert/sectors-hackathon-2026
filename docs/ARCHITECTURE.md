# ARCHITECTURE — IDXMACA dengan LLM `meta/muse-spark-1.3` via OpenRouter

> Produk: **IDX Multi Agent Consulting Assistant (IDXMACA)**. Dokumen induk: `PRD.md`, `INTENT-OUTPUT.md`, `STORE.md`.
> Keputusan LLM: **satu model untuk semua peran agen** — `meta/muse-spark-1.3` lewat OpenRouter Chat Completions
> (`POST https://openrouter.ai/api/v1/chat/completions`), dibedakan via `reasoning_effort`, `temperature`, dan system prompt.
> Full reasoning (`xhigh`) hanya untuk tugas yang butuh penalaran dalam; tugas murah pakai effort rendah.

## 1. Keputusan Arsitektur Kunci

1. **Satu model, banyak peran.** Router, planner, compiler, writer, judge memakai model yang sama; yang beda hanya
   `reasoning_effort` (low/medium/high/xhigh), `temperature`, dan prompt. Alasan: 7 hari build, satu integrasi, perilaku konsisten.
2. **LLM tidak pernah menyentuh Sectors langsung.** Semua data lewat Store Service read-through (`STORE.md`).
3. **LLM tidak pernah menghitung.** Semua angka dari compute deterministik (Python); LLM hanya menarasikan + memilih visual.
4. **Semua output terstruktur.** Planner, compiler, dan writer memakai `response_format` JSON (json_schema) agar bisa divalidasi kode.
5. **Kunci API tidak pernah ke frontend.** `OPENROUTER_API_KEY` dan Sectors key hanya sebagai env di backend/Store Service.

## 2. Topologi Layanan

```
                    ┌──────────────────────────────┐
                    │  Web UI (Next.js)            │
                    │  input, 8 panel §8, drawer   │◄── SSE: status panel progresif
                    └──────────────┬───────────────┘
                                   │ HTTPS/JSON
┌──────────────────────────────────▼───────────────────────────────────┐
│ API Backend (FastAPI) "idxmaca-core"                                 │
│ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ ┌───────┐ ┌─────┐ │
│ │ Router   │→│ Planner  │→│ Executor  │→│Compute │→│Verify │→│Write│ │
│ │(agen)    │ │(agen)    │ │(kode)     │ │(kode)  │ │campur │ │(agen)│ │
│ └──────────┘ └──────────┘ └─────┬─────┘ └────────┘ └───────┘ └─────┘ │
│        │             │          │  store.fetch / store.lookup        │
│        └─────────────┴──────────┼── LLM Gateway (OpenRouter client) │
└────────────────────────────────┼───────────────────────────────────┘
                                 │                    ▲ POST /v1/chat/completions
              ┌──────────────────▼─────────┐          │ model: meta/muse-spark-1.3
              │ Store Service (FastAPI)    │          │ Header: Authorization,
              │ SQLite→Postgres, TTL,      │          │ HTTP-Referer, X-Title
              │ single-flight, stats       │──────────┘
              └──────────┬─────────────────┘
                         │ (API key Sectors hanya di sini)
                         ▼
                  api.sectors.app (+ fixtures saat dev)
Scheduler (P2/roadmap, internal): pemanasan cache + invalidate TTL → menulis ke Store.
```

## 3. LLM Gateway (satu-satunya pintu ke OpenRouter)

- **Endpoint & auth:** `POST https://openrouter.ai/api/v1/chat/completions`, header `Authorization: Bearer $OPENROUTER_API_KEY`
  (+ `HTTP-Referer` dan `X-Title` IDXMACA sesuai praktik OpenRouter). Key dari env, tidak pernah ke klien.
- **Kemampuan model yang dipakai** (terkonfirmasi dari halaman model): `messages`, `tools`, `tool_choice`,
  `response_format`, `temperature`, `top_p`, `top_k`, `max_tokens`, `stream`, `reasoning`, `reasoning_effort`.
- **Reliabilitas:** timeout 60–120 dtk (xhigh boleh lama), retry 3× dengan backoff untuk 429/502
  (502 upstream = tidak ditagih; 402/403 = stop + pesan jujur, bukan retry).
- **Akuntansi biaya:** catat `usage.{prompt_tokens, completion_tokens, cost}` tiap panggilan ke tabel `llm_calls`
  (peran, run_id, effort) → tampil di panel rencana berdampingan dengan estimasi kredit Sectors.
- **Fallback berlapis bila gagal:** (1) ulangi effort sama, (2) turunkan effort satu tingkat, (3) kembalikan error jujur
  + hasil parsial yang sudah ada. Tidak ada fallback yang mengarang data.

## 4. Peran Agen × Konfigurasi Model

| Peran | Tugas | `reasoning_effort` | `temperature` | Output |
|---|---|---|---|---|
| Router | query → {persona, playbook, DAG intent-output} | low | 0 | JSON strict |
| Planner | DAG → tool calls + estimasi kredit (via `store/lookup`) | high | 0 | JSON strict |
| NL→`where` Compiler | Bahasa Indonesia → query screener terstruktur + whitelist field | medium | 0 | JSON strict |
| Writer L1/L2 | narasi panel + judul pesan chart | medium | 0.2 | JSON (narasi + chart spec) |
| Writer L3 | sintesis memo multi-intent + risiko + disclaimer | **xhigh** | 0.2 | JSON (memo + sitasi) |
| Judge bahasa | cek bahasa rekomendasi (lapis 2 setelah filter kode) | low | 0 | JSON {pass, temuan} |
| Memory | ringkas memo → snapshot + diff antar kuartal | low | 0 | JSON |

- `xhigh` hanya untuk **Writer L3** (sintesis Q1–Q5, §9) dan Planner pada query ≥20 intent — di situlah penalaran dalam terbayar.
- Semua peran grounding: system prompt melarang angka tanpa `evidence_id`, melarang kata Buy/Sell/Hold/target-price.

## 5. Tool Calling & Structured Output

- Agen **tidak** memanggil Sectors sebagai tool. Tool yang didaftarkan ke model (`tools`) adalah fungsi backend:
  `store_lookup`, `store_fetch`, `compute_*`, `memory_read/write`, `chart_spec_validate`.
- Planner dan compiler memakai `response_format: json_schema` (skema DAG, skema `where`) → divalidasi kode sebelum dieksekusi.
  Validasi gagal = perbaiki via 1× retry model, lalu tolak dengan pesan jujur (tidak pernah dieksekusi buta).
- `stream: true` dipakai Writer agar UI terisi progresif per panel (§8.1 butir 4); peran JSON memakai non-streaming.

## 6. Alur Run (interaktif vs terjadwal)

**Interaktif (1 query, <15 intent):**
input → Router (low) → Entity Resolver (kode: ticker/slug, hindari 404) → Planner (high + `lookup`)
→ tampilkan estimasi ("9 Store + 3 live ≈ 5 kredit", biaya LLM $x) → Approve
→ Executor paralel (`fetch`, single-flight) → Compute → Evidence ledger
→ Verifier (kode: angka vs ledger; judge: bahasa) → Writer (medium/xhigh) → SSE render L0→L1→L2 → export.

**Terjadwal / cache-warm (Q1–Q5, ≥20 intent; pola P2):** Scheduler → Planner (xhigh) → `fetch` massal (miss tersimpan) → memo + 8 panel
→ snapshot di Store; di MVP pola DAG yang sama dijalankan interaktif dengan approval.

## 7. Compute Deterministik (di luar LLM)

`yoy, cagr, margin, roe/roa, dscr/icr, der, current_ratio, median_peer, zscore, adv, foreign_share,
konsentrasi_broker, dilusi_rights, posisi_vs_band, delta_memo` — Python murni, unit-tested, tiap hasil
membawa `evidence_id` → endpoint + params + `fetched_at` (+ `source: store-hit|sectors-live` dari `STORE.md`).

## 8. Verifier & Kepatuhan (dua lapis)

1. **Lapis kode (penentu):** setiap angka wajib ada di ledger (toleransi pembulatan eksplisit); filter regex frasa
   rekomendasi (beli/jual/hold/tahan/target price/cuan/pasti naik); suntik disclaimer otomatis.
2. **Lapis Judge LLM (low effort):** baca ulang nada tulisan; `fail` → Writer revisi 1×, gagal lagi → kirim versi fakta-saja.
3. Larangan keras tetap: eksekusi order, koneksi broker, janji return.

## 9. Memory, UX, dan Export

- **Memory:** tabel `memo_snapshots(ticker, periode, ringkasan_json, llm_model, created_at)`; diff = kode (angka) + ringkasan LLM (low).
- **UX:** peta langsung ke `INTENT-OUTPUT.md` §8 — L0 strip → 8 panel hero → L2 accordion → L3 appendix; tiap visual:
  judul pesan + sumber/tanggal (klik → drawer) + `fetched_at` (tahu dari cache jam berapa).
- **Export:** DOCX/PDF = L0 + 8 hero; XLSX = tabel mentah + sumber per sheet (§8.3).
- **Charts:** Apache ECharts via `echarts-for-react` — import per-chart dari `echarts/core` (line, bar, scatter, heatmap,
  treemap, sankey, gauge, graph, map + geo), bungkus `next/dynamic` (`ssr:false`) + `transpilePackages: ['echarts','zrender']`,
  satu tema IDXMACA bersama (palet §7, format Rp id-ID, judul = pesan), `getDataURL` untuk PNG ke export DOCX/PDF.
  Tabel comps/heatmap, timeline, dan checklist tetap HTML/JSX murni (lebih terbaca + siap XLSX).

## 10. Layout Repo & Deploy (monorepo, Docker Compose)

```
idxmaca/  apps/web (Next.js)  apps/core (FastAPI: router/planner/executor/compute/verify/write)
          apps/store (FastAPI: fetch/lookup/invalidate/stats)  packages/prompts (system prompt per peran)
          packages/evals (20 pertanyaan baku)  fixtures/sectors/*.json  docs/ (PRD, INTENT-OUTPUT, STORE, INNOVATION)
```

- Lokal/demo: `docker compose up` → web + core + store (SQLite seed fixtures, mode offline tersedia).
- Rahasia: hanya via env (`OPENROUTER_API_KEY`, `SECTORS_API_KEY` di store saja); repo bersih dari key (syarat submission).

## 11. Anggaran Biaya & Evaluasi

- **Biaya LLM:** dibatasi per run (cap token per peran; xhigh hanya 2 peran); tampil di UI berdampingan dengan kredit Sectors.
- **Kredit Sectors:** target memo ≤30 (PRD §11); mega-query via scheduler + cache; `store/stats` ("hit rate, kredit dihemat") jadi bahan demo.
- **Eval:** 20 pertanyaan ID/EN (typo ticker, emiten suspensi, tambang, SGX) → skor: intent tepat, angka cocok ledger,
  tanpa bahasa rekomendasi, biaya dalam budget. Target 90%+.

## 12. Yang Harus Diverifikasi Saat Build (risiko kecil, catat di sini)

1. Nilai enum `reasoning_effort` yang diterima provider untuk model ini (`xhigh`/`high`/`medium`/`low`) + default bila tak diisi.
2. Batas konteks & `max_tokens` praktis model ini (ukur dengan fixtures report 8 section).
3. Harga per-token aktual (halaman model) untuk kalibrasi cap budget.
4. Perilaku `response_format: json_schema` + `tools` dipakai bersamaan (uji; bila rewel, pisahkan: planner JSON tanpa tools).

## 13. Diagram Khusus: Run 38 Intent Penuh (Q1) — intent ≠ agen

> Prinsip: **38 intent = apa yang disajikan, bukan berapa agen yang jalan.**
> Tiga penyusutan berlapis: intent → fetch unik (dedup + fetch-sharing) → worker terbatas → panel → 1 sintesis.

```
QUERY: 1 kalimat ("paket komite pagi..." = Q1, INTENT-OUTPUT §9)
  │
  │ 1× Router LLM (low) → {persona CIO, playbook komite, 37 intent}
  ▼
PLANNER (1× LLM high/xhigh)
  │ ① expand tiap klausa → intent  ② dedup + fetch-sharing  ③ lookup Store per node
  │ Output ke user: "37 intent → 27 fetch unik → 19 Store-hit + 8 live ≈ 34 kredit" → APPROVE
  ▼
FETCH PLAN = 27 node DAG, dieksekusi 6 WORKER paralel (semaphore + single-flight + budget guard)
  │ Gelombang 1 · L0 (eksekutif dulu) : universe close, index/cap, movers, foreign universe, top rank
  │ Gelombang 2 · Snapshot            : report sections ×3 emiten, quarterly ×3, quarterly dates
  │ Gelombang 3 · Flow                : broker summary/top ×ticker, foreign per-simbol, registry/top brokers
  │ Gelombang 4 · Event               : corporate actions + calendar, filings, suspensions, news
  │ Gelombang 5 · Spesialis           : screener, subsector report, mining ×5, SGX/KLSE dossier + flow
  ▼
COMPUTE (kode murni, sinkron) → EVIDENCE LEDGER (nilai → endpoint + params + fetched_at + store-hit/live)
  ▼
8× PANEL WRITER (paralel, effort medium) → VERIFY (kode penentu + judge low)
  ▼
1× WRITER L3 (xhigh) → MEMO 3 LENSA + DISCLAIMER → SSE progresif L0→L1→L2 → EXPORT
```

### 13.1 Peta fetch-sharing (bukti 37 intent tidak butuh 37 tembakan)

| Fetch (1 tembakan) | Menghidupi intent |
|---|---|
| `company/report` ×3 emiten (sections: overview, valuation, financials, dividend, management, ownership, peers) | IO-01,02,03,05,06,07,08 |
| Quarterly financials ×3 + quarterly dates | IO-03,04,10 |
| Screener terstruktur + top ranked + top growth + free float + helpers | IO-11,12,13,14,15 |
| Universe close + index/cap + movers + most-traded + daily ×ticker | IO-16,17,18,19 |
| Broker summary/top ×ticker + foreign universe/per-simbol + registry/top brokers + activity 2 broker | IO-21,22,23,24 |
| Corp actions ×ticker + calendar + filings + suspensions + news | IO-25,26,27,28 |
| Subsector report + mining (dossier, ownership, site, komoditas, lisensi) | IO-29,30,31,32,33,34 |
| SGX/KLSE dossier + SGX short/buyback/filings/news | IO-35,36 |
| Rule engine + agregasi daftar emiten (kode, tanpa fetch baru) | IO-38 |

### 13.2 Akuntansi satu run penuh (contoh Q1, cache hangat)

- Panggilan LLM: **14** (1 router + 1 planner + 1 compiler + 8 panel writer + 1 L3 + 1 judge + 1 memory) — bukan 38.
- Tembakan live Sectors: **~8** (snapshot harian + news/filings `since`); sisanya Store-hit.
- Kredit: **~30–40** (vs ~100+ tanpa Store) — sesuai target PRD §11.
- Ketergantungan dihormati: peer set (IO-11) sebelum comps (IO-08); `report_date` (IO-10) sebelum quarterly;
  gelombang gagal → panel terkait jadi empty-state jujur (kill-switch), 7 panel lain tetap tayang.

## 14. Memori Sesi Percakapan (wajib hukumnya)

> Setiap panggilan chat **wajib** menyertakan input dan output chat sebelumnya sebagai input chat berikutnya.
> Ditegakkan di kode (bukan imbauan): satu-satunya pintu ke model adalah chat gateway yang selalu merakit konteks sesi —
> peran agen tidak bisa memanggil model tanpa melewatinya.

### 14.1 Yang disimpan per turn

`tchat_turns(session_id, seq, role, text, intent_ids[], evidence_ids[], model, effort, tokens, created_at)` —
user dan assistant sama-sama disimpan lengkap (bukan ringkasan saja), beserta intent dan evidence yang dipakai turn itu.

### 14.2 Rakitan konteks (urutan tetap)

1. System prompt peran + aturan grounding (angka hanya dari ledger, tanpa rekomendasi).
2. **Rolling summary** sesi (hasil pemadatan turn lama — §14.3).
3. **N turn terakhir verbatim** (default 10;IO-39 dan klarifikasi pendek selalu ikut agar "yang tadi" tidak hilang).
4. **State entitas sesi**: daftar emiten (`session.tickers`), perbandingan yang sedang berjalan, flag yang sudah dibahas,
   pertanyaan terbuka, preferensi bahasa — diekstrak tiap turn (resolver + model low).
5. **Pointer ledger**: evidence_id yang relevan (bukan seluruh raw JSON) agar verifier tetap bisa menelusuri angka lama.
6. Pesan baru user.

### 14.3 Pemadatan (compaction) saat mendekati budget

- Budget sejarah dikonfigurasi (default: sisakan ruang untuk N turn verbatim + respons; selebihnya diringkas).
- Peringkas = model low-effort dengan instruksi eksplisit mempertahankan: keputusan yang diambil, **angka + evidence_id**,
  item belum terjawab, koreksi user ("maksud saya..."), dan preferensi.
- Ringkasan ditulis ke `chat_sessions.summary` tiap K turn; turn mentah tetap tersimpan di DB untuk audit/transkrip.

### 14.4 Aturan perilaku yang dijamin memori ini

- Pronomina dan elipsis terpecahkan: "tambah DBS", "bandingkan dengan yang tadi", "yang kedua maksudnya apa" —
  diuji di eval multi-turn (wajib lolos agar rilis).
- Koreksi user menimpa fakta lama (state entitas di-update, bukan ditumpuk) dan dicatat sebagai revisi.
- Sesi bisa dilanjutkan lintas reload (resume by `session_id`); daftar sesi + export transkrip tersedia di UI.
- Isolasi: memori per sesi per user; tidak bocor antar sesi (berbagi tim = opt-in, P2).

### 14.5 Paritas mockup

Chip "Konteks sesi: BBCA, BMRI, BBRI" di composer = state entitas yang terlihat; jawaban follow-up yang diawali
"Mengingat konteks sesi (...)" adalah IO-39 yang membaca §§14.2–14.3 — perilaku ini yang dieval, bukan sekadar tempelan teks.
