# PRD — ARUS v5 (Tiga Arus: Uang, Barang, Kuasa)

**Produk:** asisten multi-agent ritel IDX. Satu chat → satu Kartu Arus untuk semua pertanyaan (`kenapa naik?` · `paste pompom` · `autopsi portofolio` · `dividen aman?` · `ex-date kapan?` · `coal naik kok ADRO turun?` · `broker YP aman?`), dijawab <60 detik dari data Sectors, dengan verdict + probabilitas + sitasi + counter-argument + memori perilaku — dan kartunya bisa dibagikan balik ke grup WA tempat pompom itu lahir.
**Track:** Sectors Hackathon 2026 · Track 01 AI Agents & Assistants
**Tanggal:** 18 Sep 2026 · v5.0 · evolusi dari v4 (deploy + rumor + calib + MCP 5 tools). Konflik → dokumen ini menang.
**Tagline:** *Ikan kecil lihat harga. ARUS lihat arus — uang, barang, kuasa.*
**Sifat:** alat riset & edukasi. Bukan nasihat keuangan. Tanpa eksekusi order. Disclaimer permanen.

> **v5 = v4 + pengali inovasi Sectors API.** v4 sudah max usability; v5 menyerang kalimat rubrik technical yang tersisa:
> - *"How innovative is the use of Sectors API or MCP?"* → **pakai bagian Sectors yang tidak dipakai tim lain**: 15+ endpoint Mining extension + `broker-activity/{code}` inversion + `corporate-actions/` calendar future + recipe GNN Anomaly resmi Part 1-3.
> - v1-v4 hanya pakai IDX equity + broker per-symbol + ownership IDX. v5 menambah **Tiga Arus**: Arus Uang (v4) + **Arus Barang** (komoditas→emiten) + **Arus Kuasa** (insider + izin + event cluster).
>
> **Eksekusi di atas repo `sectors/` yang sudah ada** (first commit 17 Sep, di dalam build period). v5 adalah delta, bukan repo baru — rules: satu tim satu proyek, repo dibuat dalam jendela build.

---

## 1. Problem statement (final, tempel ke portal)

> "Investor ritel IDX (10jt+ akun, 51% nilai transaksi, 84,6% herding) nyangkut di saham tambang/gorengan tanpa tahu harga komoditasnya turun, izin tambangnya mau habis, brokernya spesialis distribusi, dan direksinya lagi jualan bareng — ARUS v5 menjawabnya dalam satu percakapan <60 detik dari join Sectors yang tidak disediakan endpoint manapun, lengkap dengan verdict probabilistik, sitasi per angka, counter-argument, dan kartu shareable."

---

## 2. ICP & 6 momen pakai (bahan 40%)

**Persona: "Rizky/Rani, 27–29, karyawan Jakarta, modal 5–50jt, 3–4 saham bank + 1-2 tambang/gorengan nyangkut (BRMS, BUMI, ANTM, ADRO)."** Tidak baca AR 300hlm. HP-first. Butuh jawaban sebelum klik BUY.

| # | Momen (frekuensi) | Intent | Fitur |
|---|---|---|---|
| 1 | Baru baca pompom di grup WA/Telegram (harian) | `paste rumor` | F8 Rumor Verifier |
| 2 | Sebelum klik BUY di app sekuritas (harian) | `kenapa ANTM naik? boleh ikut?` | F1 + F2 Kohort + F4 Katalis |
| 3 | Pegang tambang, harga coal gerak (harian-mingguan) ★BARU | `coal naik kok ADRO turun?` | **F9 Rantai Barang** |
| 4 | Curiga bandar / broker tertentu (harian) ★BARU | `broker YP yang borong ini aman?` | **F10 Broker DNA** |
| 5 | Panik merah / takut nyangkut / kelewat ex-date (mingguan-bulanan) | `anjlok`, `ex-date BMRI kapan?`, `likuid?`, `yield 12% aman?` | F5 Dividend + F6 Calendar/Liquidity + Panic + Cermin |
| 6 | Cek anomali on-demand sebelum pasar buka (harian) | tombol Scan Pagi | F3 Autopsi GrupGraph + GNN-lite on-demand ★ |

Kenapa menang 40%: menjawab di momen keputusan <60s, tanpa login, dan khusus v5 — satu-satunya yang menjelaskan **saham tambang dengan barangnya** (bukan cuma chart-nya).

---

## 3. Delta v5 atas v4

### 3.1 Yang dipertahankan dari v4 (jangan disentuh)

