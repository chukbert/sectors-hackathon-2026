# ideas.md — Flagship AI Agent untuk Track "AI Agents & Assistants"
### Sectors Hackathon 2026 (deadline submit: 30 Sep 2026, 23:59 WIB)

---

## 0. TL;DR

**Nama produk: ARUS** — asisten multi-agent yang bikin ritel Indonesia melihat *arus informasi, arus uang (broker & asing), dan arus kepemilikan (grup konglomerasi)* sebelum memutuskan beli/jual. Bukan sinyal, bukan advice: **"kalau kamu mau jadi ikan kecil, setidaknya jangan jadi umpan."**

**Problem statement (1 kalimat, siap pakai untuk submission):**
> "Investor ritel IDX (10+ juta akun) mengambil keputusan karena FOMO dari berita viral tanpa tahu siapa yang sebenarnya berada di balik saham, siapa yang membekingi transaksinya, dan seberapa berisiko posisi mereka — ARUS menjawabnya dengan agent yang menganalisis berita, aliran broker/asing, fundamental, dan graph kepemilikan konglomerasi dari data Sectors dalam satu alur percakapan."

---

## 1. Aturan main yang wajib dipatuhi (ringkasan dari rules)

| Gate / Kriteria | Bobot | Implikasi ke desain |
|---|---|---|
| Eligibility check (pass/fail): produk jalan end-to-end, **Sectors data = core**, onboarding semua anggota | — | Semua agent HARUS makan Sectors API/MCP. Kill test: cabut Sectors → produk mati. |
| **Real-world usability** | **40%** | ICP nyata & besar (ritel), masalah nyata (FOMO/panic selling), bisa dipakai *hari ini*, tanpa butuh integrasi sekuritas. |
| **Video demo & storytelling** | **30%** | Cerita emosional "ikan kecil vs bandar" + visual graph konglomerasi = demo paling Sinematik di track ini. |
| **Technical depth & execution** | **30%** | Custom multi-agent orchestration (planner → 5 agen spesialis → synthesizer → memory), bukan "prompt di Claude". |
| **Dilarang**: automated trade execution | — | ARUS hanya *analyze, screen, score, alert, support decisions*. Tombol beli/jual TIDAK ADA. |
| **Dilarang**: financial advice | — | Output = fakta + pertanyaan + counter-argument. Disclaimer di setiap hasil. |
| Track requirement: "custom-built agent logic or orchestration", "would disappear if prompt removed from someone else's client" | — | Orchestration, routing antar sumber data, state/memory, dan UI purpose-built adalah produknya, bukan modelnya. |

Deliverables: repo publik (dibuat ≥19 Agu, API key dihapus), teaser 1 menit, judging video ≤3 menit, problem statement 1 kalimat, post sosmed tag @sectors, submission via portal sebelum 22 Sep (entry) / 30 Sep (build).

---

## 2. ICP: Investor Ritel Indonesia ("Ikan Kecil")

**Persona utama — "Rizky, 29, Jakarta":**
- Modal Rp 5–50 juta (rentang ICP: 100rb–500jt), 10+ juta akun ritel aktif IDX.
- Buka posisi karena: grup WA/Telegram, X/Twitter, TikTok financial influencer, atau lihat "top gainers" aplikasi sekuritas.
- **Tidak tahu**: siapa owner di balik emiten itu, apakah berita pemicunya substantif atau cuma hype, siapa yang jualan ke dia (asing/bandar distribusi?), dan bahwa 6 saham di portofolionya ternyata satu grup konglomerasi yang sama.
- Pola sakit: beli saat +30% (pucuk) → panic sell saat suspend/trading halt → nyalahin market. Ulang.
- Akses informasi: data institusional (broker summary, kepemilikan, segmentasi) ada **gratis di IDX** tapi bentuknya PDF dan tabel mentah — tidak pernah dia baca. **Ini unfair advantage ritel yang tidak terpakai.**

**Kenapa ICP ini menang di judging:** 40% = real-world usability. Pasar 10 juta orang, masalah tiap hari, solusi bekerja tanpa perlu sekuritas mana pun ikut campur, dan "hari ini bisa dipakai" literally — cukup ketik ticker.

---

## 3. Konsep Produk

### 3.1 Satu kalimat

> Chat "kenapa ANTM naik ya? boleh ikut gak?" → agent meneliti 5 aspek paralel → keluar **Kartu Arus**: siapa penggeraknya, apakah beritanya nyambung, siapa yang beli & siapa yang jualan (per broker!), ke grup siapa saham ini belongs, seberapa "panas" meter FOMO-nya — plus **counter-argument wajib** sisi lawan.

