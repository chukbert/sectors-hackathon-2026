# PRD — ARUS

**Produk:** asisten multi-agent yang membuat investor ritel IDX melihat **arus informasi, arus uang (broker per-kohort & asing), dan arus kepemilikan (grup konglomerasi)** sebelum memutuskan.
**Acara:** Sectors Hackathon 2026 · Track 01: AI Agents & Assistants
**Jadwal:** entry/registrasi 22 Sep 23:59 WIB · build & submit 30 Sep 23:59 WIB · judging asinkron 1–8 Okt (video + repo bicara sendiri, tanpa presentasi live)
**Sumber:** gabungan `ide-utama.md` (flagship) + `ide-penunjang.md`. Jika konflik → **ide-utama menang** (daftar resolusi di §12).
**Status:** v1.1 · 17 Sep 2026 — dokumen eksekusi, bukan eksplorasi.
**v1.1:** jawaban = teks + **grafik inline** (GrupGraph bagian dari analisis, bukan tab sendiri) · **Autopsi Portofolio jadi intent chat** · model penalaran **gemini-3.8-flash, effort medium** → detail §13.

> Tagline: *"kalau kamu mau jadi ikan kecil, setidaknya jangan jadi umpan."*
> Catatan jujur: tidak ada yang menjamin 99%. Yang dikerjakan: memaksimalkan skor di tiap rubrik 40/30/30 sampai mendekati ceiling-nya dan menutup semua gate pass/fail. Tiap fitur harus membayar salah satu bobot; tiap gate punya bukti yang bisa diperiksa juri.

---

## 1. Ringkasan produk

**Problem statement (final, siap tempel di portal):**
> "Investor ritel IDX (10+ juta akun) membeli saham karena FOMO berita viral tanpa tahu siapa penggerak sebenarnya di balik transaksinya dan bahwa 'portofolio diversified' mereka ternyata satu grup konglomerasi — ARUS adalah asisten multi-agent yang menjawabnya dari data Sectors dalam satu percakapan, lengkap dengan counter-argument dan memori perilaku si user."

**Tiga aset turunan (derived assets) yang tidak dimiliki produk mana pun di track ini — moat kami:**
1. **Kohort Flow Index** — alur uang riil vs institusi/asing per ticker per hari, hasil join Broker Activity per Symbol × Broker Registry (`cohort`, `origin`). Tidak ada endpoint Sectors yang mengatakannya langsung; kami yang menghitungnya.
2. **GrupGraph** — graph konglomerasi emiten↔pemegang saham, hasil agregasi Shareholders Composition lintas universe + clustering (+ kepemilikan bertingkat Mining Company Ownership).
3. **Cermin Perilaku** — memori agent atas keputusan user sendiri ("3 bulan lalu kamu chase +25%, sekarang -18%").

---

## 2. Goals, rubrik & gate

### Gate eligibility (pass/fail — mati di sini = skor 0)

| Gate | Cara lolos + bukti |
|---|---|
| Submission lengkap (repo publik, teaser 1 mnt, video ≤3 mnt, problem stmt, track, nama tim, post sosmed tag @sectors + template Canva) | Checklist §11, dieksekusi H-2, tidak mepet |
| Produk jalan end-to-end | Demo video **live, tanpa cut rekayasa** di 1 sesi ambil data; seed cache hanya fallback, dinyatakan jujur di video |
| Sectors = core, bukan dekorasi | **Semua** input agent dari Sectors REST/MCP. Nol scraping sumber lain, tidak ada "fallback Yahoo Finance" (§6) |
| Onboarding Sectors semua anggota | Selesaikan **17 Sep (hari ini)** + klaim team credits — roster terkunci setelah klaim, finalkan komposisi tim dulu |
| Repo dibuat dalam build period | First commit 17 Sep. Dokumen planning dibuat sebelum coding = legal |
| Freeze saat submit | Submit **pagi 30 Sep**; setelah freeze nol commit sampai pengumuman 9 Okt |
| Dilarang eksekusi order otomatis | Tidak ada tombol beli/jual, tidak ada integrasi sekuritas. Output: fakta, skor, pertanyaan, counter-argument |
| Dilarang financial advice | Disclaimer permanen di setiap kartu + di video. Framing "alat riset & edukasi". Agent tidak pernah bilang "beli/jual/hold" |