F1 Kartu Arus unified · F2 Kohort Flow Index · F3 GrupGraph + Autopsi · F4 Katalis Meter · F5 Dividend Guard · F6 Calendar+Liquidity · F7 Scan Pagi on-demand + Cermin · F8 Rumor Verifier + Share `/k/{id}` + OG · orkestrasi planner→spesialis→compute→credit-guard→verifier±0.6%→decider→Bantah→synthesis (`gemini-3.8-flash`, dilarang bikin angka)→guard→memory · credit engine + ratelimit per-IP · calib harness · MCP 5 tools · eval 40 hijau.

### 3.2 Tiga derived asset baru ★ (core inovasi v5)

**F9. Rantai Barang — `commodity → emiten` (headline technical).**
Join yang tidak ada di endpoint manapun:
`mining/commodities/{name}/price` (3thn, monthly) × `mining-companies/performance` (volume, strip ratio, reserves) × `mining-companies/financials` (USD) × `mining/sales-destination/{slug}` (exposure negara) × `mining/exports/?commodity_type=coal&year=` (demand China/India, BPS vs ESDM) × `mining/contracts/` (owner→contractor) × `mining/licenses/` + `license-auctions-detail` (expiry risk) × IDX `quarterly-financials + daily 90hr + foreign-flow 90hr`.
Compute di code:
- `Divergence Score`: `coal +12% tapi volume -20% / strip naik` = naik tanpa barang ⚑
- `Komoditas Health`: tren harga 12bln + posisi vs cost (financials) + ketergantungan 1 negara (>60% ke 1 negara ⚑)
- `Izin Flag`: `IUP habis <12bln / lelang gagal / kontraktor ganti` ⚑
Contoh kartu: *"Coal naik, tapi ADRO volume turun 20% dan 68% sales ke China yang import-nya turun — kenaikan ini tidak didukung barangnya. verdict campuran 0.58 (conf 0.66)."*

**F10. Broker DNA — balik sumbu query (inversion).**
v1-v4: `broker-summary-by-symbol` per saham.
v5 tambah: `broker-activity/{broker_code}/` (semua saham disentuh 1 broker, 14hr) untuk top-20 broker × `broker-activity-top` (top akumulasi/distribusi per broker) × `brokers/top?origin+cohort` × `broker-registry`.
Compute di code: fingerprint per broker — `spesialis gorengan / conduit asing (f_* share tinggi) / mesin distribusi (top-seller repeat)` + hit-rate pattern 90hr.
Contoh kartu: *"YP net-buy BRMS Rp 8M 10hr, tapi DNA-nya: 3x pattern distribusi saham se-tipe 90hr terakhir (precision 0.71 di calib). verdict distribusi 0.74."*

**F11. Kalender Kuasa — event + insider clustering.**
`corporate-actions/?type=dividend,upcoming_dividend,right_issue,stock_split,agm` (`end` boleh future = kalender, 1kr/type) × `filings/` insider universe × `suspensions/` universe × `news/?tags=` × `latest-quarterly-dates`.
Compute di code: cluster detector — `≥4 insider sell 1 subsektor 7hr` / `rights-issue wave` / `ex-date congestion 5 emiten seminggu` → flag di Kartu.
Contoh: *"3 direksi bank jualan seminggu ini — bukan 1 emiten, 1 sektor."*

**F12. GNN-lite agent-driven (ikut resep resmi).**
Implementasi ringan `recipes/gnn-anomaly-detection/01-03` tanpa training torch di runtime: correlation graph dari `close full-universe` + 11 fitur (return/vol/vol-spike/SMA/vol-regime/sharpe, sama seperti resep) → anomaly score code (z + reconstruction heuristic) → konfirmasi Part-3 `broker + foreign-flow`. Sitasi resep di README = sinyal kami membangun di atas platformnya.

### 3.3 Yang dibuang / dibatasi

Jev sebagai core (tetap adapter opsional) · screener `q=` pamer (internal `where=` 1kr) · IPO/kamus LK halaman sendiri · komparator halaman sendiri (tetap intent chat) · multi-market SGX/KLSE sebagai core — SGX `short-sell / buybacks / news` + KLSE hanya **konteks opsional berlabel** (1 call max), bukan janji. **Baru di v5:** fitur apapun yang tidak lolos *"dipakai di salah satu 6 momen §2?"* ditolak. Freeze fitur 25 Sep.

---

## 4. Fitur final (F1–F11)

