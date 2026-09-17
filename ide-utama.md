# idea-flagship.md — ARUS 2.0
### Flagship plan resmi · Sectors Hackathon 2026 · Track 01: AI Agents & Assistants
**Deadline:** entry/registrasi 22 Sep 23:59 WIB · build & submit 30 Sep 23:59 WIB · judging asinkron 1–8 Okt (video + repo bicara sendiri, tidak ada presentasi live)

> Catatan jujur di awal: tidak ada dokumen yang menjamin 99%. Yang bisa dilakukan adalah **memaksimalkan skor期望 di tiap rubric sampai mendekati ceiling-nya** dan menutup semua jalur kegagalan (gate pass/fail). Dokumen ini dirancang backwards dari itu: tiap fitur harus membayar salah satu dari 40/30/30, dan tiap gate punya bukti yang bisa diperiksa juri.

---

## 0. TL;DR

**ARUS** — asisten multi-agent yang membuat investor ritel IDX melihat **arus informasi, arus uang (broker per-kohort & asing), dan arus kepemilikan (grup konglomerasi)** sebelum memutuskan. Bukan sinyal, bukan advice: *"kalau kamu mau jadi ikan kecil, setidaknya jangan jadi umpan."*

**Problem statement (final, siap tempel di portal):**
> "Investor ritel IDX (10+ juta akun) membeli saham karena FOMO berita viral tanpa tahu siapa penggerak sebenarnya di balik transaksinya dan bahwa 'portofolio diversified' mereka ternyata satu grup konglomerasi — ARUS adalah asisten multi-agent yang menjawabnya dari data Sectors dalam satu percakapan, lengkap dengan counter-argument dan memori perilaku si user."

**Tiga derived assets yang tidak dimiliki produk mana pun di track ini (moat kami):**
1. **Kohort Flow Index** — alur uang *riil vs institusi/asing* per ticker per hari, diturunkan dari join Broker Activity per Symbol × Broker Registry (field `cohort`, `origin`). Tidak ada endpoint Sectors yang mengatakannya langsung; kami yang menghitungnya.
2. **GrupGraph** — graph konglomerasi emiten↔pemegang saham, diturunkan dari agregasi Shareholders Composition lintas universe + clustering (plus kepemilikan bertingkat Mining Company Ownership).
3. **Cermin Perilaku** — memori agent atas keputusan user sendiri ("3 bulan lalu kamu chase +25%, sekarang -18%").

---

## 1. Rules → desain: matriks kepatuhan total

### Gate eligibility (pass/fail — mati di sini = skor 0)

| Gate | Cara kami LOLOS + buktinya |
|---|---|
| Submission lengkap (repo publik, teaser 1 mnt, video ≤3 mnt, problem stmt, track, nama tim, post sosmed tag @sectors + template Canva) | Checklist §10, dieksekusi H-2, tidak mepet |
| Produk jalan end-to-end | Demo video **live, tanpa cut rekayasa** di 1 sesi ambil data; seed kasus cache hanya fallback, dinyatakan jujur di video |
| Sectors = core, bukan dekorasi (cabut Sectors → produk mati) | **Semua** input agent dari Sectors REST/MCP. Nol scraping sumber lain. Tidak ada "fallback Yahoo Finance" — itu bunuh diri eligibility |
| Onboarding Sectors semua anggota, diverifikasi | Selesaikan **hari ini juga** + klaim team credits (roster terkunci setelah klaim — pastikan komposisi final dulu) |
| Repo dibuat dalam build period, first commit 19 Agu–30 Sep | Commit pertama hari ini. Ide & dokumen planning (file ini) legal dibuat sebelum coding |
| Freeze saat submit | Submit **pagi 30 Sep**, bukan 23:59 — sisakan ruang kalau ada masalah portal. Setelah freeze: nol commit |
| Dilarang: eksekusi order otomatis | Tidak ada tombol beli/jual, tidak ada integrasi sekuritas. Output: fakta, skor, pertanyaan, counter-argument |
| Dilarang: financial advice | Disclaimer permanen di setiap kartu + di video. Framing: "alat riset & edukasi". Agent tidak pernah bilang "beli/jual/hold" |

