# SESSION & MEMORY — riwayat wajib, memori selektif

> Dua scope yang **tidak boleh dicampur**:
> 1. **Satu sesi (thread chat)**: setiap turn — pertanyaan user + output `AnswerDoc` — **WAJIB jadi input semua turn berikutnya di sesi itu.** Tidak ada turn yang hilang.
> 2. **Sesi baru (fresh)**: **HANYA memory** (fakta tervalidasi, tesis, profil, preferensi, kesimpulan sesi, watchlist) — **tanpa transkrip chat lama.**
>
> Prinsip pelaksanaannya: **kompresi boleh, penghilangan tidak.** Teks lengkap selalu tersimpan di store; yang dikirim ke LLM adalah **ledger lengkap** (semua turn, padat) + retrieval saat relevan.

---

## 1. Definisi

| Istilah | Arti |
|---|---|
| **Sesi** | Satu thread chat = satu investigasi (punya id, judul, rollup biaya, level tertinggi) |
| **Turn** | 1 pesan user + 1 jawaban asisten (`AnswerDoc`) |
| **Ledger sesi** | Daftar lengkap semua turn sesi, dalam bentuk padat yang selalu bisa dibaca LLM |
| **Memory** | Distillate lintas sesi: fakta, tesis, profil, preferensi, alert, kesimpulan |

---

## 2. Aturan keras

- **R1 — In-session lengkap**: konteks untuk turn ke-N = system + memory + **ledger seluruh turn 1..N-1** + nilai fakta terbaru + digest ketersediaan cache.
- **R2 — Fresh hanya memory**: sesi baru tidak memuat transkrip sesi lain, walau sesi itu ada. Hanya `memory_items`.
- **R3 — Kompresi bukan penghapusan**: ledger boleh dipadatkan (bertingkat, §4), tetapi setiap turn wajib terwakili minimal oleh baris ledger yang memuat: pertanyaan, level, fakta kunci, kesimpulan/keputusan, koreksi/ketidakpastian.
- **R4 — Teks lengkap selalu ada**: `AnswerDoc` utuh + transkrip disimpan; bisa di-retrieve kapan pun (mis. user bertanya "yang tadi maksudnya apa?").
- **R5 — Angka tidak pernah lewat ledger bebas**: narasi memakai `factId`; konteks LLM memuat referensi, bukan salinan angka liar.
- **R6 — Resume ≠ fresh**: user bisa "lanjutkan investigasi kemarin" (R1 berlaku penuh) atau "investigasi baru" (R2).
- **R7 — Memory wajib provenance**: setiap item memory menyimpan asal (turn/cache_key/sesi) dan divalidasi Jev #12; bisa dilihat & dihapus user.

---

## 3. Skema (tabel tambahan di `data/cache.sqlite` yang sama)

```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT,                -- auto dari Memory Curator / pertanyaan pertama
  created_at    TEXT NOT NULL, updated_at TEXT NOT NULL,
  level_max     INTEGER, credits_used INTEGER DEFAULT 0,
  status        TEXT NOT NULL        -- 'active' | 'archived'
);

CREATE TABLE turns (
  id            INTEGER PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  seq           INTEGER NOT NULL,    -- 1..N urut
  role          TEXT NOT NULL,       -- 'user' | 'assistant'
  text          TEXT,                -- pertanyaan / jawaban ringkas (bukan payload)
  level         INTEGER,
  answedoc_json TEXT,                -- AnswerDoc utuh (untuk resume & replay)
  fact_refs     TEXT,                -- JSON array factId yang dipakai
  cost_credits  INTEGER DEFAULT 0,
  jev_json      TEXT,                -- keputusan Jev pada turn ini (audit)
  created_at    TEXT NOT NULL,
  UNIQUE(session_id, seq)
);

CREATE TABLE memory_items (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL,       -- 'fact' | 'thesis' | 'profile' | 'preference' | 'alert' | 'conclusion'
  entity        TEXT, key TEXT,
  value_json    TEXT NOT NULL,
  provenance    TEXT NOT NULL,       -- 'turn:12' | 'cache:<key>' | 'session:abc'
  confidence    REAL, expires_at TEXT,
  created_at    TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_turns_ses ON turns(session_id, seq);
CREATE INDEX idx_mem_kind ON memory_items(kind, entity);
```

