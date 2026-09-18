# PRD — ARUS v7 (LLM-first: paham bahasa liar, reasoning berlapis, angka tetap kode)

**Produk:** asisten multi-agent ritel IDX. Satu chat → satu Kartu Arus (2 lapis: teknis + awam) untuk pertanyaan apa pun —
dari yang standar (`kenapa ANTM naik?`, `yield BMRI aman?`) sampai yang liar (`apa sih nama saham untuk Indomaret?`,
`kalau coal jatuh, hulu–hilir grup ADRO gimana?`) — dijawab <60 detik dari data Sectors, dengan verdict probabilistik,
sitasi per angka, bantahan, memori perilaku, dan kartu shareable.
**Track:** Sectors Hackathon 2026 · Track 01 AI Agents & Assistants
**Tanggal:** 19 Sep 2026 · v7.0 · evolusi dari v6 (healing + fundamental + output 2 lapis). Konflik → dokumen ini menang.
**Tagline:** *Ikan kecil lihat harga. ARUS lihat arus — uang, barang, kuasa.*
**Sifat:** alat riset & edukasi. Bukan nasihat keuangan. Tanpa eksekusi order. Disclaimer permanen.

> **Perubahan inti v7 — mengapa dokumen ini dirombak.** Evaluasi v6 menemukan kelemahan struktural: **router/parser
> keyword tidak akan pernah cukup untuk pertanyaan liar.** Pengguna asli tidak mengetik menurut daftar kata kami.
> Karena itu pembagian tugas dibalik: **LLM memahami bahasa** (multi-intent, brand→ticker, maksud screener, rencana
> hop), **kode memegang hal yang obviously deterministic by nature** (angka, verifikasi, guard, kredit, cache, format).
> Heuristik v6 tetap hidup sebagai jaring pengaman — bukan otak.

---

## 1. Problem statement (final, tempel ke portal)

> "Investor ritel IDX (10jt+ akun, mayoritas nilai transaksi ritel, herding tinggi) bertanya dengan bahasa manusia yang
> liar dan tidak bisa ditebak daftar kata kuncinya. ARUS v7 memakai LLM untuk memahami maksudnya (termasuk pertanyaan
> tanpa ticker seperti 'saham Indomaret apa?' dan pertanyaan berlapis seperti 'hulu grup bermasalah, hilirnya gimana?'),
> lalu menjawab dengan **reasoning yang bisa diaudit**: setiap angka dihitung kode dari join Sectors yang tidak
> disediakan endpoint manapun, setiap relasi punya sitasi, kausalitas dinyatakan kondisional, bantahan selalu disertakan —
> dalam satu percakapan <60 detik, tanpa login, dengan kartu shareable."

---

## 2. ICP & momen pakai

**Persona: "Rizky/Rani, 27–29, karyawan Jakarta, modal 5–50jt, 3–4 saham bank + 1–2 tambang/gorengan nyangkut (BRMS, BUMI, ANTM, ADRO)."** Tidak baca laporan keuangan 300 hlm. HP-first. Butuh jawaban sebelum klik BUY.

| # | Momen | Contoh pertanyaan | Yang dijawab |
|---|---|---|---|
| 1 | Baca pompom di grup WA/Telegram | `SMAR mau ke 500?` | FOMO berbasis data + distribusi ritel + filing → verdict |
| 2 | Sebelum klik BUY | `kenapa ANTM naik?` | return, kohort uang, asing, insider |
| 3 | Pegang tambang, harga komoditas gerak | `coal naik kok ADRO turun?` | divergence komoditas vs volume + exposure |
| 4 | Curiga bandar | `broker YP aman?` | fingerprint broker: distribusi/conduit asing |
| 5 | Panik merah / ex-date / likuiditas | `risiko BUMI apa?` · `ex-date BMRI kapan?` | drawdown, suspensi, kalender, likuiditas |
| 6 | Anomali sebelum buka | `scan pagi` | GNN-lite dari close 90hr |
| 7 ★ | **Pertanyaan "bodoh" yang manusiawi** | `apa sih nama saham untuk Indomaret?` | **entity resolver:** brand → kandidat emiten → verifikasi Sectors |
| 8 ★ | **Pertanyaan brutal berlapis** | `kalau coal jatuh, siapa di grup ADRO yang paling kena? hulu bermasalah, hilirnya gimana?` | **graph reasoning:** hop terverifikasi + narasi kondisional + bantahan per hop |
| 9 ★ | **Kueri liar tanpa kata kunci kami** | `yang lagi diskon tapi untungnya gede` · `bank gede yang bagi hasilnya royal` | **query compiler:** LLM menerjemahkan niat → parameter Sectors tervalidasi |

