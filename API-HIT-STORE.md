# API HIT STORE — Cache + Ledger + Audit dalam satu tempat

> Setiap kali INVESTIGRAPH menembak Sectors API, **semuanya tercatat**: apa yang ditembak, hasilnya apa, berapa kredit, dan itu jadi cache untuk tembakan berikutnya.
> Satu store, tiga peran: **cache** (hemat kredit) · **ledger** (transparansi) · **jejak audit** (juri bisa telusuri tiap angka sampai respons API aslinya).
>
> **Tujuan utamanya penghematan:** kalau endpoint + parameter itu **pernah** ditembak, LLM **tidak menembak ulang** — nilainya langsung dikembalikan dari cache/memory (0 kr) dengan label kesegaran. HTTP hanya terjadi saat benar-benar belum ada.

---

## 1. Rekomendasi teknologi (paling efektif untuk hackathon ini)

**SQLite (`better-sqlite3`) untuk index + ledger, payload JSON digzip di disk (content-addressed), hybrid.**

| Opsi | Kelebihan | Kenapa kalah/menang |
|---|---|---|
| File JSON per hit (cara `riset/raw-api-cache`) | Simpel, mudah dilihat | Tidak bisa query ledger/TTL/dedup cepat; ribuan file; nama file bentrok/dup; tidak transaksional |
| JSONL append-only | Bagus untuk log | Cache lookup = scan O(n); tidak ada index; tidak ada state expiry |
| **SQLite + blob gz** ✅ | Transaksional, index O(log n), SQL untuk ledger/statistik, 1 file gampang di-copy, native Node (sync, cepat) | Perlu 1 dependency; payload besar sebaiknya tidak di baris DB |
| Postgres/Redis | Kuat untuk production | Overkill: butuh server/service; ribet di demo & repo publik |
| localStorage browser | — | Salah tempat: API key & logika agent harus server-only |

**Bentuk final:** `data/cache.sqlite` (metadata, TTL, ledger, payload kecil inline ≤32 KB) + `data/blobs/xx/<sha256>.json.gz` (payload >32 KB, gzip ~8–10×). Satu write path, satu sumber kebenaran. Ukuran setelah seluruh program uji diperkirakan **≤ 50 MB** (sebagian besar gzip).

Alasan pemisahan payload besar: SQLite tetap ringan/cepat di-query (ledger untuk UI), file blob bisa di-hardlink/dibaca langsung saat inspeksi manual.

---

## 2. Layout folder

```
data/                          # gitignored (kecuali evidence hasil ekspor)
  cache.sqlite                 # index + ledger + payload kecil (WAL mode)
  blobs/ab/abcd…ef.json.gz      # payload >32 KB, nama = sha256 isi (dedup alami)
  exports/                     # hasil kurasi untuk MASTERY.md / video (kecil, boleh di-commit)
```

Aturan: `data/` **tidak masuk repo** (payload bisa besar & berisi data pasar; repo bersih dari kunci API — kepatuhan aturan hackathon). Yang di-commit hanya `exports/` pilihan + `MASTERY.md`.

---

## 3. Skema

Dua tabel: **`api_hits`** = peristiwa (append-only, audit + biaya) · **`cache_entries`** = state (satu baris per kunci, isi cache).

