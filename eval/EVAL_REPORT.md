# EVAL_REPORT — ARUS

Tanggal jalan: 2026-09-17T03:16:28.415Z · LLM tidak aktif (case deterministik saja; jalur LLM butuh GEMINI_API_KEY)
**20 PASS / 0 FAIL / 0 SKIP** dari 20 kasus.

Semua assert memakai fixtures **sintetis** (`eval/fixtures/`, skenario demo PRD §8.4) atau properti yang berlaku umum.
Ini anti-"faked for demo": angka di kartu selalu berasal dari JSON tool / kode terhitung, dan gate-nya ikut diuji (V1).

| # | Kasus | Hasil | Detail |
|---|---|---|---|
| P1 | intent kenapa-gerak | ✅ | kenapa-gerak [ANTM] |
| P2 | intent evaluasi-beli | ✅ | evaluasi-beli |
| P3 | intent autopsi (saya BUKAN ticker) | ✅ | autopsi, nol ticker palsu |
| P4 | intent pagi | ✅ | pagi |
| P5 | intent risiko (panic) | ✅ | risiko [BRMS] |
| P6 | chase → evaluasi-beli, ticker kapital | ✅ | evaluasi-beli [NCKL] |
| F1 | join registry × broker-summary: kohort ritel vs institusi | ✅ | ritel +63 M vs uang besar -67.9 M |
| F2 | deteksi distribusi ke ritel | ✅ | harga naik + ritel beli + institusi jual → ⚑ |
| F3 | streak asing dari 90d foreign-flow | ✅ | 9 hari beruntun |
| F4 | top broker terurut + nama dari registry | ✅ | DG Sekuritas Ritel DG 42 M |
| G1 | INDF-ICBP satu cluster (nama pengendali sama, fuzzy) | ✅ | “via indofood sukses makmur” |
| G2 | BUMI-BRMS cluster via label API; BBCA independen | ✅ | BUMI=BRMS ✓, BBCA='' ✓ |
| G3 | group score = % satu pengendali | ✅ | 4 grup → score 70, headline: 70% nilaimu dipegang 2 grup |
| G4 | fuzzy tidak merge nama generik (Public/Masyarakat) | ✅ | ± |
| G5 | knownMembers: Bumi → BUMI+BRMS | ✅ | BUMI,BRMS |
| M1 | sahat seed BRMS dinilai panas | ✅ | score 96 (sangat panas) z-vol 6.2 |
| M2 | data flat → dingin | ✅ | score 0 |
| V1 | angka karangan dibuang, angka tool lolos | ✅ | 2 angka fiktif tertangkap gate |
| O1 | scan anomali menemukan pump tanpa berita | ✅ | 5 anomali: NSTI[kritis] KLCN[kritis] ARUM[kritis] BRMS[waspada] GMRB[waspada] |
| C1 | nada kartu: fakta+pertanyaan, nol imperatif beli/jual/hold | ✅ | 5 pilar · bantah ✓ · pertanyaan ✓ · nol frasa terlarang |

## Limitasi yang diketahui
- Plural kecil ("2 grup", tahun) sengaja BUKAN klaim finansial → tidak di-gate verifier.
- Ambang kendali 20% & streak dari data EOD — konstanta kalibrasi, lihat README §Limitasi.
- Tanpa GEMINI_API_KEY, prose agen = template deterministik dari angka terhitung (bukan karangan).
