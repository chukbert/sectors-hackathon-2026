# ARSITEKTUR INVESTIGRAPH — satu gambar

**Cara membaca:**
- Garis tebal (`==>`) = alur utama yang mengikat biaya/persetujuan · garis putus-putus (`-.->`) = fallback/opsional/digest.
- Angka "kr" di level = estimasi dingin; cap keras ada di Credit Governor.
- Semua jalur ke LLM lewat Capability Registry; semua tembakan Sectors lewat Resolver (cache-first) dan tercatat di API Hit Store.

```mermaid
flowchart TD
  subgraph USER["USER"]
    q["Pertanyaan bebas / tempel rumor / konteks dana-horizon"]
    mode["Toggle bahasa: Pemula / Menengah / Advanced · 0 kr"]
  end

  subgraph IN["GERBANG INPUT · kode + Jev"]
    rule["Aturan kode: ticker, klaim, bandar, valuasi, jumlah emiten · jadi min/plafon level"]
    guardin["Jev #2 Guardrail input · L7-L10 · prompt-injection, klaim berbahaya"]
    classif["Jev #1 Level classifier Choice(10) + Noul · level = max(aturan, Jev)"]
  end

  subgraph GOV["CREDIT GOVERNOR · satu pintu biaya"]
    govplan["Plan preview: capability + endpoint + window + estimasi kr"]
    govcap["Cap: L1-2 = 2 · L3-4 = 8 · L5-6 = 16 · L7-8 = 24 · L9 = 40 · L10 = 70"]
    govgate["Gate: lebih dari 6 kr konfirmasi · L9-L10 per fase · tawaran naik/turun level"]
    govledger["Ledger kredit dari api_hits · fail-safe menipis: cache-only + label tanggal"]
  end

  subgraph LV["10 LEVEL · cakupan berubah, masteri konstan"]
    direction LR
    l1["L1 Fakta Tunggal · 0-1 kr · Jev 0"]
    l2["L2 Fakta+Makna · 0-2 kr · Jev 1"]
    l3["L3 Ringkasan Terarah · 2-4 kr · Jev 2"]
    l4["L4 Turunan dan Tren · 3-7 kr · Jev 2"]
    l5["L5 Perbandingan Sejajar · 6-12 kr · Jev 3"]
    l6["L6 Fundamental Menyeluruh · 8-16 kr · Jev 4"]
    l7["L7 Verifikasi Klaim / Anti-Rumor · 10-18 kr · Jev 5"]
    l8["L8 Bandarmologi · 12-22 kr · Jev 6"]
    l9["L9 Valuasi dan Skenario · 15-28 kr · Jev 8"]
    l10["L10 Riset Keputusan Menyeluruh · 25-50 kr cap 70 · Jev 8-10 · 3 fase"]
  end

  subgraph AGENT["LLM AGENT · OpenRouter · 8 peran"]
    digest["Digest ketersediaan: TERSEDIA / KOSONG per emiten · 0 kr · dibuat kode, bukan LLM"]
    plan["1 Planner: rencana langkah + pemilihan capability"]
    compile["5 Argument Compiler: NL jadi argumen terketik + where terstruktur"]
    narr["2 Narrator: Bahasa Indonesia per level dan mode"]
    devil["3 Devil's advocate · L7+"]
    retry["4 Repair: tulis ulang saat kritik Jev menolak"]
    memory["6 Memory Curator: tulis/recall fakta, tesis, profil"]
    guide["7 Interactive Guide: bantu rumuskan pertanyaan + jelaskan biaya"]
  end

  subgraph CAPREG["CAPABILITY REGISTRY · satu-satunya interface LLM (endpoint mentah internal)"]
    direction LR
    cap1["get_fact · get_series · get_report_section"]
    cap2["compare · screen · rank · sector_rotation"]
    cap3["broker_flow · foreign_flow · ownership"]
    cap4["dividend_events · calendar · filings_news"]
    cap5["valuation_scenario · mining_commodity · index_rotation"]
    cap6["verify_claim · battery adversarial"]
  end

  subgraph RES["RESOLVER CACHE-FIRST · mayoritas jalur 0 kr"]
    direction LR
    res1["1 Memory fakta · fact_memory"]
    res2["2 Cache persis · fresh / immutable"]
    res3["3 Turunan atau slice superset · dihitung kode"]
    res4["4 Near-miss · cache + label + tawaran refresh"]
    res5["5 Miss · live + cost gate"]
  end

  subgraph STORE["API HIT STORE · SQLite + blobs gzip · data/ gitignored"]
    direction LR
    t_hits["api_hits · endpoint, params, status, kr, cache_status, durasi"]
    t_cache["cache_entries · payload gz, TTL, covers_from-to, immutable, negative 404"]
    t_fact["fact_memory · entity.metric.as_of, nilai, provenance, confidence"]
    t_sess["sessions + turns + memory_items · ledger semua turn, memory lintas sesi"]
    t_mode["Mode: REPLAY=1 · LIVE=1 · HYBRID"]
  end

  subgraph API["SECTORS API v2 · 54 endpoint IDX + Mining = 13 domain · SGX/KLSE di luar scope"]
    direction LR
    d1["Harga dan Likuiditas · daily, most-traded, free-float, suspensions, shareholders"]
    d2["Fundamental dan LK · report financials, quarterly, company-segments"]
    d3["Valuasi · report valuation/peers/future"]
    d4["Dividen dan Aksi Korporasi · report dividend, corporate-actions"]
    d5["Bandarmologi · broker-summary(+top), broker-activity(+top), brokers/top, registry"]
    d6["Foreign Flow dan Kepemilikan · foreign-flow(+universe), shareholders(+composition)"]
    d7["Discovery dan Screening · companies where/q, top-changes, helpers"]
    d8["Komoditas dan Mining · commodities/price, mining financials/performance, licenses, contracts"]
    d9["IPO dan Listing · listing-performance, report emiten baru"]
    d10["Kalender dan Event · quarterly-dates, corporate-actions, filings, news, suspensions"]
    d11["Sektor dan Indeks · index-daily, idx-total, sector-report, foreign-flow universe"]
    d12["Klaim dan Rumor · lintas domain · battery adversarial"]
    d13["Tag dan Klasifikasi · tags, industries, subindustries, subsectors"]
  end

  subgraph JEV["JEV · 13 posisi · sekitar 0,001 USD per sesi"]
    direction LR
    j1["#1 Level classifier + intent · semua level"]
    j2["#2 Guardrail input · L7-L10"]
    j3["#3 Preflight kecukupan data · L5, L6, L8-L10"]
    j4["#4 Composite scorer · L4-L10"]
    j5["#5 Battery klaim/broker · L7-L10"]
    j6["#6 Verifier sitasi · L3-L10"]
    j7["#7 Kritik narasi · L4-L10"]
    j8["#8 Compliance fail-closed · L4-L10"]
    j9["#9 Pairwise judge · L5, L9, L10"]
    j10["#10 Pemeriksa asumsi · L9, L10"]
    j11["#11 Ranker prioritas · L8-L10"]
    j12["#12 Ekstraktor tesis ke memory · L9, L10"]
    j13["#13 Pemeriksa kelengkapan · L3, L10"]
  end

  subgraph OUT["OUTPUT CONTRACT · lantai minimum per level"]
    direction LR
    o1["L1-L2 · angka/arti + as_of + sumber + disclaimer"]
    o2["L3-L4 · poin + tabel + skor + limitasi + sitasi"]
    o3["L5-L6 · tabel apple-to-apple + skor per dimensi + red flags"]
    o4["L7 · verdict + probabilitas + klaim-vs-bukti"]
    o5["L8 · verdict pola + tabel broker + window + metode (inferensi)"]
    o6["L9 · matriks skenario + asumsi + sensitivitas + trap risk"]
    o7["L10 · dossier 8 lapis + kalibrasi + kalender pemantauan + audit"]
  end

  note["Billing Sectors: 2xx = biaya endpoint · 404 = 1 kr (negative cache 7 hari) · 400/429/5xx = 0 · hasil kosong 200 = tetap ditagih"]

  q --> rule
  mode -.-> narr
  rule --> guardin
  guardin --> classif
  classif ==>|"level + profil"| govplan
  govplan --> govcap
  govcap --> govgate
  govgate ==>|"disetujui"| plan
  govgate -.->|"tawaran adaptif naik level"| classif
  classif -.->|"menentukan cakupan + posisi Jev"| LV
  LV -.->|"kontrak output minimum"| OUT
  digest -.->|"rencana sadar-ketersediaan"| plan
  t_sess -->|"ledger semua turn / memory-only jika sesi baru"| plan
  guide -.->|"bantu rumuskan pertanyaan"| q
  plan --> compile
  compile --> CAPREG
  CAPREG --> res1
  res1 -.->|"tidak ada di memory"| res2
  res2 -.->|"tidak ada / kedaluwarsa"| res3
  res3 -.->|"tidak bisa diturunkan"| res4
  res4 -.->|"perlu segar / belum ada"| res5
  res1 & res2 & res3 & res4 -->|"0 kr"| STORE
  res5 -->|"live · biaya sesuai billing"| API
  API -->|"tulis payload + ekstraksi fakta"| STORE
  STORE -->|"nilai + provenance + label sumber-as_of-cache_key"| JEV
  API -->|"hasil live"| JEV
  JEV -->|"lolos"| narr
  j8 -.->|"blokir fail-closed"| retry
  j5 -.->|"butuh adversarial"| devil
  devil --> narr
  retry --> plan
  narr --> OUT
  JEV --> OUT
  narr -->|"ringkas sesi"| memory
  memory -->|"tulis fakta + tesis"| t_fact
  memory -.->|"recall lintas sesi"| digest
  STORE -.->|"digest 0 kr"| digest
  t_hits -.->|"sisa kredit real-time"| govledger
  STORE -.->|"audit trail tiap angka"| OUT
  note -.- res5
```