---

## 3. Prinsip produk (mengikat semua fitur)

1. **LLM memahami, kode menghitung.** Tidak ada satu angka pun yang lahir dari LLM; semua dari Sectors atau aritmetika kode. Tidak ada ticker/slug/edge yang diklaim tanpa verifikasi.
2. **Deterministik hanya untuk yang by nature deterministik:** metrik, grounding ±0.5%, guard nasihat, biaya/ledger/cache, validasi enum/schema, format, fixture SEED, merge multi-intent.
3. **Fallback jujur.** Tanpa `OPENROUTER_API_KEY` → heuristik + sintesis deterministik tetap menerbitkan kartu. Tanpa Sectors / live gagal → "data tidak tersedia", bukan karangan.
4. **Kausalitas kondisional.** "Jika A tertekan → B berpotensi ikut (karena hubungan X, sitasi Y)" — bukan vonis sebab-akibat. Bantahan selalu ada.
5. **Gap ARUS ≠ limit API.** Semua pesan "belum didukung" menyebut API-nya ada; kami tidak menyembunyikan keterbatasan implementasi di balik seolah-olah platform yang kurang.

---

## 4. Fitur

| Fitur | Status | Inti |
|---|---|---|
| F1 Kartu Arus unified (2 lapis) | ✅ | verdict + keyakinan + bukti bersitasi + bantahan + Bagian 2 awam per istilah |
| F2 Kohort Flow | ✅ | broker-summary × registry × foreign-flow × filings → distribusi/akumulasi |
| F3 GrupGraph + Autopsi | ✅ | ownership → union-find → Group Score |
| F4 Katalis & berita vs filing | ✅ | news × filings × corporate-actions × suspensions |
| F5 Dividend Guard | ✅ | riwayat yield, konsistensi, ex-date |
| F6 Kalender & Likuiditas | ✅ | corporate-actions, daily 20hr |
| F7 Scan Pagi (GNN-lite) | ✅ | anomali korelasi 90hr |
| F8 Rumor Verifier + Share | ✅ | klaim × evidence → `/k/{id}` + OG |
| F9 Rantai Barang | ✅ | commodity → emiten → volume/sales-destination → divergence |
| F10 Broker DNA | ✅ | broker-activity → fingerprint pola |
| F11 Kalender Kuasa | ✅ | cluster insider + rights wave |
| F12 Screener & Fundamental | ✅ | screener `where/order_by` (+filter sektor via helper slug) · report 8/8 section · quarterly · segmen |
| F13 Query Compiler (LLM-first) | ✅ | 1 call → JSON tervalidasi: intents · tickers · entities · mode · screen · sektor · komoditas · ranking · hops |
| F14 Entity Resolver | ✅ | brand/nama → kandidat → verifikasi `§overview` → jawaban identitas + alternatif, atau jujur tak ada |
| F15 Graph Reasoning (rantai konglomerasi) | ✅ | hop ownership/affiliate/contractor/buyer/segment → claim graph bersitasi → narasi kondisional + bantahan per hop |

Semua fitur yang sudah ✅ diuji `npm run eval` **53/53 offline (0 kredit)** — target ≥45 terlampaui.

---

## 5. Arsitektur ringkas (penuh di `ARCHITECTURE.md`)

```
USER (HP, zero-login)
 ▼
[QUERY COMPILER  — LLM]  JSON: intents[] · tickers[] · entities[] · mode · screen · sektor · komoditas · hops[]
 ▼
[VALIDATOR — kode]  enum? ticker ∈ pesan/portofolio atau terverifikasi Sectors? slug ∈ daftar? kandidat entitas?
 ▼ (invalid/tanpa key → fallback heuristik ✅)
[EXECUTOR per intent]  evidence (26/54 endpoint ✅) · entity resolver ✅ · chain/claim graph ✅ → mergeBuilds() ✅
 ▼
[COMPUTE — kode]  metrik ✅ · fundamental ✅ · grup ✅ · divergence/DNA/cluster/GNN ✅
 ▼
[GROUND ±0.5% ✅] → [GUARD ✅] → [SYNTHESIS 5 peran LLM, divalidasi ✅ / deterministik ↩]
 ▼
[KARTU 2 LAPIS ✅] → [SHARE /k/{id} + OG ✅]
```

