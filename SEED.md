# SEED.md — mode fixture

- `SEED=1` → semua fetch Sectors diganti fixture deterministik berlabel `seed: true` (kartu menampilkan SEED),
  tetap lewat CreditSession (badge ⚡ 0 kredit, ledger tetap jalan).
- Cache & memori mengikuti `ARUS_CACHE` (default `.cache/`). Eval memakai `.cache/eval` dan menghapusnya tiap run.
- Tanpa `SEED=1` dan tanpa `SECTORS_API_KEY` → error jujur `Sectors data unavailable`. Tidak ada fallback karangan.
- Mode live: 404 di-cache negatif 1 jam, 401/403/429/5xx memicu circuit breaker — hemat kredit.
- Fixture ada di `lib/seed.ts`; eval/calib memakainya offline (0 kredit).