**Cakupan gambar:** 10/10 level · 13/13 domain (54 endpoint) · 13/13 posisi Jev · **7/7 peran LLM** (+ digest kode) · 5/5 tangga resolver · **5/5 tabel store** · 7/7 kontrak output.

**Detail output ke user:** lihat [`OUTPUT-LAYER.md`](./OUTPUT-LAYER.md) — kontrak `AnswerDoc` + Visual Registry + komposisi visual per level & per domain (dark-first, motion, drill-down cache-first, ekspor PNG).

**Riwayat & memory:** lihat [`SESSION-MEMORY.md`](./SESSION-MEMORY.md) — dalam sesi: semua turn wajib jadi konteks; sesi baru: hanya memory, tanpa transkrip lama.

**Bentuk produk: chatbot murni** — input teks → jawaban. Tidak ada watcher, scheduler, atau pesan otonom di luar sesi.

---

## Peta peran LLM vs 6 syarat Track 01 (final, dikunci 21 Sep)

### 6 syarat lomba → bukti di arsitektur

| Syarat Track 01 | Bukti di arsitektur | Digerakkan oleh |
|---|---|---|
| Multi-step reasoning flows | dekomposisi → capability → verifikasi Jev → sintesis (L6–L10); preflight & citation check | LLM Planner + Jev (choice) |
| Custom tool-use pipelines | Capability Registry (bukan endpoint mentah) + Argument Compiler + Resolver | LLM Planner + Compiler, kode resolver |
| Routing between data sources | pilih 13 domain/capability; 5 tangga sumber (memory/cache/turunan/near-miss/live) | LLM pilih capability; kode pilih sumber |
| Memory / state management | `fact_memory` + `cache_entries` + digest + state sesi (level, ledger, fase) | Memory Curator (LLM) + kode |
| Autonomous task execution | eksekusi multi-langkah otonom dalam satu turn: Planner menjalankan langkah, Repair otomatis saat Jev menolak, eskalasi level adaptif + fail-safe | Planner + Repair + Governor (kode) |
| Purpose-built interface | Next.js UI + Interactive Guide + toggle 3 bahasa + ledger/audit transparan | LLM Guide + Narrator |