| Fitur | Momen | Sectors core | Rubrik |
|---|---|---|---|
| F1 Kartu Arus unified | 2 | Mover: daily, close universe, top-changes, most-traded, idx-total, index-daily-universe | 40+30 |
| F2 Kohort Flow Index | 2 | broker-summary × registry + foreign-flow 90hr + filings insider + deteksi distribusi | 30 wow |
| F3 GrupGraph + Autopsi | 6 | company-report §ownership batch → union-find + mining-ownership tree → Group Score | 30+30 poster |
| F4 Katalis Meter | 2 | news × filings × corporate-actions × suspensions × free-float | 40 |
| F5 Dividend Guard | 5 | report §dividend 5thn + corporate-actions + FCF | 40 |
| F6 Calendar + Liquidity | 5 | corporate-actions?type=spesifik + latest-quarterly-dates + free-float + daily 90hr + suspensions | 40 |
| F7 Scan Pagi + Cermin | 5,6 | scan on-demand GNN-lite → 10 anomali + counter; SQLite tesis/watchlist/pola | manusiawi |
| F8 Rumor Verifier + Share | 1 | klaim × evidence pack 8 endpoint → verdict + `/k/{id}` + OG | 40+30+30 |
| **F9 Rantai Barang ★** | 3 | commodity-price + performance + financials + sales-destination + exports + contracts + licenses + quarterly/daily/foreign | **30 max** |
| **F10 Broker DNA ★** | 4 | broker-activity/{code} + activity-top + brokers/top + registry → fingerprint | **30 max** |
| **F11 Kalender Kuasa ★** | 5 | corporate-actions calendar future + filings + suspensions + news tags → cluster | **30 max** |

---

## 5. Arsitektur (delta ★, diagram penuh di `ARCHITECTURE.md`)

```
USER (HP zero-login)
 ▼
[UI] chat + chips 🔥📊🕸️📅⛏️ + streaming trace + kartu collapsible + Share
 ▼
[ROUTER code+LLM ringan] intent: rumor · kenapa-gerak · barang★ · dna★ · kuasa★ ·
  autopsi · dividen · kalender · likuiditas · banding · pagi · risiko → subset pilar
 ▼
[9 SPESIALIS paralel — tool-loop+schema+validator+cache]
  Mover / Flow / News / Fundamentals / Graph / Income-Calendar (v4 tetap)
  Barang★: commodities-price, mining-performance/financials/detail,
           sales-destination, exports, global-commodity, production,
           resources-reserves, sites, contracts, licenses, auctions
  DNA★: broker-activity/{code} top-20, activity-top, brokers/top, registry
  Kuasa★: corporate-actions calendar future, filings, suspensions, news/tags,
          latest-quarterly-dates
 ▼
[COMPUTE code — LLM dilarang berhitung] Kohort · Group Score · FOMO · Dividend ·
  Liquidity · countdown · Divergence★ · DNA fingerprint★ · Cluster★ · GNN score★
 ▼
[CREDIT GUARD★] budget/sesi 6kr + dedupe + badge ⚡ + ledger
 ▼
[VERIFIER code] grounding ±0.6% → buang tak berdasar
 ▼
[DECIDER code] composite + confidence gate (≥aksi tampil; medium konfirmasi; rendah data-kurang)
 ▼
[BANTAH-AGENT] kasus terkuat melawan kesimpulan
 ▼
[SYNTHESIS gemini-3.8-flash] prosa ID + payload graph{nodes,edges} + sankey★ + peta★
 ▼
[GUARD] disclaimer wajib · blokir anjuran eksplisit · blokir klaim tanpa sitasi
 ▼
[MEMORY SQLite] tesis · watchlist · pola chase
 ▼
[SHARE] snapshot immutable → /k/{id} + OG

SIDE-CAR: [CALIB] distribusi_ritel · FOMO≥80 · divergence★ · DNA hit-rate★ → CALIB_REPORT.md
          [MCP] 8 tools: 5 v4 + commodity_chain★ · broker_dna★ · event_cluster★
```

Checklist track (README): multi-step ✅ · custom tool-use 35+ endpoint ✅ · routing ✅ · memory ✅ · purpose-built interface ✅ · **menerbitkan MCP sendiri** ✅.

### 5.1 Prinsip inovatif tapi hemat kredit (jawab rubrik 30% technical)

Rumus: **join yang tidak ada di endpoint manapun + compute di code + fetch minimal.** Juri tidak nilai banyaknya call, tapi `Sectors dicabut = produk mati` + `join tidak bisa dibuat dari 1 prompt`.