### Bobot rubrik → strategi

| Kriteria | Bobot | Strategi inti |
|---|---|---|
| Real-world usability | **40%** | ICP 10 jt akun ritel; masalah harian; dipakai hari ini cukup ketik ticker; bukti sosial mini-beta 10 pengguna nyata + testimoni masuk video (§9) |
| Video demo & storytelling | **30%** | Naskah shot-by-shot: konflik manusia nyata (Rizky), satu visual ikonik (GrupGraph reveal), agent yang **membantah usernya**, closing patuh-rules yang tajam |
| Technical depth & execution | **30%** | Orkestrasi custom (planner → 5 spesialis → verifier → Bantah-Agent → synthesis → memory) + adversarial verifier + eval harness 20 kasus + commit history bersih dari hari pertama (§8) |

### Tes track — "would disappear if the team's prompt is removed"
ARUS tidak bisa direplikasi oleh "client LLM + MCP + prompt bagus" (Claude, Gemini, apa pun) karena yang bekerja adalah kodenya: planner dekomposisi → routing antar sumber → 5 agen paralel dengan tool-schema sendiri → verifier silang antar agen (klaim News vs angka Fundamentals vs aksi broker) → adversarial Bantah-Agent → synthesizer structured output → memory layer → scheduler otonom.

---

## 3. Pengguna & masalah

**Persona — "Rizky, 29, Jakarta":** modal Rp 5–50 jt (rentang ICP 100 rb–500 jt), 10+ juta akun ritel aktif IDX. Masuk pasar karena grup WA/Telegram, X, TikTok, atau "top gainers" aplikasi sekuritas. Tidak tahu: owner di balik emiten, apakah beritanya substantif, siapa yang jualan ke dia, dan bahwa 6 saham "diversified"-nya satu grup. Pola: beli di pucuk (+30%) → panic sell saat suspend/trading halt → nyalahin market. Ulang.

**Insight kunci yang jadi nyawa produk:** data institusional (broker summary, komposisi pemegang, foreign flow) **sudah ada dan sudah digital** di IDX — tapi bentuknya tabel mentah yang tidak akan pernah dibaca Rizky. Sectors mengubahnya jadi API; tugas kami mengubahnya jadi **kalimat yang dia mengerti saat dia butuh** (tepat sebelum FOMO). Ini definisi persis "real-world usability: someone can use it today and benefit from it".

**Kenapa bukan advice:** ARUS tidak menjawab "boleh ikut gak?" — dia mengembalikan pertanyaan yang lebih baik: *"berita sudah ada 3 hari lalu, asing keluar terus, broker ritel masuk — kamu masuk sebagai siapa?"*

---

## 4. Scope: 6 fitur

Prioritas: **P0** wajib demo-able (gate 24 Sep) · **P1** target 28 Sep · **P2** kalau sempat.

### F1. Kartu Arus — chat dengan purpose-built UI [P0] → 40% + 30%
Satu pertanyaan ("kenapa ANTM naik? boleh ikut gak?") → plan → 5 pilar paralel → kartu terstruktur:
- **Penggerak harga** (Mover), **katalis substantif-vs-viral** (News), **siapa beli & siapa jualan per kohort broker** (Flow), **anggota grupnya** (Graph), **fundamental & valuasi vs subsector** (Fundamentals, termasuk revenue segment).
- **FOMO Meter (0–100):** return 7d/30d + z-score volume + deviasi SMA + divergence berita vs fundamental + arah net-asing — skor + 3 kalimat bukti, bukan angka kosong.
- **Counter-argument wajib sisi lawan** (bull vs bear) + ⚑ flags + disclaimer permanen.
- **Grafik inline sebagai bagian analisis:** setiap kartu memuat **ego-graph GrupGraph** (ticker + hub grup pengendali + posisi user + tetangga grup) di pilar Grup — jawaban mendalam = angka + kalimat + visual, bukan paragraf saja. Synthesis wajib mengeluarkan payload `graph {nodes, edges}` (kontrak JSON) yang dirender force-graph di stream chat.

