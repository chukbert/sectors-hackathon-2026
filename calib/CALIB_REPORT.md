# CALIB_REPORT.md — ARUS v6

## Metodologi
- Fixture sintetis (SEED=1), offline, 0 kredit Sectors.
- Yang diuji: **konsistensi aturan compute**, bukan akurasi prediktif. Tidak ada klaim forward-return.
- Bukan prediksi, bukan advice. Deskriptif.

## F9 Divergence (rantai barang)
- Positif (harga naik + volume turun), N=10: tertangkap 10/10
- Negatif (harga & volume naik), N=10: benar "didukung" 10/10
- Limitasi: komoditas monthly (coal bi-weekly), EOD, ambang 5%/-10% adalah pilihan aturan, bukan hasil latih.

## F10 DNA broker
- Positif repeat-distribusi, N=8: 8/8
- Negatif net-buy dominan, N=6: 6/6
- Tanpa history → data-kurang, N=4: 4/4
- Limitasi: broker = proxy kohort (registry), bukan identitas; window 14hr; pola historis bukan vonis.

## Catatan kejujuran
- Live tidak diambil pada run ini karena anggaran kredit; bila diambil, N/window/negatif wajib ditulis ulang di sini.
- Hasil negatif ikut dipublikasi (lihat kontrol negatif di atas).