```sql
CREATE TABLE api_hits (              -- append-only: setiap percobaan HTTP
  id            INTEGER PRIMARY KEY,
  ts            TEXT NOT NULL,        -- ISO8601 WIB
  session_id    TEXT,                 -- sesi query user mana
  level         INTEGER,              -- L1–L10 (konteks audit)
  purpose       TEXT,                 -- 'answer','verify','preflight','sweep','test'
  method        TEXT NOT NULL,
  endpoint      TEXT NOT NULL,        -- '/v2/broker-summary/{symbol}/'
  url           TEXT NOT NULL,        -- URL asli TANPA header/API key
  params_json   TEXT NOT NULL,        -- params ternormalisasi (canonical)
  cache_key     TEXT NOT NULL,        -- sha256(endpoint + canonical params)
  status        INTEGER NOT NULL,     -- HTTP status
  cost_credits  INTEGER NOT NULL,     -- 1/2/3/8… ; 0 kalau gratis (400/429/5xx)
  cache_status  TEXT NOT NULL,        -- miss | hit | stale | replay | negative-hit | forced-live
  duration_ms   INTEGER,
  error_code    TEXT,
  notes         TEXT,
  UNIQUE(id)
);
CREATE INDEX idx_hits_key ON api_hits(cache_key);
CREATE INDEX idx_hits_ts  ON api_hits(ts);
CREATE INDEX idx_hits_ses ON api_hits(session_id);

CREATE TABLE cache_entries (         -- state cache: 1 baris per cache_key
  cache_key     TEXT PRIMARY KEY,
  endpoint      TEXT NOT NULL,
  params_json   TEXT NOT NULL,
  covers_from   TEXT,                -- awal data yang terkandung (time-series)
  covers_to     TEXT,                -- akhir data yang terkandung → memungkinkan "slice dari superset"
  status        INTEGER NOT NULL,    -- 200 normal; 404 = negative cache
  fetched_at    TEXT NOT NULL,
  expires_at    TEXT,                -- NULL = immutable (historical window)
  immutable     INTEGER NOT NULL,    -- 1 = jangan pernah refetch
  payload_sha   TEXT NOT NULL,
  payload_inline BLOB,               -- gzip payload ≤32 KB (atau NULL)
  blob_path     TEXT,                -- path bila >32 KB
  bytes_raw     INTEGER, bytes_stored INTEGER,
  hit_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TEXT
);

CREATE TABLE fact_memory (           -- fakta siap-pakai hasil ekstraksi (bukan payload mentah)
  id            INTEGER PRIMARY KEY,
  entity        TEXT NOT NULL,       -- 'BBCA', 'IHSG', 'coal', 'bank'
  metric        TEXT NOT NULL,       -- 'eps_q', 'pe_ttm', 'dividend_yield', 'net_foreign'
  as_of         TEXT NOT NULL,       -- tanggal data, bukan tanggal tarik
  value_num     REAL, value_text TEXT, unit TEXT,
  source_key    TEXT NOT NULL,       -- cache_key asal (provenance — wajib)
  confidence    REAL,                -- 0–1 (kalibrasi jujur)
  method        TEXT,                -- 'extracted' | 'derived:ratio' | 'derived:cagr'
  expires_at    TEXT,
  UNIQUE(entity, metric, as_of)
);

-- Tabel riwayat & memory ada di file SQLite yang sama:
--   sessions · turns · memory_items  → lihat SESSION-MEMORY.md (§3)
-- Aturan: ledger kredit tetap hanya api_hits; sesi hanya merollup biaya dari sini.

CREATE VIEW credit_ledger AS         -- untuk UI & laporan
  SELECT ts, session_id, level, endpoint, status, cost_credits, cache_status
  FROM api_hits ORDER BY id;
```

Ledger kredit = `SUM(cost_credits)` dari view ini. Tidak ada tabel terpisah — satu write path.

---

## 4. Cache key & kanonikalisasi

`cache_key = sha256( endpoint + "|" + JSON(params canonical) )`

Aturan kanonik:
- **Simbol**: uppercase, buang `.jk`/`.JK` → `bbca` ≡ `BBCA` ≡ `BBCA.JK` (docs menyatakannya case-insensitive).
- **Query params**: urut alfabetis, nilai di-trim; tanggal `YYYY-MM-DD`; default implisit **tidak** ditulis (mis. tanpa `start/end` = default endpoint).
- **Jangan** pakai URL mentah sebagai kunci (urutan param bisa beda → cache miss palsu).
- `payload_sha = sha256(bodys bytes)` → deteksi payload berubah walau key sama (mis. window "sampai hari ini" berubah isi).

Contoh: `GET /v2/broker-summary/BBCA.JK/?start=2026-09-08&end=2026-09-19` → key dari `endpoint + {"symbol":"BBCA","start":"2026-09-08","end":"2026-09-19"}`.