### F2. Kohort Flow Index — derived metric signature [P0] → 30% + wow
Join per-ticker per-hari: `broker-summary-by-symbol` × `broker-registry` (`cohort: retail|mixed|institutional`, `origin: foreign|domestic`).
- Output: "**broker kohort ritel net-buy Rp 41 M / asing+institusional net-sell Rp 63 M selama 7 hari**" — distribusi dari besar ke kecil, dihitung, bukan dirasakan.
- Perkuat: `foreign-flow-by-symbol` (90 hari), `broker-summary-top`, `brokers/top` ranking harian per kohort sebagai konteks market, `filings` insider (direktur jualan massal sebelum gorengan = ⚑ merah).
- Deteksi distribusi ke ritel (harga naik + asing/institusi net-jual + kohort ritel net-beli) → timeline "**detik-detik kamu jadi exit liquidity**" = adegan ikonik video.
- Validasi jujur: nama broker ≠ nama pemilik akun — tampilkan sebagai indikator statistik, bukan tuduhan (§10).

### F3. GrupGraph + Ilusi Diversifikasi — fitur yang diingat juri [P0, pamungkas] → 30% + 30%
- Bipartite graph emiten↔pemegang dari `shareholders-composition` (batch lintas universe) → cluster pengendali/induk sama = satu grup (Sinar Mas, Barito, Bakrie, Salim, dst) + tree `mining-companies-ownership`.
- **Autopsi Portofolio = intent chat, bukan tab.** User mengetik **"autopsi portofolio saya"** → planner routing ke Graph-Agent → kartu **Group Score + graph interaktif penuh inline di alur percakapan** (≤10 ticker → "43% nilaimu dipegang 2 grup") — risiko #1 ritel yang tidak dihitung aplikasi sekuritas mana pun. Follow-up kontekstual dijawab dari graph yang sama: "kok bisa INDF sama ICBP sekelompok?"
- **Graph muncul di mana analisisnya butuh:** pertanyaan ticker → ego-graph (F1); autopsi → graph penuh; entri Morning Arus → expand ke ego-graph.
- **Guanxi mapping:** relasi afiliasi/supply-chain intra-grup → "kamu beli B, yang diuntungkan A."
- Visual force-directed interaktif = pembuka teaser 60 detik.
- Akurasi demo: known-list 30 grup besar + normalisasi string + fuzzy match; label "kemungkinan relasi", jangan klaim 100%.

### F4. Katalis Meter — anti "hype tanpa isi" [P0/P1] → 40%
- Lonjakan harga → tarik `news` (per symbol/tag) + `filings` + `corporate-actions` → klasifikasi **substantif vs viral**; cross-check klaim berita vs filing: *"berita bilang dapat kontrak besar — filing-nya tidak ada."*
- ⚑ struktural: `suspensions` history + `free-float` kecil = "gampang digoreng, bisa disetop kapan pun".
- Mini hot-news radar: berita yang seharusnya menggerakkan harga tapi belum / sudah gerak tapi katalisnya lewat (chasing risk).

### F5. Morning Arus — autonomous execution [P1] → bukti track requirement
Cron 08:30 WIB: `close` full-universe + `top-changes` + `most-traded` → deteksi anomali (z-score volume, spike harga, news spike; seed 20–30 anomali → ringkas) → jalankan pilar per anomali → brief harian 10 entri dengan counter-argument. Zero user action.