### Peran LLM final: 7 peran

| # | Peran | Fungsi | Syarat | Level aktif | Penjaga |
|---|---|---|---|---|---|
| 1 | **Planner** | pecah pertanyaan → langkah + capability + kondisi berhenti | multi-step | L4–L10 | Jev preflight |
| 2 | **Narrator** | narasi Bahasa Indonesia per level; **3 varian sekaligus** (pemula/menengah/advanced), angka via placeholder diisi kode; sintesis dossier | interface | L2–L10 | Jev kritik narasi + verifier (per varian) |
| 3 | **Devil's advocate** | argumen lawan & pembalik tesis | multi-step | L7–L10 | Jev battery |
| 4 | **Repair** | tulis ulang saat kritik/compliance Jev menolak | multi-step | L4–L10 | Jev compliance (fail-closed) |
| 5 | **Argument Compiler** | NL → argumen capability terketik: tanggal ("2 minggu terakhir"), simbol, `where` terstruktur | tool-use | L3–L10 | validasi schema zod |
| 6 | **Memory Curator** | tulis fakta/tesis/profil ke `fact_memory` + recall lintas sesi | memory | L6–L10 | Jev #12 + provenance wajib |
| 7 | **Interactive Guide** | bantu user merumuskan pertanyaan, tempel rumor, jelaskan biaya level | interface | L1–L10 (pra-query) | aturan + template |

