# ARUS

> *Ikan kecil lihat harga. ARUS lihat arus.*

Asisten **multi-agent** untuk investor ritel IDX: menjawab "kenapa saham ini naik, boleh ikut?"
dengan **arus informasi** (berita vs filing), **arus uang** (broker per-kohort & asing), dan
**arus kepemilikan** (grup konglomerasi) — semuanya dari [Sectors Financial API](https://sectors.app),
plus **counter-argument wajib** dan **memori perilaku** si pengguna.

Sectors Hackathon 2026 · Track 01: AI Agents & Assistants.
**Bukan nasihat keuangan, tidak bisa dan tidak akan mengeksekusi order.** Output: fakta, skor, pertanyaan, bantahan.

---

## 1. Arsitektur

```
User / Scheduler (cron 08:30 WIB)
   ▼
[1 PLANNER/ROUTER]   intent: kenapa-gerak · evaluasi-beli · autopsi-portofolio · pagi · risiko · obrolan
                    → subset pilar (lib/agents.ts)
   ▼
[5 SPESIALIS — paralel, tool-loop sendiri, cache-first]
 Mover        : close, daily, top-changes, most-traded, index-daily, idx-total
 Flow         : broker-summary × broker-registry → KOHORT FLOW INDEX · foreign-flow · filings(insider)
 News         : news × filings × corporate-actions × suspensions → KATALIS METER
 Fundamentals : company-report §valuation · quarterly-financials · subsector-report · segments
 Graph        : company-report §ownership (batch) → union-find → GRUPGRAPH
   ▼
[2 VERIFIER]         grounding check di KODE (lib/ground.ts): angka dalam prosa wajib hadir
                     di JSON tool output (±0.6%) — kalau tidak: dibuang, tercatat di trace.
   ▼
[3 BANTAH-AGENT]     adversarial: menyusun kasus terkuat sisi lawan, lalu mematahkannya dengan data
   ▼
[4 SYNTHESIS]        Kartu Arus: FOMO Meter + pilar + ⚑ + bantahan + pertanyaan + disclaimer
                     + payload graph{nodes,edges} → dirender force-graph INLINE di chat
   ▼
[5 MEMORY]           node:sqlite per user: keputusan + portofolio → Cermin Perilaku ("pola lama kamu…")
```

Stack sengaja membosankan: **Next.js 15 · TypeScript · @google/genai (`gemini-3.8-flash`, effort medium) ·
node:sqlite · force-graph canvas tulisan sendiri.** Nol framework agent — orkestrasinya kodenya.
Pola mengikuti resep resmi docs Sectors (Tool Use, Multi-Agent Workflows, Structured Output, MCP).

## 2. Kenapa ini "multi-agent", bukan prompt di client LLM

Cabut prompt-nya → yang tersisa tetap bekerja: **Kohort Flow Index** (join broker-summary × registry),
**GrupGraph** (union-find nama pengendali ter-normalisasi+fuzzy × known-list 30 grup),
**FOMO Meter** (z-score volume, deviasi SMA, streak asing, divergence berita-vs-filing),
**deteksi distribusi ke ritel**, **verifier grounding numerik**, **scheduler anomali full-universe**,
dan **memori perilaku** — semuanya kode deterministik dengan tes (`npm test`, `npm run eval`).
LLM hanya menyusun PROSA di atas angka yang dihitung kode; angka kartu **tidak pernah** lahir dari model.
Peta endpoint → fitur: [`sectors-deps.txt`](./sectors-deps.txt) (kill test §6 PRD: cabut Sectors = UI mati).

## 3. Track requirement checklist

| Requirement | Bukti di repo |
|---|---|
| Multi-step reasoning | planner → 5 pilar paralel → verifier → bantah → synthesis (`lib/agents.ts`) |
| Custom tool-use pipeline | 25 endpoint dibungkus dengan schema+validator+cache-class sendiri (`lib/tools.ts`, `lib/sectors.ts`) |
| Routing antar sumber | `pillars` per-tool + intent planner; valuasi tidak memanggil endpoint broker |
| Memory / state | `lib/memory.ts` (SQLite) — keputusan, portofolio, pola chase; graph percakapan bertahan antar-follow-up |
| Autonomous execution | `npm run morning` (cron 08:30) — full-universe scan → brief 10 anomali tanpa user action |
| Purpose-built interface | Kartu Arus + flow bars + **GrupGraph inline** di stream chat (`app/page.tsx`) |
| Innovative use of Sectors | derived assets (tidak ada endpoint tunggal-nya) — lihat §2 |

## 4. Menjalankan

```bash
npm install
cp .env.example .env       # SECTORS_API_KEY dari portal Sectors (Insider plan); GEMINI_API_KEY opsional
npm run dev                # http://localhost:3000
npm test                   # unit deterministik (node --test)
npm run eval               # 20 kasus → eval/EVAL_REPORT.md
npm run morning            # scan anomali sekali (cron: 30 8 * * 1-5 WIB)
```

Tanpa `GEMINI_API_KEY` produk tetap jalan penuh — prose agen memakai template deterministik dari angka
terhitung (dinyatakan jujur di trace). Tanpa `SECTORS_API_KEY`: error state "Sectors data unavailable"
(sengaja — tidak ada fallback sumber lain); mode demo offline: `ARUS_SEED=1` baca `eval/fixtures/`
(lihat [`SEED.md`](./SEED.md)).

## 5. Fitur

- **F1 Kartu Arus** — trace orkestrasi live + 5 pilar + FOMO 0–100 dengan komponen + bantahan + pertanyaan yang dikembalikan.
- **F2 Kohort Flow Index** — "broker kohort ritel net-buy Rp X M vs asing+institusional net-sell Rp Y M / 7 hari", streak asing, ⚑ insider-sell, **deteksi distribusi → exit liquidity**.
- **F3 GrupGraph + Autopsi Portofolio = intent chat** — "autopsi portofolio saya BBCA INDF ICBP…" → Group Score + graph penuh inline; follow-up ("kok bisa INDF sama ICBP?") dijawab dari graph yang sama.
- **F4 Katalis Meter** — substantif vs viral: `berita > 0 tapi filing = 0` → ⚑; suspend history + free float kecil.
- **F5 Morning Arus** — cron; z-score volume & lompatan harga dari full-universe; tiap entri dengan counter-argument.
- **F6 Cermin Perilaku** — "3 bulan lalu kamu juga begini" + Panic Decoder (intent risiko: kartu yang sama, framing menenangkan-berbasis-bukti).

## 6. Limitasi (diakui — juga tertulis di kartu)

- **Nama broker ≠ identitas pemilik akun.** "Kohort ritel" = proxy statistik broker yang dipakai ritel; output adalah indikator, bukan tuduhan.
- **Kepemilikan per laporan terakhir**; cluster = *kemungkinan relasi* (normalisasi+fuzzy+known-list; ambang kendali 20%).
- Data Sectors adalah **EOD** (bukan realtime); tanggal libur bisa mundur 1 hari dari estimasi.
- Verifier meng-gate angka **finansial** (bersatuan/desimal/≥100); plural kecil ("2 grup") dan tahun sengaja di luar gate.
- Free-float/segments bergantung cakupan pelaporan emiten; pilar fundamental bisa kembali ke valuasi dasar.
- **Tidak ada** tombol beli/jual, integrasi sekuritas, atau klaim akurasi 99% —by design.

## 7. Struktur repo

```
app/            page.tsx (chat UI, satu permukaan) · api/chat (stream NDJSON) · api/decision
lib/            sectors.ts (client+cache+breaker) · tools.ts (25 wrapper) · flow · graph · fomo ·
                ground (verifier) · llm (GenAI) · agents (planner→…→synthesis) · memory · morning
components/     grafik.tsx (force-directed canvas, nol dependency)
scripts/        morning-arus.ts (cron) · make-fixtures.ts (generator SEED)
eval/           run.ts (20 kasus) · fixtures/ (SNAPSHOT sintetis) · EVAL_REPORT.md
SEED.md · sectors-deps.txt
```

Data & layanan: [Sectors Financial API v2](https://docs.sectors.app) — satu-satunya sumber data produk ini.