### F6. Cermin Perilaku + Panic Decoder [P1/P2] → 40% (dimensi manusia)
- SQLite per user: riwayat keputusan + watchlist. Agent memanggil pola lama saat user mau mengulanginya ("3 bulan lalu kamu chase BRMS saat +25%, sekarang -18%. Mau ulang polanya?"). Menyerang masalah sesungguhnya (perilaku), bukan cuma informasi.
- **Panic Decoder** (varian F1 saat user panik merah): katalis apa, historinya N kali segini lalu bagaimana, fundamental kuartalan berubah/tidak. Menenangkan dengan bukti, bukan motivasi.

### Non-goals (keputusan tegas, dibuang dari scope)
Optimizer portofolio klasik (bukan agent, jatuh ke Market Intelligence) · trading bot (prohibited) · news summarizer polos (gagal tes track) · multi-market SGX/MY · screener NL penuh (`screener/companies` dengan `q` dipakai internal saja, tidak dipamerkan) · workflow n8n (track Automation).

---

## 5. Arsitektur

```
User / Scheduler (cron 08:30)
   ▼
[1 PLANNER/ROUTER]   intent (kenapa-gerak · evaluasi-beli · autopsi-portofolio · pagi · risiko)
                    → task graph → subset pilar (valuasi tidak panggil broker endpoint)
   ▼
[5 SPESIALIS — paralel; custom tool-loop, schema output JSON sendiri, cache-first]
 Mover        : close, daily, top-changes, most-traded, index-daily, idx-total
 Flow         : broker-summary-by-symbol, broker-summary-top, broker-activity-*, brokers/top,
                broker-registry, foreign-flow-by-symbol, filings (insider)
 News         : news, tags, corporate-actions, suspensions
 Fundamentals : company-report (sections), quarterly-financials, sector-report,
                company-segments, free-float, screener
 Graph         : shareholders-composition (batch) → cluster → grup; mining-ownership
   ▼
[2 VERIFIER]         klaim tiap agen dicek silang; angka harus ada di JSON tool output
                     (grounding check, zero-numeric-hallucination policy); konflik → rekonsiliasi atau tampilkan dua-duanya
   ▼
[3 BANTAH-AGENT]     adversarial: wajib menyusun case terkuat MELAWAN kesimpulan (bear vs bull)
   ▼
[4 SYNTHESIS]        Kartu Arus: skor + bukti per pilar + ⚑ + counter-argument + disclaimer
                     + payload graph {nodes, edges} → dirender inline di chat (force-graph)
   ▼
[5 MEMORY]           profil perilaku, keputusan lalu, watchlist → personalisasi F6
```

**Checklist track requirement (ditulis eksplisit di README):** multi-step reasoning ✅ · custom tool-use pipeline ✅ (20+ endpoint dibungkus sebagai tool dengan schema & validator sendiri) · routing antar sumber ✅ · memory/state ✅ · autonomous execution ✅ · purpose-built interface ✅.

**Stack sengaja membosankan & cepat:** Next.js + shadcn · FastAPI/Node · Google GenAI SDK (`gemini-3.8-flash`, function calling + structured output) · SQLite · force-graph.js.

**Model penalaran: `gemini-3.8-flash` · effort medium** — kedalaman dijamin arsitektur (5 pilar + verifier + bantah), bukan cuma model; effort medium aman untuk biaya/latency 13 hari, dan bisa dinaikkan per-agen kalau eval §8 menuntut (Verifier/Bantah yang pertama di-upgrade). **Tanpa framework agent berat** — orkestrasi custom (a) lebih jelas "of its own" di mata juri, (b) lebih gampang didebug dalam 13 hari, (c) lebih mudah dibela saat audit repo. Pola mengikuti resep resmi docs (Tool Use, Multi-Agent Workflows, ReAct, Conversational Memory, Structured Output) — menyebutnya di README = sinyal kami belajar dari platformnya.