Catatan: **Digest ketersediaan bukan LLM call** — dihasilkan kode dari store (deterministik, 0 kr), lalu disuntik ke prompt. **Narrator menulis 3 varian per jawaban** (placeholder `{{fact:id}}` diisi kode per mode) → toggle bahasa di klien instan, tanpa API/LLM/Jev lagi; satu varian gagal Jev → hanya varian itu di-Repair.

### Sengaja BUKAN peran LLM

- Digest ketersediaan → kode (deterministik, 0 kr).
- Routing sumber/cache (memory→cache→turunan→live) → resolver kode.
- Aritmetika & tanggal → kode (anti-halusinasi).
- Skor & verdict → Jev choice.
- Verifikasi sitasi & compliance → Jev choice (fail-closed).

> Jadwal realistis: L1–L2 sering tanpa LLM (template + memory), L3–L5 Planner+Narrator+Compiler, L6–L10 hampir seluruh peran aktif.

---

## Kebijakan verifikasi berlapis — hal-hal penting adalah ranah Jev

Prinsip: **LLM tidak pernah menjadi hakim outputnya sendiri.** Tiga lapis, dari yang paling murah & deterministik:

| Lapis | Memverifikasi | Contoh | Biaya |
|---|---|---|---|
| 1 · Kode | yang mekanis & bisa dibuktikan | angka ada di payload cache (path + nilai), aritmetika dihitung ulang, tanggal wajar, schema zod, as_of/kesegaran, satuan | 0 |
| 2 · **Jev (choice)** | yang semantik | klaim didukung/tidak + kekuatannya, narasi vs data, severity pola pompom, compliance aman/tidak, prioritas, kelengkapan, asumsi, pairwise | ~$0,0001/call |
| 3 · Fail-closed | keraguan pada hal sensitif | Jev ambigu → blokir / rumuskan ulang / turunkan klaim · tidak pernah lolos diam-diam | 0 |

Aturan:

1. **Verifikasi angka = kode dulu.** Jev hanya untuk klaim fuzzy yang tak bisa dicek mekanis.
2. **Jev = hakim hal penting** (verdict klaim, compliance, severity) — bukan LLM. Alasan: pilihan terbatas jadi tak bisa mengarang; ~63× lebih murah; ~200× lebih cepat; dan bukti riset: citation check menangkap angka karangan, pairwise judge 10/10 tanpa position bias.
3. **Confidence Jev tidak dipercaya mentah** (riset: buruk terkalibrasi) → **probabilitas L7 dihitung kode** dari agregat bukti (skor tertimbang → peta band yang dikalibrasi lewat test suite); Jev hanya memilih kategori kualitatif.
4. **LLM hanya drafting + repair**; setiap output wajib lulus Jev #6 (sitasi), #7 (kritik narasi), #8 (compliance) sebelum keluar.
5. **Semua keputusan Jev dicatat** (choice + criteria + waktu) → bagian dari audit trail yang dilihat juri.
6. **Batasan Jev dijaga di hulu**: multi-intent dipecah kode dulu; state yang dikirim disaring (hasil filter, bukan payload mentah).
7. **Ketergantungan provider**: endpoint Jev alpha gagal → retry → fallback LLM ber-rubrik ketat (ditandai "degraded"); khusus compliance tetap fail-closed.