### 3.2 Empat pilar analisis (= "semua aspek")

**PILAR 1 — Katalis & Berita Hot (anti "hype tanpa isi")**
- Deteksi lonjakan harga → tarik berita emiten + tag terkait → klasifikasi: *substantif* (aksi korporasi, kontrak, laporan keuangan) vs *viral* (sebut-sebut di medsos, dikait-kaitkan).
- Cross-check klaim berita vs filing resmi & corporate actions. "Berita bilang dapat kontrak besar — filing IDX-nya tidak ada." ← kalimat yang bikin ritel berhenti FOMO.
- Hot-news radar harian: berita mana yang *seharusnya* menggerakkan harga tapi belum, dan yang sudah gerak tapi katalisnya sudah lewat (chasing risk).

**PILAR 2 — Graph Kepemilikan & Konglomerasi (fitur signature, paling "wow" di demo)**
- Bangun **bipartite graph emiten ↔ pemegang saham** dari Shareholders Composition lintas ratusan ticker, lalu cluster: saham-saham yang punya pengendali/induk yang sama = satu **grup** (Sinar Mas, Barito, Bakrie, Salim, group baru hasil akuisisi, dst). Tambah kepemilikan bertingkat dari Mining Company Ownership untuk emiten tambang.
- **Group Score portofolio:** user masukkan daftarnya → ARUS tunjukkan "portofolio 'diversified' kamu 78% nilai-nya satu grup konglomerasi yang sama — kalau grup ini kena masalah, semua sahammu anjlok bareng." Ini **ilusi diversifikasi** — risiko #1 ritel yang tidak disadari, dan TIDAK dihitung oleh aplikasi sekuritas mana pun.
- **Guanxi mapping:** saham A dan saham B "berelasi" (supply chain intra-grup, satu pengendali, transaksi afiliasi) → "kamu beli B, tapi yang diuntungkan A."
- Visual graph interaktif (force-directed) = adegan pembuka video teaser 1 menit.

**PILAR 3 — Aliran Uang: Broker, Asing, Orang Dalam ("siapa yang kasih kamu barang?")**
- Per ticker: Top Buyers & Sellers, akumulasi/distribusi per broker, net foreign flow 90 hari.
- **Deteksi distribusi ke ritel:** harga naik + broker asing/institusi net-jual + broker cohort ritel net-beli = *"orang besar sedang oper ke kecil"*. Tampilkan sebagai timeline "detik-detik kamu jadiExit liquidity."
- Insider filings: direktur/komisaris baru saja jualan massal sebelum saham digoreng? Muncul sebagai ⚑ merah.
- Suspensi history + free float kecil = ⚑ "saham ini gampang digoreng & bisa disetop IDX kapan pun."

**PILAR 4 — Fundamental & Realita Harga (rem anti-panic & anti-pucuk)**
- Valuasi vs teman sekelompoknya (subsector report), kualitas earning 8 kuartal terakhir, revenue segment (Sankey) — "perusahaan ini beneran jualan apa?"
- **FOMO Meter (0–100):** return 7d/30d + z-score volume + deviasi SMA + divergence berita vs fundamental + arah net-asing. Skor + 3 kalimat bukti, bukan angka kosong.
- **Panic Decoder:** saat user panik lihat merah → agent jawab "turun 8% hari ini: (a) katalis spesifik apa, (b) secara historis volatilitas segini terjadi N kali & apa yang terjadi setelahnya, (c) fundamental kuartalan berubah? ya/tidak." Menenangkan dengan bukti, bukan motivasi.

### 3.3 Mode penggunaan

1. **Chat (purpose-built UI):** pertanyaan bebas → planner agent routing ke pilar yang relevan.
2. **Morning Arus (autonomous, pre-market 08:30 WIB):** scan full-universe (daily close semua ticker + movers + most traded) → anomali (price/volume spike, news spike) → untuk tiap anomali jalankan 4 pilar → brief: "10 saham yang lagi jadi arwah hari ini — apa pemicunya, siapa yang masuk/keluar, dan apa counter-argumentnya." Zero user action = bukti "autonomous task execution" untuk track.
3. **Portfolio Autopsy:** paste daftar + harga beli → Group Score, FOMO check per posisi, ⚑ risk flags, dan **"Cermin Perilaku"**: ARUS ingat keputusan lama user (memory) — "3 bulan lalu kamu chase BRMS saat +25%, sekarang -18%. Mau ulang polanya?" ← killer feature untuk ICP "emotional".

---

## 4. Arsitektur Teknis (ini yang bikin 30% technical depth)