---

## 5. TTL & immutability (inti penghematan)

**Prinsip besar: window yang sudah lewat = immutable → cache selamanya; hanya yang "terbuka" butuh TTL.**

| Keluarga | Aturan | TTL |
|---|---|---|
| Window historis (end < hari bursa terakhir) | data sudah final | **immutable** (∞) |
| Window menyentuh hari ini | bisa berubah intraday | sampai tutup bursa berikutnya (08:45 WIB) |
| Harga/daily/quote | berubah per hari | reset harian |
| Fundamental | berubah saat rilis | per kuartal (dari `latest-quarterly-dates`) |
| Broker/foreign flow per tanggal | final setelah bursa tutup | per hari |
| Kalender event (`corporate-actions`) | jadwal bisa direvisi | 24 jam |
| Screener/ranking | bergantung pasar | 24 jam |
| Helper statis (subsectors, industries, tags, broker-registry) | stabil | 30 hari |
| **404 (negative cache)** | simbol/slug tidak ada | 7 hari — **wajib**, karena 404 ditagih 1 kr! |
| 400 | gratis, tidak perlu di-cache | simpan log saja |
| 429/5xx | gratis, tapi jangan cache sukses palsu | retry backoff, catat, tidak masuk cache |

Efeknya: suite uji & turunan pertanyaan berikutnya hampir seluruhnya **cache hit = 0 kr**. Cache hit juga dicatat sebagai `api_hits` (dengan `cost_credits=0`, `cache_status='hit'`) supaya audit tetap utuh.

---

## 6. Bagaimana LLM dilayani — inti penghematan

### 6.1 Tangga layanan: memory → cache → turunan → live

LLM mengusulkan panggilan (mis. `GET /v2/broker-summary BBCA 2026-09-08..2026-09-19`). **Resolver yang memutuskan** perlu HTTP atau tidak:

| Tingkat | Cek | Hasil | Biaya |
|---|---|---|---|
| 1. Fact memory | fakta sudah diekstrak & disimpan (entity+metric+as_of) | nilai + provenance | **0 kr** |
| 2. Exact cache | `cache_key` sama, fresh/immutable | payload identik | **0 kr** |
| 3. Turunan/slice | key persis tak ada, tapi bisa dihitung dari cache: sub-rentang dari superset (`covers_from/to`), rasio 2 fakta, CAGR dari seri | dihitung **kode** (bukan aritmetika LLM) | **0 kr** |
| 4. Near-miss | window terbuka hanya kurang "hari ini" | jawab dari cache + label "per <tanggal>", tawarkan refresh | 0 kr, refresh = n kr |
| 5. Miss | benar-benar belum ada | live + cost gate (>6 kr butuh konfirmasi) | n kr |

Catatan implementasi (21 Sep 2026): untuk endpoint **seri** (daily, foreign-flow, index-daily, idx-total, broker-summary/activity, most-traded) payload cache dicek lebih dulu supaya grafik tetap bisa dirender; fact memory dipakai sebagai tingkat 1 untuk endpoint non-seri dan sebagai jaring terakhir sebelum live. Keduanya **0 kr** dan tetap tercatat di `api_hits`.

Contoh nyata:
- "BBCA berapa?" → memory/cache → **0 kr** (bukan 1 kr).
- "Laba BBRI 4 tahun" lalu "rata-rata 3 tahun terakhir?" → seri 8 kuartal sudah tersimpan → kode menghitung → **0 kr**.
- Minta broker summary 12–19 Sep padahal cache berisi 8–19 Sep → **slice dari superset → 0 kr**. Minta 10–19 Sep → kurang 10–11 → near-miss → tawarkan 1 kr.

Setiap jawaban selalu membawa label: **sumber (memory/cache/live) · as_of · cache_key · biaya (0/n kr)** — LLM tidak pernah mengarang kesegaran, ledger tetap jujur, dan cache hit tetap tercatat di `api_hits` (`cache_status='hit'`, `cost_credits=0`) supaya audit utuh.

### 6.2 Digest ketersediaan — hemat di level perencanaan