### Rubric scoring

| Kriteria | Bobot | Strategi inti kami |
|---|---|---|
| Real-world usability | **40%** | ICP 10 jt akun ritel; masalah harian; **dipakai hari ini cukup ketik ticker**; + bukti sosial: mini-beta 10 pengguna nyata dari grup WA/X komunitas ritel, screenshot feedback & 1–2 testimoni masuk video (§8) |
| Video demo & storytelling | **30%** | Naskah shot-by-shot (§8): konflik manusia nyata (Rizky), satu visual ikonik (GrupGraph reveal), agent yang **membantah usernya** (momen paling shareable), closing patuh-rules yang tajam |
| Technical depth & execution | **30%** | Orkestrasi custom 6 agent + adversarial verifier + eval harness 20 kasus + commit history bersih dari hari pertama (§6: "packet bukti juri") |

### Tes track "What must be true"
> "Custom-built agent logic or orchestration… would disappear if the team's prompt is removed from someone else's client."

ARUS **tidak bisa** direplikasi oleh "Claude + MCP + prompt bagus" karena: planner dekomposisi → routing antar sumber → 5 agen paralel dengan tool-schema sendiri → **verifier silang antar agen** (klaim News vs angka Fundamentals vs aksi broker) → adversarial Bantah-Agent → synthesizer dengan structured output → memory layer → scheduler otonom. Yang hilang kalau prompt dicabut justru *hampir tidak ada*: produknya ada di kodenya.

---

## 2. ICP & masalah (bahan 40%)

**Persona — "Rizky, 29, Jakarta":** modal Rp 5–50 jt, masuk pasar karena grup WA/X/TikTok. Tidak tahu: owner di balik emiten, apakah beritanya substantif, siapa yang jualan ke dia, dan 6 saham "diversified"-nya satu grup. Pola: beli di pucuk → panic sell saat suspend → nyalahin market. Ulang.

**Insight kunci yang jadi nyawa produk:** data institusional (broker summary, komposisi pemegang, foreign flow) **sudah ada dan sudah digital** di IDX — tapi bentuknya tabel mentah yang tidak akan pernah dibaca Rizky. Sectors mengubahnya jadi API; tugas kami mengubahnya jadi **kalimat yang dia mengerti saat dia butuh** (tepat sebelum FOMO). Ini persisdefinisi "real-world usability: someone can use it today and benefit from it".

**Kenapa bukan advice:** ARUS tidak menjawab "boleh ikut gak?" — dia mengembalikan pertanyaan yang lebih baik: *"berita sudah ada 3 hari lalu, asing keluar terus, broker ritel masuk — kamu masuk sebagai siapa?"*

---

## 3. Produk: 6 fitur, masing-masing membayar rubric

### F1. Kartu Arus (chat, purpose-built UI) — membayar 40% + 30% track-fit
Satu pertanyaan → plan → 5 pilar paralel → kartu terstruktur: penggerak harga, katalis substantif-vs-viral, siapa beli & siapa jualan per kohort broker, anggota grup-nya, FOMO Meter, **counter-argument wajib sisi lawan**, disclaimer.

### F2. Kohort Flow Index — derived metric signature (teknical depth + wow)
Join per-ticker per-hari: `broker-summary-by-symbol` × `broker-registry` (`cohort: retail|mixed|institutional`, `origin: foreign|domestic`).
- Output: "**broker kohort ritel net-buy Rp 41 M / asing+institusional net-sell Rp 63 M selama 7 hari**" → distribusi dari besar ke kecil, dihitung, bukan dirasakan.
- Perkuat dengan `foreign-flow-by-symbol` (90 hari), `broker-summary-top` (top buyers/sellers), `brokers/top` ranking harian per kohort sebagai konteks market.
- Timeline "detik-detik kamu jadi exit liquidity" = adegan ikonik video.
- Validasi jujur: nama broker ≠ nama pemilik akun; tampilkan sebagai indikator statistik, bukan tuduhan. (§9)