**Budget 1.000 credits (hard constraint):** cache disk penuh — full-universe 1×/hari, shareholders 1×/minggu/ticker, broker summary 1×/hari/ticker watchlist saja; percakapan read dari cache. Estimasi dev+demo < 300; reserve 40%+ untuk shooting ulang video. Rate-limit-aware planner: batch + dedupe + circuit breaker.

---

## 6. Data & kill test Sectors

- **Kill test:** cabut Sectors → hilang semua input (harga, broker flow, ownership, news, filings, suspensi, financials). Sisa UI kosong. ✅ Kontra-desain yang dihindari: scraping sumber lain sebagai fallback — juri lihat itu = Sectors jadi hiasan. Satu-satunya non-Sectors input = pertanyaan user.
- **Bukti yang dipertunjukkan, bukan cuma diklaim:** satu commit `sectors-deps.txt`/diagram memetakan 20+ endpoint → fitur, dan segmen video 5 detik menampilkan error state "Sectors data unavailable" saat key dummy dipasang.
- **Innovative use of Sectors:** GrupGraph tidak tersedia sebagai endpoint tunggal — diturunkan dari agregasi + clustering lintas universe; Morning Arus memakai full-universe endpoints sebagai trigger anomali, pola recipe "GNN Anomaly Detection" docs tapi agent-driven.

---

## 7. Persyaratan non-fungsional

1. **Zero numeric hallucination:** synthesizer hanya boleh mengutip angka yang hadir di JSON tool output; ditegakkan Verifier + diuji eval harness.
2. **Compliance:** tanpa order/eksekusi otomatis; tanpa kalimat beli/jual/hold; disclaimer footer permanen: *Alat bantu riset dan edukasi. Bukan nasihat keuangan. Keputusan pada kamu.*
3. **Kejujuran limitasi:** broker summary = proxy kohort bukan identitas; kepemilikan per laporan terakhir — ditulis di kartu (menambah kredibilitas di mata juri).
4. **Hemat credit:** cache-first + dedupe + circuit breaker sesuai §5.
5. **Keamanan:** API key tidak pernah masuk repo; `.env.example` bersih; cek 2× sebelum submit.

---

## 8. Repo & "judging evidence packet"

Technical depth diverifikasi dari GitHub — repo harus meyakinkan juri yang scroll 20 menit tanpa nanya:
1. **README** — diagram arsitektur (§5), tabel endpoint→fitur, why-multi-agent (termasuk kenapa bukan "prompt di client LLM"), limitasi data yang diakui jujur.
2. **`eval/` harness** — 20 pertanyaan uji → jawaban dicek otomatis terhadap data mentah Sectors (assert angka kunci) → `EVAL_REPORT.md` dengan skor & contoh kegagalan yang diperbaiki. Anti-"faked for demo", langsung menjawab kalimat rubrik.
3. **Commit history** linear sejak 17 Sep, pesan commit rapi, PR per fitur — bukti karya dalam build period (tanpa migrasi kode lama).
4. **`SEED.md`** — daftar kasus demo + timestamp snapshot respons API yang dipakai (reproducibility). Seed 5 kasus terkenal: gorengan yang grupnya kompak naik-turun, distribusi asing→ritel, berita viral tanpa filing.
5. `.env.example` bersih; key dihapus sebelum submit (cek ulang 2×).
6. Live deploy opsional — kalau ada, taruh link di README (tidak wajib; video end-to-end cukup untuk gate).

---

## 9. Video, teaser & mini-beta (30% — deliverable #1, bukan sisa waktu)

**Teaser 60 detik (publik, YouTube/IG):** layar penuh GrupGraph menyala → satu saham +40% karena "berita X" → zoom-out: 6 saham satu grup tersambung → teks: *"Ikan kecil lihat harga. ARUS lihat arus."* → end card + disclaimer.