```
User / Scheduler
   │
   ▼
[PLANNER / ROUTER AGENT]  ── dekomposisi pertanyaan → task graph
   │  (klasifikasi intent: kenapa-gerak / evaluasi-beli / bedah-porto / pagi-ini / risiko)
   ▼
[5 AGEN SPESIALIS — paralel, masing-musnya custom tool-use loop di atas Sectors REST/MCP]
 ├─ Mover-Agent      : Daily Transaction, Top Movers, Most Traded, Index, Full-Universe Close
 ├─ Flow-Agent       : Broker per Symbol, Top Buyers/Sellers, Broker Ranking, Foreign Flow, Insider Filings, Broker Registry
 ├─ News-Agent       : News Articles, News Tags, Corporate Actions, Filings, Suspensions
 ├─ Fundamentals-Agent: Company Report, Quarterly Financials, Subsector Report, Revenue Segments, Free Float, Screener
 └─ Graph-Agent      : Shareholders Composition (batch lintas ticker) → bangun edge emiten↔pemilik → cluster grup → relasi portofolio
   │  (setiap agen: retrieval → verifikasi silang antar-agen → output terstruktur JSON schema)
   ▼
[SYNTHESIS AGENT] → Kartu Arus: skor FOMO, ringkasan per pilar, ⚑ flags,
   │                "counter-argument" (wajib: sisi bear vs bull), disclaimer
   ▼
[MEMORY LAYER]    : percakapan + watchlist + log keputusan user (SQLite) → personalisasi Coach
```

Yang memenuhi kriteria track secara eksplisit:
- ✅ **multi-step reasoning flows** — planner dekomposisi, agen lintas-sumber verifikasi silang (contoh: News-Agent klaim vs Fundamentals-Agent angka vs Flow-Agent aksi broker).
- ✅ **custom tool-use pipeline** — 32 tool functions hasil pembungkus endpoint Sectors, dengan schema & validator sendiri.
- ✅ **routing between data sources** — intent → subset pilar; pertanyaan valuasi tidak memanggil broker endpoints.
- ✅ **memory / state management** — profil perilaku + riwayat sesi per user.
- ✅ **autonomous task execution** — Morning Arus tanpa dipancing user.
- ✅ **purpose-built interface** — kartu hasil + graph + FOMO meter; bukan chat box kosong.
- ✅ **bukan sekadar prompt** — orchestrator, cache, dedupe, rate-limit-aware planner, eval harness (lihat §7) adalah kodenya.