Sebelum LLM menyusun langkah, sistem menyuntik **digest kecil** dari store (bukan payload penuh):

```
TERSEDIA (0 kr): BBRI — quarterly 2019Q1–2026Q2 · broker-summary 1–19 Sep · dividend 2021–2026 · foreign-flow IHSG s.d. 19 Sep
KOSONG: BBRI — report/securities · ITMG — mining/*
```

Efek: bukan cuma HTTP yang dihemat, **perencanaannya juga** — LLM tahu apa yang bisa dipakai ulang sebelum mengusulkan tembakan. Ini pembeda dari cache pasif yang cuma duduk di belakang HTTP client.

### 6.3 Alur satu request

```
LLM usul panggilan (endpoint, params)
   → RESOLVER: canonical key
       ├─ fact memory fresh                → jawab dari memory     (0 kr, 'memory')
       ├─ cache exact (immutable/fresh)    → replay payload        (0 kr, 'hit')
       ├─ bisa diturunkan/di-slice         → hitung di kode        (0 kr, 'derived')
       ├─ near-miss                        → cache + label, tawarkan refresh
       ├─ 404 negative cache < 7 hari      → pakai negatif         (0 kr, 'negative-hit')
       └─ miss                             → GOVERNOR: estimasi → live ('miss')
   → tulis cache_entries + fact_memory (hasil ekstraksi) + api_hits (status, biaya, durasi)
   → GOVERNOR: catat konsumsi; kredit menipis → cache-only + label tanggal
```

Mode: `REPLAY=1` (uji/demo: hanya cache, tolak tembakan baru) · `LIVE=1` (paksa live untuk bukti/rekaman) · `HYBRID` (default produk: cache-first, live kalau perlu).

---

## 7. Yang TIDAK pernah disimpan

- API key / header `Authorization` (URL pun disimpan tanpa kredensial — patuh aturan repo).
- Data pribadi user (profil 50jt/horizon adalah parameter sesi, bukan identitas; tidak ditulis ke store).
- Body request yang tidak relevan.

---

## 8. Kenapa ini "paling efektif" untuk kita

1. **Satu store = cache + ledger + audit** → tak ada sinkronisasi dua sistem; juri melihat jejak yang sama dengan yang dipakai agen.
2. **Content-addressed + kanonik** → dedup alami; satu `sha256` mewakili satu respons; hitungan kredit tak bisa "kembar".
3. **Immutability window historis** → mayoritas panggilan uji jadi permanen gratis; hanya window terbuka yang ditembak ulang.
4. **SQLite** → query statistik untuk video (kredit per sesi, cache hit rate, biaya per level) tanpa ETL; WAL mode aman untuk server Next.js lokal.
5. **Gzip + blob** → payload report/quarterly yang besar tidak membengkakkan DB; ≤50 MB untuk seluruh program uji.
6. **Negative cache 404** → menghentikan kebocoran 1 kr per 404 berulang (aturan billing resmi), hal yang tidak dilakukan kalau cache cuma "simpan 200".
7. **Portabel** → backup/demo = copy 1 file + 1 folder; tidak butuh service eksternal saat presentasi.
8. **Hemat di level perencanaan LLM** (digest ketersediaan + resolver), bukan cuma di level HTTP — inilah bedanya dengan cache pasif. Ditambah `fact_memory`, pertanyaan lanjutan yang sama/serupa = 0 kr berkali-kali.

---

## 9. Keputusan final (dikunci 21 Sep 2026)

1. ✅ **SQLite (`better-sqlite3`) + payload gzip content-addressed** (blob >32 KB di `data/blobs/`).
2. ✅ **`data/` gitignored**; hanya `exports/` kurasi yang di-commit (repo bersih dari kunci API & payload besar).
3. ✅ **`api_hits` = satu-satunya pencatat biaya kredit** — tidak ada ledger paralel manual.
4. ✅ **LLM hanya memanggil capability/tool berdata** (resolver cache-first di dalamnya: memory → cache → turunan → live); endpoint mentah hanya internal.