- **Inovasi = 3 join turunan:** F9 `commodity→emiten` (Divergence + Health vs cost + exposure >60% + Izin <12bln di `lib/barang.ts`), F10 inversion `broker-activity/{code}` top-20 → fingerprint `spesialis gorengan / conduit asing / mesin distribusi` di `lib/dna.ts`, F11 `corporate-actions future` × filings × suspensions → cluster detector di `lib/kuasa.ts`. Semua hitung di code, LLM hanya narator ID, dilarang bikin angka. Diekspos ulang sebagai 3 MCP tools (`commodity_chain`, `broker_dna`, `event_cluster`) dengan pipeline sama dengan chat — cabut Sectors = MCP mati.
- **Hemat = 5 aturan keras di `lib/credit.ts`:** (1) Router pilih subset pilar saja — tanya DNA jangan fetch mining. (2) `where=` (1kr) > `q=` (3kr); `sections=`/`type=` spesifik, jangan `all-8/all-7`. Window kecil: broker ≤14hr, daily/foreign ≤90hr, kalender ≤90hr, komoditas ≤3thn monthly. (3) Cache + dedupe + ledger: universe 1×/hari, ownership 1×/minggu, commodity-price 1×/minggu, performance/financials 1×/kuartal, contracts/licenses 1×/bulan. Budget 6kr/sesi + badge `⚡` + ledger; habis → seed-mode berlabel. (4) Progressive disclosure: fetch price+volume dulu, expand ke sales/contracts hanya bila intent barang; slug tak ketemu → klarifikasi 0 kredit, tidak menebak. (5) Calib fixture-first: live ≤100kr v5, tulis N/window/negatif + `bukan prediksi` di `CALIB_REPORT.md`.
- **Budget acuan:** rumor ≤4kr, barang ≤6kr, DNA ≤4kr. Bukti: `sectors-deps.txt` (35+ endpoint→fitur) + `eval/` 55 + video key dummy 5dtk.

---

## 6. Kill test, kredit, kejujuran

- **Kill test:** cabut Sectors → harga, broker, ownership IDX+mining, news, filings, suspensi, financials, dividen, kalender, komoditas, kontrak, izin hilang; UI kosong + error `Sectors data unavailable`. Nol fallback Yahoo. MCP pun mati (inputnya pipeline sama). Bukti: `sectors-deps.txt` + segmen video key dummy 5dtk.
- **Kredit 1.000 (hard):** dev+demo <300 · calib v4 ≤100★ · calib barang/DNA ≤100★ · reserve ≥40% shooting. Aturan: `where=`(1kr) > `q=`(3kr); `sections=`/`type=` spesifik (jangan all-8 / all-7 = 7kr); broker ≤14hr, daily/foreign ≤90hr, kalender ≤90hr, komoditas ≤3thn; cache disk (universe 1×/hari, ownership 1×/minggu, commodity-price 1×/minggu, performance/financials 1×/kuartal, contracts/licenses 1×/bulan). Badge `⚡ n kredit` + ledger per sesi.
- **Limitasi di kartu (wajib):** broker = proxy kohort bukan identitas; DNA = pola historis bukan vonis; ownership = laporan terakhir, cluster = `kemungkinan relasi`; komoditas = monthly (coal bi-weekly recent), bukan realtime; EOD; calib = deskriptif historis bukan prediksi; tanpa ticker/slug → tidak menebak.

---

## 7. Evidence packet (repo bicara sendiri)

1. **README:** diagram §5 · tabel 35+ endpoint→fitur · why-multi-agent · link deploy + MCP · limitasi jujur · checklist track · badge eval & calib · sitasi resep GNN + human-agent docs.
2. **`eval/` 55 kasus** → `EVAL_REPORT.md`: 40 v4 + 5 divergence (coal naik/volume turun → campuran; izin habis → flag; sales 1-negara → waspada) + 4 DNA (distribusi repeat → distribusi; conduit asing → foreign_led; tanpa history → data-kurang) + 3 kuasa (insider cluster → flag; ex-congestion → reminder) + 3 GNN sanity (fixture sintetis → skor sesuai rumus).
3. **`calib/CALIB_REPORT.md`:** N, window, hasil termasuk negatif, `bukan prediksi, bukan advice`. Tambahan v5: divergence forward-return + DNA precision.
4. **`mcp/` 8 tools** — 1 command + transcript Inspector. Kill-test documented.
5. Commit linear sejak 17 Sep, PR per fitur. `SEED.md` + fixtures `(SEED)` + `.cache/` bertimestamp.
6. `.env.example` bersih · key 2× · submit pagi 30 Sep → freeze total sampai 9 Okt.

---

## 8. Video (30% — 2 adegan baru, sisanya v4)

**Teaser 60dtk:** GrupGraph menyala → Sankey coal→ADRO→kontraktor menyala → saham +40% `berita X` → zoom-out 6 saham 1 grup → *"Ikan kecil lihat harga. ARUS lihat arus."*

**Judging 3 mnt:**