### F3. GrupGraph + Ilusi Diversifikasi (fitur yang diingat juri)
- Bangun bipartite graph emiten↔pemegang dari `shareholders-composition` (batch lintas universe), cluster pengendali/induk sama = satu grup; tambahkan tree dari `mining-companies-ownership`.
- **Group Score**: paste ≤10 ticker → "78% nilai portofolio 'diversified' kamu ada di satu grup konglomerasi." Risiko #1 ritel yang tidak dihitung aplikasi sekuritas mana pun.
- Guanxi mapping: relasi afiliasi/supply-chain intra-grup → "kamu beli B, yang diuntungkan A."
- Visual force-directed interaktif = pembuka teaser 60 detik.

### F4. Katalis Meter (anti "hype tanpa isi")
- Lonjakan harga → tarik `news` (per symbol/tag) + `filings` + `corporate-actions` → klasifikasi **substantif vs viral**; cross-check klaim berita vs filing: *"berita bilang dapat kontrak besar — filing-nya tidak ada."*
- ⚑ struktural: `suspensions` history + `free-float` kecil = "gampang digoreng, bisa disetop kapan pun".

### F5. Morning Arus (autonomous execution — bukti track requirement)
Cron 08:30 WIB: `close` full-universe + `top-changes` + `most-traded` → deteksi anomali (z-score volume, spike harga, news spike) → jalankan 4 pilar per anomali → brief harian 10 entri dengan counter-argument. Zero user action.

### F6. Cermin Perilaku (memory layer)
SQLite per user: riwayat keputusan + watchlist. Agent memanggil pola lama saat user mau mengulanginya. Menyerang masalah sesungguhnya (perilaku), bukan cuma informasi — inilah yang membuat juri merasa produk ini *untuk manusia*, bukan demo API.
Panic Decoder (varian F1 saat user panik merah): katalis apa, historinya N kali segini lalu bagaimana, fundamental kuartalan berubah/tidak. Menenangkan dengan bukti.

**DIBUANG dari scope (keputusan tegas):** optimizer portofolio klasik, trading bot (prohibited), news summarizer (gagal tes track), multi-market SGX/MY, screener NL penuh (`screener/companies` dengan `q` sudah support — kami pakai internal saja, tidak dipamerkan).

---

## 4. Arsitektur agent (bahan 30% technical depth)

```
User / Scheduler(cron 08:30)
   ▼
[1 PLANNER/ROUTER]  intent → task graph → subset pilar (valuasi tidak panggil broker endpoint)
   ▼
[5 SPESIALIS — paralel; custom tool-loop, schema output JSON sendiri, cache-first]
 Mover      : close, daily, top-changes, most-traded, index-daily, idx-total
 Flow       : broker-summary-by-symbol, broker-summary-top, broker-activity-*, brokers/top,
              broker-registry, foreign-flow-by-symbol, filings(insider)
 News       : news, tags, corporate-actions, suspensions
 Fundamentals: company-report(sections!), quarterly-financials, sector-report,
              company-segments, free-float, screener
 Graph      : shareholders-composition(batch) → cluster → grup; mining-ownership
   ▼
[2 VERIFIER]    klaim tiap agen dicek silang: angka harus ada di JSON tool output (grounding check,
                zero-numeric-hallucination policy); konflik antar agen → rekonsiliasi atau tampilkan dua-duanya
   ▼
[3 BANTAH-AGENT] adversarial: wajib menyusun case terkuat MELAWAN kesimpulan (bear vs bull)
   ▼
[4 SYNTHESIS]   Kartu Arus: skor + bukti per pilar + ⚑ + counter-argument + disclaimer
   ▼
[5 MEMORY]     profil perilaku, keputusan lalu, watchlist → personalisasi F6
```

Yang dicoret juri dari requirement track, eksplisit di README: multi-step reasoning ✅ · custom tool-use pipeline ✅ · routing antar sumber ✅ · memory/state ✅ · autonomous execution ✅ · purpose-built interface ✅.