**Judging 3 menit — shot list:**
| Waktu | Adegan |
|---|---|
| 0:00–0:30 | Rizky (rekan setim, akting tipis) chase saham viral → merah. Teks: "Bukan salah dia. Salah akses." |
| 0:30–1:45 | **Satu pertanyaan real, live, tanpa cut rekayasa**: "kenapa XXXX naik, boleh ikut?" Kartu Arus terbentuk; penekanan Bantah-Agent mematahkan argumen beli user (juri suka agent yang melawan usernya) |
| 1:45–2:15 | Ketik **"autopsi portofolio saya"** di chat → Group Score + **GrupGraph reveal penuh inline** — graph menyala di percakapan yang sama (adegan poster; satu layar, bukan pindah tab) |
| 2:15–2:35 | Cut ke 08:30: Morning Arus muncul sendiri; scroll 10 anomali pagi itu |
| 2:35–2:50 | Cermin Perilaku: "3 bulan lalu kamu juga begini." + **screenshot feedback mini-beta 10 pengguna nyata**, 1 testimoni dibacakan |
| 2:50–3:00 | Closing: "Ritel tidak butuh sinyal. Ritel butuh mata. — Kami tidak memberi rekomendasi. Itu disengaja." + disclaimer penuh |

**Mini-beta (pengungkit 40% termurah):** H+5 (±22 Sep), rekrut 10–15 pengguna dari komunitas ritel (X/WA/Discord), minta 3 pertanyaan nyata mereka dijawab + feedback 2 kalimat. Bug report mereka sekalian menaikkan kualitas produk inti.

**Audio/subtitle:** Bahasa Indonesia, subtitle hard-burn (banyak juri nonton tanpa suara di 1–8 Okt). Rekam sebelum freeze; jangan pernah rekam ulang setelah submit.

---

## 10. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Nama pemegang tidak konsisten antar emiten → graph salah cluster | Normalisasi string + fuzzy + known-list 30 grup besar untuk akurasi demo; label "kemungkinan relasi" |
| Kohort broker = proxy, bukan identitas pemilik | Framing statistik ("broker yang dipakai ritel net-jual"), bukan tuduhan; limitasi ditulis di kartu |
| Hallucination angka | Zero-numeric-hallucination policy di Verifier; eval harness §8; synthesizer hanya mengutip tool JSON |
| Credit habis | §5; demo pakai sesi cache; shooting video = fase dengan cadangan terbesar |
| Waktu ambyar (13 hari) / MVP kebablasan fitur | Gate 24 Sep; go/no-go 25 Sep: kalau F1+F2+F3 belum demo-able, buang F5/F6 ke "design in README + screenshot mock" — **jangan pernah tampilkan fitur palsu di video** |
| Dituduh "cuma prompt di client LLM" | Orkestrasi + cache + dedupe + eval adalah kodenya; README menjelaskan; commit history dari hari pertama |
| Dituduh bukan karya build period | Repo dibuat 17 Sep, history linear, tanpa kode lama |
| Lupa freeze / API key lolos | Checklist §11 dieksekusi H-2 dan H-1 oleh dua orang berbeda |

---

## 11. Timeline eksekusi 13 hari + checklist submit

| Tgl | Milestone | Priority |
|---|---|---|
| 17 Sep | **SEKARANG:** onboarding semua anggota + klaim team credits (roster terkunci — finalkan tim dulu), buat repo + first commit (scaffold), registrasi portal. Tim: 1–2 orang cukup (solo = team of one, legal) | gate |
| 18–20 | Data layer: client Sectors + cache + 20 tool wrappers; prototype F2 offline (buktikan Kohort Flow Index dari data mentah dulu, UI belakangan) | P0 |
| 21–23 | Planner + Mover/Flow/News/Fundamentals + F1 Kartu Arus + F4; eval harness jalan | P0 |
| **24** | **Gate tengah: F1 end-to-end demoable.** Tidak lewat → potong scope, kunci ke F1–F4 | gate |
| 25–27 | **Go/no-go 25 Sep.** F3 GrupGraph (Graph-Agent + visual + Group Score) — fitur pamungkas, 2–3 hari penuh | P0 |
| 28 | F5 Morning Arus + F6 memory (versi minimal); rekrut mini-beta | P1 |
| 29 | Rekam video (2 take), screenshots, README/EVAL_REPORT final, post sosmed | polish |
| 30 Sep pagi | **SUBMIT** → lalu DIAM — freeze total sampai pengumuman 9 Okt | gate |