| Waktu | Adegan |
|---|---|
| 0:00–0:20 | Rizky dapat pompom tambang di WA → chase → merah. "Bukan salah dia. Salah akses." |
| 0:20–1:00 | ★ HP tanpa login, paste `BRMS mau ke 500?` → trace → verdict `tak-didukung 0.86` + Kohort + Bantah |
| 1:00–1:30 | ★ `coal naik kok ADRO turun?` → Sankey barang + Divergence `volume -20%` + `Izin 11bln ⚑` (poster baru) |
| 1:30–1:50 | `broker YP aman?` → radar DNA `spesialis distribusi, 3x repeat` + Share ke grup → OG balik ke WA |
| 1:50–2:15 | `autopsi portofolio saya` → Group Score + graph full inline |
| 2:15–2:35 | `yield 12% aman?` → `indikasi-trap` + `ex-date 3hr + countdown` |
| 2:35–2:50 | Scan Pagi on-demand (10 anomali GNN-lite) + `3 bulan lalu kamu juga begini` + angka mini-beta 15 user |
| 2:50–3:00 | "Ritel tidak butuh sinyal. Ritel butuh mata. Kami tidak memberi rekomendasi — itu disengaja." + disclaimer + URL publik |

Subtitle hard-burn ID. Rekam sebelum freeze.

---

## 9. Timeline 18–30 Sep + acceptance

| Tgl | Milestone |
|---|---|
| 18 | Freeze PRD v5 · `docs/PRD-v5.md` di-commit · kunci slug tambang demo (ADRO/ANTM/BRMS/PTBA/UNTR) + top-20 broker DNA |
| 19–20 | F9 Rantai Barang end-to-end (price→performance→sales→contracts→divergence kartu) + eval +5 |
| 21 | F10 Broker DNA (activity/{code} top-20 + fingerprint + kartu) + eval +4 |
| 22 | F11 Kuasa cluster + GNN-lite on-demand (correlation + confirm broker/asing) + eval +6 |
| 23 | Deploy + share regression (Sankey/peta/radar di `/k/{id}` + OG) · calib barang/DNA fixture-first |
| 24 | **GATE: F9+F10 demoable di HP + autopsi + rumor tidak regresi** · CALIB draft |
| 25 | MCP 8 tools + README · **FREEZE FITUR** |
| 26 | Eval 55 hijau + EVAL/CALIB final + sectors-deps update |
| 27–28 | Mini-beta 15 user (min 5 pertanyaan tambang) + metrik + bugfix |
| 29 | Rekam 2 take (HP+desktop) + teaser + sosmed Canva + checklist H-2 |
| 30 pagi | Verifikasi orang kedua → **SUBMIT** → DIAM sampai 9 Okt |

**AC v5:** 55 eval tanpa exception · 0 angka tak-grounding · ≤6kr/sesi (badge cocok) · HP tanpa login <60s · permalink+OG (Sankey/peta/radar render) · MCP 8 tools di Inspector · CALIB memuat N/window/limitasi + negatif · tanpa GEMINI_KEY deterministik ↩ · tanpa SECTORS_KEY error jujur · guardrail blok 100% `pasti cuan` · calib total ≤200kr.

---

## 10. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Scope 11 fitur > 12 hari | F9 dulu (headline technical); F10 minimal fingerprint 5 broker; F11 minimal insider-count; freeze 25 Sep; potong OG dinamis→statis; jangan tampilkan fitur palsu |
| Slug tambang ≠ symbol IDX | mapping table `slug↔symbol` di `lib/slugs.ts` + fallback `search mining-companies/?q=`; tanpa mapping → klarifikasi, tidak menebak |
| Commodity monthly, broker 14hr → calib tipis | nyatakan eksplisit; fallback price/volume-only + GrupGraph; hasil negatif dipublikasi |
| Deploy publik terkuras | kuota per-IP + budget global + seed-mode berlabel saat menipis |
| Share disalahartikan advice | disclaimer di kartu + OG; verdict = `layak didalami/pantau/lewati`, bukan beli/jual |
| Graph/DNA salah | fuzzy+known-list 30, label `kemungkinan`, precision di kartu; framing statistik |
| Key bocor / lupa freeze | checklist H-2 + verifikator kedua H-1; `.env` tak pernah di-commit |

**Verdict v5:** v4 memaksimalkan bukti; v5 memaksimalkan **inovasi Sectors** — join yang tidak bisa dibuat dari 1 prompt (barang×uang×kuasa), diukur di `CALIB_REPORT`, dipakai ulang via MCP 8 tools, dan ditonton sebagai Sankey + radar DNA (30% video). Semua di atas repo yang hidup sejak 17 Sep.