**Stack sengaja membosankan & cepat:** Next.js + shadcn · FastAPI/Node · Anthropic SDK (tool-use + structured output) · SQLite · force-graph.js. **Tanpa framework agent berat** — (a) orkestrasi custom lebih jelas "of its own" di mata juri, (b) lebih gampang didebug dalam 13 hari, (c) lebih mudah dibela saat audit repo. Pattern mengikuti resep resmi docs (Tool Use, Multi-Agent Workflows, Structured Output, Conversational Memory, Human-Agent Framework) — menyebutnya di README = sinyal kami belajar dari platformnya.

**Budget 1.000 credits (hard constraint):** cache disk penuh — full-universe 1×/hari, shareholders 1×/minggu/ticker, broker summary 1×/hari/ticker watchlist saja; percakapan read dari cache. Estimasi dev+demo < 300; reserve 40%+ untuk shooting video ulang. Rate-limit-aware planner: batch + dedupe + circuit breaker.

---

## 5. Kill test Sectors (dipertunjukkan, bukan cuma diklaim)

Cabut Sectors → hilang semua input: harga, broker flow, ownership, news, filings, suspensi, financials. Sisa UI kosong. ✅
**Bukti extra untuk juri:** satu commit di repo bernama `sectors-deps.txt`/diagram yang memetakan 20+ endpoint → fitur, dan satu segmen video 5 detik menampilkan error state "Sectors data unavailable" saat key dummy dipasang. Kill test yang *diperlihatkan* mengalahkan klaim.

---

## 6. "Judging evidence packet" — karena technical depth diverifikasi dari GitHub

Repo harus meyakinkan juri yang scroll 20 menit tanpa nanya:
1. **README** = arsitektur diagram (seperti §4), tabel endpoint→fitur, why-multi-agent (termasuk kenapa bukan "prompt di Claude"), limitasi data yang diakui jujur.
2. **`eval/` harness**: 20 pertanyaan uji → jawaban dicek otomatis terhadap data mentah Sectors (asserti angka-angka kunci) → `EVAL_REPORT.md` dengan skor & contoh kegagalan yang diperbaiki. Anti-"faked for demo", langsung menjawab kalimat rubric.
3. **Commit history** linear dari hari ini, pesancommit rapi, PR per fitur — bukti karya selama build period.
4. **`SEED.md`**: daftar kasus demo + timestamp snapshot respons API yang dipakai (reproducibility).
5. `.env.example` bersih; API key dihapus sebelum submit (cek ulang 2× — gatesosial & repo).
6. Live deploy opsional; kalau ada, taruh link di README (tidak wajib — video end-to-end sudah cukup untuk gate).

---

## 7. Diferensiasi: kenapa menang head-to-head

Perkiraan komposisi lapangan: mayoritas submission = "chat dengan data Sectors" atau dashboard + LLM summary. Kami menang karena membawa **aset data turunan** (Kohort Flow Index, GrupGraph) yang mustahil dibuat dari satu prompt, **satu narasi yang tidak bisa ditiru** (ikan kecil vs arus — 10 juta orang Indonesia tahu persis rasanya), dan **agent yang membantah usernya** (semua agent lain cuma mengiyakan). FOMO Meter + counter-argument wajib juga membuat produk kami satu-satunya yang *desainnya anti-rekomendasi* — selaras rules, elegan di mata juri yang menulis rules itu.

---

## 8. Produksi video (30% — diperlakukan sebagai deliverable #1, bukan sisa waktu)

**Teaser 60 detik (publik, YouTube/IG):** layar penuh GrupGraph menyala → satu saham +40% karena "berita X" → zoom-out: 6 saham satu grup tersambung → teks: *"Ikan kecil lihat harga. ARUS lihat arus."* → end card + disclaimer.