**Checklist submit (dieksekusi H-2, diverifikasi H-1 oleh orang kedua):**
- [ ] Repo publik, first commit dalam jendela, **tanpa API key** (cek 2×)
- [ ] Teaser 60 dtk publik (YouTube/IG)
- [ ] Judging video ≤3 mnt bisa diakses
- [ ] Problem statement (versi §1) terpasang di portal
- [ ] Track 01 + nama tim benar
- [ ] Post sosmed tag @sectors + template Canva
- [ ] Registrasi/entry portal sebelum 22 Sep selesai

---

## 12. Resolusi konflik (ide-utama menang)

| Item | Putusan |
|---|---|
| Problem statement | Versi final ide-utama (bukan versi penunjang) |
| Struktur produk | 6 fitur F1–F6 (utama); detail 4 pilar penunjang dibungkus ke dalamnya |
| Jumlah tool wrapper | "20+ endpoint" (utama) — bukan "32" (penunjang) |
| Jadwal | Tabel tanggal utama (17–30 Sep); prioritas P0/P1 penunjang dipetakan ke kolomnya |
| Script video 3 mnt | Shot list utama (termasuk slot mini-beta 2:35–2:50) |
| Panic Decoder | Varian F1 (penempatan utama), bukan bagian pilar 4 |
| Screener NL | Out of scope, internal saja (utama) — bukan P2 "kalau sempat" (penunjang) |

---

## 13. Changelog v1.1 (17 Sep)

Tiga keputusan produk, menang atas kedua dokumen ide:
1. **GrupGraph inline di jawaban** — graph bukan halaman/tab sendiri; ia bagian analisis setiap Kartu Arus (ego view) dan autopsi (full view). Kontrak: Synthesis wajib mengeluarkan payload `graph {nodes, edges}`; frontend merendernya force-graph di stream chat.
2. **Autopsi Portofolio = intent chat** — "autopsi portofolio saya" menghasilkan kartu graph penuh di percakapan, follow-up kontekstual dari graph yang sama. UI tetap purpose-built (kartu + grafik di stream), tapi hanya ada SATU permukaan: chat. Tab Autopsi di `arus-mock.html` menyusul dihapus/digabung.
3. **Model: `gemini-3.8-flash`, reasoning effort medium** (menggantikan "Anthropic SDK" di stack) — tidak mengubah strategi: track-fit tetap di mata lewat orkestrasi custom + eval, dan model apa pun tetap "client" dalam tes "prompt dicabut".

---

## Lampiran A — Ide cadangan (ditolak, biar keputusan tegas)

- *Portfolio optimizer klasik* → bukan agent, jatuh ke Market Intelligence, ada di mana-mana.
- *Trading bot ritel* → PROHIBITED by rules (auto-execution).
- *News summarizer biasa* → produknya masih ada kalau prompt dicabut → gagal tes track.
- *Screening n8n workflow* → itu contoh track Automation.

**Verdict:** tiap butir rubrik terpetakan ke artefak yang bisa diperiksa — 40% → ICP + produk jalan hari ini + bukti beta; 30% video → naskah shot-by-shot + visual ikonik; 30% teknis → orkestrasi multi-agent + 2 derived assets + eval harness + commit history. Semua jalur disqualification tertutup. Sisanya eksekusi — mulai dari bikin repo hari ini.