**Kredit:** tim 1.000 kredit. Default sesi `SECTORS_BUDGET=6kr` (hemat, bukan plafon); biaya per docs Sectors
(report 1kr/section · quarterly 1kr/kuartal · screener 1kr · helper 1kr · segmen 1kr · ranking 1–2kr · mining ±1kr).
Cache/TTL/404 negatif/breaker + badge ⚡ + ledger tampil di kartu. **Nol panggilan live saat dev** — semua uji `SEED=1`.

**Kejujuran (kill test):** cabut Sectors → seluruh angka hilang, error `Sectors data unavailable`; nol fallback pihak
ketiga. `SEED=1` selalu berlabel SEED. Limitasi tampil di kartu: broker = proxy kohort; DNA = pola historis; ownership &
relasi grup = laporan terakhir + label "kemungkinan relasi"; proyeksi analis = pihak ketiga; komoditas monthly; EOD.

---

## 6. Timeline 19–30 Sep 2026 + acceptance

| Tgl | Milestone |
|---|---|
| 19 ✅ | v6 + model `google/gemini-3.8-flash` (effort `high`) + output 2 lapis + P0-Fundamental; **v7: F13 compiler + F14 entity + F15 rantai + P0-Ranking/Pasar + P1-Mining (commodities generik, IUP, contracts)**; eval 34 → 53; verifikasi live 11kr |
| 20–21 ✅ | **F13 Query Compiler** + heuristik jadi fallback; eval kasus compiler |
| 21–22 ✅ | **F14 Entity Resolver** (brand→ticker terverifikasi); eval kasus ada/tidak |
| 22–24 ✅ | **F15 Graph Reasoning** (hulu→hilir konglomerasi); eval positif + negatif |
| 24–27 | Sisa paket endpoint opsional: listing-performance, sector-report, sites/resources/exports (gap terbuka, label jujur); tuning biaya live bersama user |
| 27–29 | Hardening: demo/video · docs sinkron · verifikasi live dengan `SECTORS_BUDGET` sadar |
| 30 pagi | Verifikasi kedua → **SUBMIT** → freeze (nol perubahan setelah submit) |

**AC v7:** eval **53/53** offline tanpa exception · compiler 100% tervalidasi · entitas tak pernah mengarang ticker ·
rantai 100% klaim bersitasi · 0 angka tak-grounding · ≤ `SECTORS_BUDGET`/sesi · HP tanpa login <60s · permalink+OG ·
MCP tetap hidup · tanpa key → deterministik ↩ · tanpa Sectors → error jujur · guard blokir 100% anjuran · docs sinkron.

---

## 7. Demo (30%) — adegan baru

| Waktu | Adegan |
|---|---|
| 0:20–1:00 | `BRMS mau ke 500?` → verdict `tak-didukung` + kohort + bantahan |
| 1:00–1:25 | `coal naik kok ADRO turun?` → Sankey + divergence |
| 1:25–1:55 ★ | `apa sih nama saham untuk Indomaret?` → kandidat → verifikasi Sectors → jawaban + alternatif |
| 1:55–2:30 ★ | `kalau coal jatuh, siapa di grup ADRO yang kena?` → rantai hop + sitasi per edge + bantahan |
| 2:30–2:50 | `saham bank gede yang murah?` → screener + filter sektor via helper slug |
| 2:50–3:00 | "Ritel tidak butuh sinyal. Ritel butuh mata. Kami tidak memberi rekomendasi — itu disengaja." + disclaimer |

---

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| LLM halusinasi ticker/edge/angka | validator enum + verifikasi Sectors + grounding/guard dieksekusi + fallback deterministik |
| Scope F13–F15 > waktu | fence bertahap (compiler tanpa `hops` dulu); eval per fase; potong diagram, bukan kejujuran |
| Kredit reasoning berlapis | hop/kandidat dibatasi; cache-first; ledger di kartu; budget environment |
| Git/commit history | blocker #1 hardening; dikerjakan lebih awal, bukan H-1 |
| Pertanyaan di luar cakupan | jawab jujur "gap ARUS, API ada" + usul pertanyaan lanjutan; tidak menebak |
| Disalahartikan advice | disclaimer permanen + guard + verdict kondisi, bukan perintah; kausalitas kondisional |

**Verdict v7:** v6 membuktikan angka bisa dijaga kode; v7 membalik sisi input — bahasa liar diurus LLM, eksekusi dan
bukti tetap deterministik. Reasoning berlapis dijual sebagai **claim graph bersitasi**, bukan narasi bebas; itulah
bedanya dengan "tanya LLM biasa".