**Judging 3 menit, shot list:**
- 0:00–0:30 — Rizky (rekan setim, akting tipis) chase saham viral → merah. Teks: "Bukan salah dia. Salah akses."
- 0:30–1:45 — **satu pertanyaan real, live, tanpa cut rekayasa**: "kenapa XXXX naik, boleh ikut?" Kartu Arus terbentuk; penekanan di Bantah-Agent mematahkan argumen beli user. Juri suka agent yang melawan usernya.
- 1:45–2:15 — Portfolio Autopsy → "78% portomu satu grup" → **GrupGraph reveal** (adegan poster).
- 2:15–2:35 — cut ke 08:30: Morning Arus muncul sendiri; scroll 10 anomali pagi itu.
- 2:35–2:50 — Cermin Perilaku: "3 bulan lalu kamu juga begini." + **screenshot feedback mini-beta 10 pengguna nyata**, 1 testimoni dibacakan.
- 2:50–3:00 — closing: "Ritel tidak butuh sinyal. Ritel butuh mata. — Kami tidak memberi rekomendasi. Itu disengaja." + disclaimer penuh.

**Mini-beta (pengungkit 40% termurah):** H+5, rekrut 10–15 pengguna dari komunitas ritel (X/WA/Discord), minta 3 pertanyaan nyata mereka dijawab + feedback 2 kalimat. Bukan cuma buat testimoni — bug report mereka menaikkan kualitas produk inti.

**Audio/subtitle:** Bahasa Indonesia (video diterima kedua bahasa, tidak ada keberpihakan), subtitle hard-burn (banyak juri nonton tanpa suara di hari ramai 1–8 Okt). Rekam sebelum freeze; jangan pernah rekam ulang setelah submit.

---

## 9. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Nama pemegang tidak konsisten antar emiten → graph salah cluster | normalisasi string + fuzzy + daftar manual 30 grup besar (known list) untuk akurasi demo; label "kemungkinan relasi", jangan klaim 100% |
| Kohort broker = proxy, bukan identitas pemilik akun | framing statistik ("broker yang dipakai ritel net-jual"), bukan tuduhan; limitasi ditulis di kartu |
| Hallucination angka | zero-numeric-hallucination policy di Verifier; eval harness §6; synthesizer hanya boleh mengutip tool JSON |
| Credit habis | §4; demo pakai sesi cache; shooting video = fase dengan cadangan terbesar |
| Waktu ambyar (13 hari) | go/no-go 25 Sep: kalau F1+F2+F3 belum demo-able, buang F5/F6 ke versi "design in README, screenshot mock" — **jangan pernah tampilkan fitur palsu di video**; juri cek repo |
| Dituduh bukan karya build period | repo dibuat hari ini, history linear, tanpa migrasi kode lama |
| Lupa freeze / API key lolos | checklist §10 dieksekusi H-2 dan H-1 oleh dua orang berbeda |

---

## 10. Eksekusi 13 hari + checklist submit

| Tgl | Milestone |
|---|---|
| 17 Sep | **SEKARANG:** onboarding semua anggota, klaim team credits (roster terkunci — finalkan tim dulu), buat repo + first commit (scaffold), registrasi portal |
| 18–20 | Data layer: client Sectors + cache + 20 tool wrappers; F2 prototype offline (buktikan Kohort Flow Index dari data mentah dulu, UI belakangan) |
| 21–23 | Planner + Mover/Flow/News/Fundamentals + F1 Kartu Arus + F4; eval harness jalan |
| 24 | **Gate tengah:** F1 end-to-end demoable. Tidak lewat → potong scope, kunci ke F1–F4 |
| 25–27 | F3 GrupGraph (Graph-Agent + visual + Group Score) — ini fitur pamungkas, butuh 2–3 hari penuh |
| 28 | F5 Morning Arus + F6 memory (versi minimal), rekrut mini-beta |
| 29 | Rekam video (2 take), screenshots, README/EVAL_REPORT final, post sosmed |
| 30 Sep pagi | **SUBMIT** (ceklist: repo publik & tanpa key, teaser publik, judging video bisa diakses, problem statement, track + nama tim, post sosmed tag @sectors + template Canva). lalu DIAM — freeze total sampai pengumuman 9 Okt |

**Verdict:** desain ini memetakan tiap butir rubric ke artefak yang bisa diperiksa: 40% → ICP + produk jalan hari ini + bukti beta; 30% video → naskah shot-by-shot + satu visual ikonik; 30% teknis → 6-agent orchestration + 2 derived assets + eval harness + commit history. Semua jalur disqualification tertutup. Sisanya tinggal eksekusi — mulai dari bikin repo hari ini.