`fact_memory` (angka) tetap terpisah; `memory_items` untuk yang naratif/kontekstual. Ledger kredit tetap `api_hits` — sesi hanya merollup.

---

## 4. Perakitan konteks (`buildContext`)

```
buildContext(sessionId | fresh, pertanyaan):
  base       = system prompt (peran LLM, aturan output, mode bahasa)
  memory     = digest(memory_items)                    # SELALU, termasuk fresh
  jika sesi lama:
     ledger  = ringkas semua turn 1..N-1 (§ tingkatan di bawah)   # WAJIB lengkap
     retrieval = potongan AnswerDoc relevan + nilai fakta terbaru (fact_memory/cache)
  digestStore = TERSEDIA / KOSONG per emiten (0 kr)
  budget    = target ≤ ~40k token ledger; jika lewat → naikkan kompresi, BUKAN buang
```

Kompresi bertingkat:

| Tingkat | Isi | Kapan |
|---|---|---|
| T1 utuh | `text` + ringkasan AnswerDoc turn terbaru | 3–5 turn terakhir |
| T2 baris ledger | 1 baris/turn: "L7 · GOTO rumor terbang · verdict: lemah · fakta: net sell 5h · biaya 14 kr" | semua turn lain |
| T3 retrieval | potongan `AnswerDoc`/fakta lengkap | saat pertanyaan baru menyentuh topik turn lama |

Yang **tidak pernah** dikirim ke LLM: payload mentah API, isi `blobs/`, angka tanpa `factId`.

---

## 5. Apa yang masuk memory (dan yang tidak)

| Masuk | Tidak masuk |
|---|---|
| Fakta tervalidasi (via `fact_memory`) | Transkrip mentah |
| Tesis & alasan (T12 Jev) | Payload API |
| Profil: horizon, toleransi risiko, tujuan | Data pribadi sensitif (NIK, rekening, dll.) |
| Preferensi: mode bahasa, tampilan | Candaan/off-topic |
| Kesimpulan sesi + tingkat keyakinan | Angka tanpa provenance |
| Watchlist & alert | — |

TTL: fakta mengikuti TTL-nya · tesis/kesimpulan disimpan sampai dikoreksi user · profil/preferensi tanpa kedaluwarsa (dihapus manual).

---

## 6. Perilaku UI (chat)

- **Sidebar**: daftar investigasi (sesi) + tombol **"Investigasi baru"** (fresh = memory only) dan **"Lanjutkan"** (ledger penuh).
- **Banner memory** saat sesi baru dimuat: "Memory dimuat: 12 fakta BBCA · 3 tesis · profil: konservatif, 2 tahun · watchlist: 4 emiten ▸" (bisa dibuka/dihapus).
- Badge **"0 kr — dari memory"** pada jawaban yang murni mengandalkan memory.
- Tiap pesan asisten menampilkan badge sesi: `turn 7/10 · kredit sesi 38 kr` supaya riwayat & biaya terasa nyata di video.

---

## 7. Guardrail

1. Tulis memory hanya lewat Memory Curator + validasi Jev #12 (provenance wajib).
2. Konflik memory baru vs lama → simpan keduanya + tandai revisi (jangan hapus diam-diam).
3. User bisa lihat/edit/hapus memory kapan pun (kontrol data).
4. Endpoint Jev gagal → sesi tetap jalan (fallback LLM ber-rubrik), tulis memory ditunda, ditandai "pending".
5. Biaya sesi dihitung dari `api_hits` (satu-satunya ledger), bukan estimasi.