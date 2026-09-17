# SEED.md — reproducible demo cases (PRD §8.4)

**Semua fixture adalah data SYNTHETIS** (skenario PRD, bukan data pasar nyata) — nama file mengandung
`(SEED)`/`mock`. Fungsinya: demo & eval tetap berjalan offline saat credit habis / API mati, dan
video bisa dinyatakn jujur: "seed cache hanya fallback".

## Regenerasi
```bash
node --experimental-strip-types scripts/make-fixtures.ts   # tulis ulang eval/fixtures/*.json
```
Nama file = kunci cache (`tool__param…json`) — manusia-baca, jadi juri bisa meng-audit
parameter mana yang menghasilkan body di bawah. `at` di tiap file = timestamp (ms epoch) respons dibuat.

## Kasus seed demo
| Kasus (PRD §8.4) | Fixture kunci | Yang dibuktikan |
|---|---|---|
| Gorengan grup kompak naik | `daily__*_symbol-BRMS`, `broker_summary__*symbol-BRMS`, `company_report__sections-ownership_symbol-{BRMS,BUMI}` | +21%/7d, ritel +63 M vs institusi −67,9 M, cluster Bumi |
| Distribusi asing → ritel | `foreign_flow__*symbol-BRMS` (−9 M × 9 hari beruntun) | flag `distribusi_ritel` + streak |
| Berita viral tanpa filing | `news__*_symbols-BRMS` (2 artikel "blok nikel") vs `filings__*symbol-BRMS` (kosong) | ⚑ "berita ∉ filing" → FOMO +20 poin |
| Ilusi diversifikasi | `company_report__sections-ownership_symbol-{INDF,ICBP,BBCA,TLKM,SMGR,BUMI}` | "INDF+ICBP satu pengendali via nama"; Group Score = % satu grup |
| Riwayat suspend | `suspensions__symbol-BRMS` (2×) | ⚑ "bisa disetop kapan pun" |
| Morning Arus | `top_changes__*`, `most_traded__*`, `daily__*_{NSTI,ARUM,KLCN,GMRB}` | scan z-score → 5 anomali, entry kritis vs waspada |

## Menjalankan dengan seed (mode video fallback)
```bash
SECTORS_API_KEY= ARUS_SEED=1 npm run build && ARUS_SEED=1 npm start
```
Trace UI menampilkan penanda ↩ saat agen jatuh ke deterministik-fallback — tidak ada angka yang
datanya tidak ada. (NFR §7.3: limitasi ditulis di kartu.)

## Snapshot data mentah
Kunci cache live (`SECTORS_API_KEY=…`) tertulis ke `.cache/sectors/` dengan format
`{at, ttl, tool, params, body}` → timestamp respons API tersimpan untuk audit §8.4.
`.cache/` di-gitignore; lampirkan `tar` snapshot bila juri minta bukti mentah.
