// calib/run.ts — uji KONSISTENSI ATURAN pada fixture sintetis (SEED=1). Bukan prediksi, bukan advice.
// Sengaja memuat kontrol negatif supaya laporan tidak bisa "1.00 by construction".
import fs from "node:fs";
import { computeBarang } from "../lib/barang.js";
import { fingerprintBroker } from "../lib/dna.js";

process.env.SEED = "1";

// F9: positif (harga naik volume turun) harus bukan "didukung"; negatif (harga & volume naik) harus "didukung".
let divTP = 0;
const N_DIV_POS = 10;
for (let i = 0; i < N_DIV_POS; i++) {
  const r = computeBarang({ commodityPct12m: 10 + i, volumePct: -12 - i, topCountryShare: 0.5 + (i % 3) * 0.1 });
  if (r.verdict !== "didukung") divTP++;
}
let divTN = 0;
const N_DIV_NEG = 10;
for (let i = 0; i < N_DIV_NEG; i++) {
  const r = computeBarang({ commodityPct12m: 6 + i, volumePct: 5 + i, topCountryShare: 0.2 });
  if (r.verdict === "didukung") divTN++;
}

// F10: distribusi berulang → distribusi; tanpa history → data-kurang; net-buy dominan → akumulasi.
let dnaTP = 0;
const N_DNA_POS = 8;
for (let i = 0; i < N_DNA_POS; i++) {
  const r = fingerprintBroker("YP", [
    { broker: "YP", symbol: "A" + i, netBuy: -5, days: 10 },
    { broker: "YP", symbol: "B" + i, netBuy: -4, days: 20 },
    { broker: "YP", symbol: "C" + i, netBuy: -3, days: 30 },
  ], { historyRepeat: 3 });
  if (r.verdict === "distribusi") dnaTP++;
}
let dnaTN = 0;
const N_DNA_NEG = 6;
for (let i = 0; i < N_DNA_NEG; i++) {
  const r = fingerprintBroker("AK", [
    { broker: "AK", symbol: "D" + i, netBuy: 6, days: 5 },
    { broker: "AK", symbol: "E" + i, netBuy: 4, days: 9 },
  ], { foreignShare: 0.2 });
  if (r.verdict === "akumulasi") dnaTN++;
}
let dnaEmpty = 0;
for (let i = 0; i < 4; i++) if (fingerprintBroker("ZZ", []).verdict === "data-kurang") dnaEmpty++;

const md = `# CALIB_REPORT.md — ARUS v6

## Metodologi
- Fixture sintetis (SEED=1), offline, 0 kredit Sectors.
- Yang diuji: **konsistensi aturan compute**, bukan akurasi prediktif. Tidak ada klaim forward-return.
- Bukan prediksi, bukan advice. Deskriptif.

## F9 Divergence (rantai barang)
- Positif (harga naik + volume turun), N=${N_DIV_POS}: tertangkap ${divTP}/${N_DIV_POS}
- Negatif (harga & volume naik), N=${N_DIV_NEG}: benar "didukung" ${divTN}/${N_DIV_NEG}
- Limitasi: komoditas monthly (coal bi-weekly), EOD, ambang 5%/-10% adalah pilihan aturan, bukan hasil latih.

## F10 DNA broker
- Positif repeat-distribusi, N=${N_DNA_POS}: ${dnaTP}/${N_DNA_POS}
- Negatif net-buy dominan, N=${N_DNA_NEG}: ${dnaTN}/${N_DNA_NEG}
- Tanpa history → data-kurang, N=4: ${dnaEmpty}/4
- Limitasi: broker = proxy kohort (registry), bukan identitas; window 14hr; pola historis bukan vonis.

## Catatan kejujuran
- Live tidak diambil pada run ini karena anggaran kredit; bila diambil, N/window/negatif wajib ditulis ulang di sini.
- Hasil negatif ikut dipublikasi (lihat kontrol negatif di atas).
`;
fs.writeFileSync("calib/CALIB_REPORT.md", md);
console.log(md);