**Innovative use of Sectors (yang dinilai juri):** graph konglomerasi TIDAK tersedia sebagai endpoint tunggal — dia **diturunkan** (derived) dari agregasi Shareholders Composition lintas universe + clustering; dan anomali morning-scan memanfaatkan full-universe endpoints (Daily Full-Universe Close #16, Most Traded #21, Movers #20) sebagai trigger, persis pola recipe "GNN Anomaly Detection" docs mereka tapi dieksekusi agent-driven. Refer ke recipes docs sebagai bukti kami belajar dari platformnya: Multi-Agent Workflows, ReAct Conversational Agents, Conversational Memory, Tool Use/Function Calling.

**Stack (sengaja membosankan & cepat):** Next.js + shadcn, FastAPI/Node backend, Claude API (Anthropic SDK, tool-use loop + structured output), SQLite, force-graph.js untuk graph. Tanpa framework agent berat — custom orchestration lebih jelas "of its own" di mata juri, dan lebih gampang didebug dalam 13 hari.

---

## 5. Kill test Sectors (syarat wajib lolos)

Hapus Sectors API → ARUS kehilangan **semua** inputnya: harga, broker flow, ownership, news, financials, filing, suspensi. Yang tersisa cuma UI kosong. ✅ Core data source, bukan dekorasi.
Kontra-desain yang sengaja DIHINDARI: scraping Yahoo/bloomberg gratisan sebagai fallback (juri lihat itu = Sectors jadi hiasan). Satu-satunya non-Sectors input = pertanyaan user.

---

## 6. Compliance & Etika (juga bagian dari rules)

- Tidak ada order/eksekusi otomatis. Tidak ada tombol beli. Tidak ada rekomendasi "Beli/Jual/Hold" — output adalah **fakta, skor risiko, dan pertanyaan** ("berita sudah ada 3 hari lalu, asing keluar terus — kamu masuk sebagai siapa?").
- Disclaimer permanen di footer kartu: *Alat bantu riset dan edukasi. Bukan nasihat keuangan. Keputusan pada kamu.*
- Bahasa jujur soal limitasi data (broker summary bukan identitas nama, kepemilikan per laporan terakhir, dsb) — justru menambah kredibilitas di mata juri.

---

## 7. Scoping 13 hari (sekarang 17 Sep → build freeze 30 Sep 23:59 WIB)

Hari ini repo harus **dibuat** (first commit dalam jendela build) — mulai sekarang juga.

| Prioritas | Fitur | Target |
|---|---|---|
| **P0 (inti)** | Chat + 4 agen (Mover, News, Flow, Fundamentals) + Kartu Arus + FOMO Meter + disclaimer + UI purpose-built | selesai 25 Sep |
| **P0** | **Graph-Agent v1**: input portofolio (≤10 ticker) → Shareholders Composition per ticker → cluster grup → Group Score + graph visual | 27 Sep |
| **P1** | **Morning Arus** autonomous scan (cron, seed 20–30 anomali → ringkas) | 28 Sep |
| **P1** | Memory "Cermin Perilaku" (log keputusan + watchlist) | 28 Sep |
| **P2** | Panic Decoder, screener natural-language, SGX/MY (skip — fokus IDX) | kalau sempat |
| **Polish** | Eval harness kecil (20 pertanyaan → cek fakta output vs data mentah Sectors, anti "faked for demo"), seed data demo (5 kasus terkenal: saham gorengan 2026 yang grup-nya kompak naik-turun, distribusi asing ke ritel, berita viral tanpa filing) | 29–30 Sep |

**Budget 1.000 API credits (realis!**): kache agresif — full-universe & movers 1×/hari (disk cache), Shareholders Composition per ticker 1×/minggu, percakapan pakai cache bukan live-call ulang. Estimasi demo+dev: <300 credits. Sisakan 40% cadangan buat video.

**Tim:** 1–2 orang cukup (solo = team of one, legal). Yang penting **semua anggota onboarding Sectors sekarang** + klaim team credits, karena itu gate pass/fail.

---

## 8. Rencana video (30% dari skor — jangan asal jadi)

**Teaser 60 detik:** layar penuh graph konglomerasi menyala → satu saham "naik 40% karena berita X" → zoom out: 6 saham lain di grup yang sama ikut tersambung → teks: "Ikan kecil lihat harga. ARUS lihat arus." → end card.

**Judging 3 menit:** (0:00–0:30) Rizky chase saham viral → rugi — "bukan salah dia, salah akses"; (0:30–1:45) live walkthrough satu pertanyaan real: "kenapa XXXX naik, boleh ikut?" — kartu arus terbentuk live, termasuk counter-argument bear-case (juri suka agent yang membantah usernya); (1:45–2:15) portfolio autopsy → "78% portomu satu grup" → graph reveal; (2:15–2:40) cut ke 8:30 pagi — Morning Arus muncul sendiri tanpa diperintah; (2:40–3:00) penutup: "Ritel nggak butuh sinyal. Ritel butuh mata. — kami tidak kasih rekomendasi, dan itu sengaja." + disclaimer.

Skor storytelling maksimal karena: satu manusia nyata, konflik jelas (ikan vs arus), visual unik, dan closing yang patuh rules tanpa loyo.

---

## 9. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Graph ownership berantakan (nama pemegang tidak konsisten antar emiten) | normalisasi string + fuzzy match; fallback: tampilkan sebagai "kemungkinan relasi", jangan klaim 100% |
| Hallucination LLM soal angka | synthesizer HANYA boleh mengutip dari JSON tool output (structured output + grounding check); eval harness §7 membuktikan ke juri |
| Credit habis sebelum demo | cache-first design, demo pakai session cached, rekam video sebelum freeze |
| Dituduh "prompt di Claude" | README menjelaskan arsitektur orchestration + commit history dari hari pertama build period |
| Terlalu banyak fitur, MVP ambyar | P0 dulu sampai demo-able 25 Sep; P1/P2 opsional |

---

## 10. Ide cadangan (ditolak, biar keputusan tegas)

- *Portofolio optimizer klasik* → bukan agent, jatuh ke Market Intelligence, dan ada di mana-mana.
- *Trading bot ritel* → PROHIBITED by rules (auto-execution).
- *News summarizer biasa* → gagal test "prompt dihapus = produk hilang"? Lebih buruk: produknya masih ada. Ditolak track AI Agents.
- *Screening n8n workflow* → itu contoh track Automation.

**ARUS menang karena** memetakan 1:1 ke bobot: masalah 10 juta orang (40%), cerita ikan-kecil-tsUNAMI yang emotionally charged untuk demo (30%), dan graph derived + multi-agent autonomous (30%) — di satu produk yang mustahil ada tanpa Sectors.
