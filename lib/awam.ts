// lib/awam.ts — Bagian 2 kartu: "pelan-pelan untuk awam" gaya tutor.
// Deterministik (bukan LLM): tidak ada angka baru, tidak ada nasihat beli/jual, tetap jalan offline di eval.
// Tiap bagian: istilah → arti → analogi sehari-hari → apa yang terbaca di kartu ini, dengan nada baik/hati/netral.
import type { DividendInfo, FlowIndex, Fomo, Liquidity, Returns } from "./metrics.js";
import { fmtRp } from "./fundamental.js";

export type Nada = "baik" | "hati" | "netral";
export interface AwamBagian { istilah: string; arti: string; analogi: string; kondisi: string; nada: Nada }
export interface Awam { pembuka: string; bagian: AwamBagian[]; intisari: string; penutup: string }

export const p = (istilah: string, arti: string, analogi: string, kondisi: string, nada: Nada = "netral"): AwamBagian =>
  ({ istilah, arti, analogi, kondisi, nada });

const sign = (x: number) => `${x >= 0 ? "+" : ""}${x}`;
const pct = (x: number) => `${sign(x)}%`;
const rp = (x: number) => `Rp ${Math.abs(x)} M`;

const VERDICT_AWAM: Record<string, string> = {
  akumulasi: "ada pola uang besar yang cenderung masuk ke saham ini",
  distribusi: "ada pola uang besar yang cenderung keluar, sering berpindah ke ritel",
  didukung: "data relatif mendukung gerak yang sedang terjadi",
  "tak-didukung": "data justru tidak mendukung cerita atau euforia yang beredar",
  "layak-didalami": "ada sinyal menarik, tapi belum cukup kuat untuk jadi kesimpulan tegas",
  waspada: "ada tanda risiko yang perlu diperhatikan di data",
  sehat: "tidak terlihat tanda bahaya utama di data yang dicek",
  "indikasi-trap": "ada ciri jebakan, misalnya imbal hasil terlihat tinggi tanpa dukungan data lain",
  campuran: "sinyalnya bercampur, belum ada arah yang dominan",
  pantau: "belum ada sinyal kuat; kondisi ini layak diamati dulu",
  info: "ini informasi angka, bukan penilaian arah harga",
  "data-kurang": "datanya belum cukup untuk menyimpulkan apa pun tanpa menebak",
};

export function verdictPart(verdict: string, probability: number, conf: number): AwamBagian {
  return p(
    "Verdict & angka keyakinan",
    "Verdict = label kondisi hasil olahan data (bukan ramalan harga). Angka 0–1 di sebelahnya = seberapa kuat bukti mendukung label itu, bukan peluang naik atau turun.",
    "Ibarat rapor: satu nilai kesimpulan dari beberapa catatan. Nilai keyakinan = seberapa yakin mesin pada bukti yang ada, bukan jaminan hasil.",
    `Kartu ini berlabel "${verdict}" dengan nilai ${probability} dan confidence ${conf}. Bahasa sehari-harinya: ${VERDICT_AWAM[verdict] ?? "kondisinya belum bisa disimpulkan tegas"}.`,
  );
}

export function buildAwam(verdict: string, probability: number, conf: number, parts: AwamBagian[]): Awam {
  const bagian: AwamBagian[] = [];
  const seen = new Set<string>();
  for (const x of [verdictPart(verdict, probability, conf), ...parts]) {
    if (seen.has(x.istilah)) continue;
    seen.add(x.istilah);
    bagian.push(x);
  }
  const plus = bagian.filter((x) => x.nada === "baik").slice(0, 2).map((x) => x.istilah);
  const minus = bagian.filter((x) => x.nada === "hati").slice(0, 2).map((x) => x.istilah);
  const intisari =
    plus.length && minus.length
      ? `Sisi yang mendukung: ${plus.join(" + ")}. Sisi yang perlu diperhatikan: ${minus.join(" + ")}. Ini gambaran kondisi dari data, bukan prediksi harga.`
      : plus.length
        ? `Sisi yang tercatat mendukung: ${plus.join(" + ")}. Tetap baca bagian "perlu diperhatikan" untuk sisi sebaliknya — ini gambaran kondisi, bukan jaminan hasil.`
        : minus.length
          ? `Yang perlu diperhatikan: ${minus.join(" + ")}. Sisanya belum memberi sinyal kuat ke satu arah.`
          : `Belum ada sisi yang menonjol di data ini — kondisinya netral atau baru sebatas informasi.`;
  return {
    pembuka:
      "Anggap kartu ini laporan dari mesin. Bagian 1 di atas masih penuh istilah pasar; bagian ini menerjemahkannya pelan-pelan dengan analogi sehari-hari, lalu menjelaskan apa yang terbaca dari kondisi yang kamu tanyakan.",
    bagian,
    intisari,
    penutup:
      "Semua ini pembacaan kondisi dari data yang tersedia (EOD, bukan realtime) — bukan rekomendasi, bukan ajakan membeli atau menjual. Keputusan tetap di tanganmu. Kalau ada istilah yang masih terasa asing, tanya saja bagian itu langsung.",
  };
}

export function hargaVolumePart(sym: string, r: Returns): AwamBagian {
  const ramai = r.volMult >= 1.3 ? "jauh lebih ramai dari hari biasa" : r.volMult <= 0.7 ? "lebih sepi dari hari biasa" : "mirip hari-hari biasa";
  const nada: Nada = r.ret7 > 0 && r.volMult >= 1.2 ? "baik" : (r.ret7 < 0 && r.volMult >= 1.2) || r.ret7 <= -5 ? "hati" : "netral";
  return p(
    "Harga & volume",
    "Return 7hr/30hr/90hr = perubahan harga dalam 7/30/90 hari terakhir (%). Volume x rerata = keramaian transaksi dibanding rata-rata 20 hari sebelumnya.",
    "Ibarat toko: harga barangnya bergerak, dan seberapa ramai pembeli yang datang hari ini dibanding hari-hari biasa.",
    `${sym} di harga ${r.price}: 7hr ${pct(r.ret7)} · 30hr ${pct(r.ret30)} · 90hr ${pct(r.ret90)}. Volume ${r.volMult}x rerata — transaksi ${ramai}. Ini ukuran keramaian dan arah harga, bukan ramalan lanjutan.`,
    nada,
  );
}

export function kohortPart(f: FlowIndex): AwamBagian {
  const besar = f.institusiNetM >= 0 ? "cenderung masuk" : "cenderung keluar";
  const ritel = f.retailNetM >= 0 ? "juga membeli" : "juga menjual";
  const dist = f.distribusiRitel
    ? " Harga naik + uang besar keluar + ritel masuk = pola distribusi: pihak besar memindahkan saham ke ritel."
    : "";
  const streak = f.asingSellStreak >= 3 ? ` Asing sudah ${f.asingSellStreak} hari beruntun net-jual.` : "";
  const nada: Nada = f.distribusiRitel || f.asingSellStreak >= 3 ? "hati" : f.institusiNetM > 0 && f.retailNetM < 0 ? "baik" : "netral";
  return p(
    "Kohort: siapa yang membeli/menjual",
    "Broker summary memecah transaksi per jenis pelaku: ritel (broker kecil) vs institusi/asing (broker besar). Net-buy = nilai beli lebih besar dari jual; net-sell sebaliknya.",
    "Ibarat papan kasir: belanjaan besar dari pembeli grosir (institusi/asing) dibanding belanjaan kecil pembeli harian (ritel).",
    `Ritel net-${f.retailNetM >= 0 ? "buy" : "sell"} ${rp(f.retailNetM)} · institusi/asing net-${f.institusiNetM >= 0 ? "buy" : "sell"} ${rp(f.institusiNetM)} (${f.windowDays} hari, ${f.nBrokers} broker). Bahasa awamnya: uang besar ${besar}, ritel ${ritel}.${dist}${streak}`,
    nada,
  );
}

export function fomoPart(f: Fomo): AwamBagian {
  const euforia =
    f.score >= 80 ? "euforia sangat tinggi — harga dan perhatian sedang panas"
    : f.score >= 65 ? "euforia tinggi — banyak orang sedang mengejar"
    : f.score >= 40 ? "euforia mulai menghangat"
    : "euforia masih rendah — pasar relatif tenang";
  return p(
    "FOMO (euforia)",
    "Skor 0–100 dari campuran lonjakan harga, lonjakan volume, jarak harga dari rata-rata 20 hari, ramainya berita tanpa filing, dan asing yang menjual. Makin tinggi = makin ramai orang mengejar.",
    "Ibarat toko yang ramai-ramai diserbu karena kabar viral — belum tentu barangnya bagus, bisa jadi cuma ikutan ramai.",
    `Skor FOMO ${f.score} (${f.label}) — komponen: ${f.components.map((c) => `${c.label} ${c.value}`).join(", ")}. Artinya ${euforia}.`,
    f.score >= 65 ? "hati" : "netral",
  );
}

export function drawdownPart(sym: string, mdd: number): AwamBagian {
  return p(
    "Drawdown (risiko koreksi)",
    "Drawdown = penurunan terjauh dari harga puncak dalam 90 hari (%). Makin dalam, makin tajam koreksi yang pernah dialami.",
    "Ibarat harga barang yang pernah didiskon dalam-dalam: dari puncak harganya, pernah turun sekian persen.",
    `${sym} pernah turun sampai ${mdd}% dari puncaknya dalam 90 hari terakhir. Ini catatan sejarah pergerakan, bukan prediksi koreksi berikutnya.`,
    mdd <= -20 ? "hati" : mdd > -10 ? "baik" : "netral",
  );
}

export function suspensiPart(sym: string, n: number | null): AwamBagian {
  return p(
    "Suspensi (penghentian perdagangan)",
    "Suspensi = bursa menghentikan sementara perdagangan suatu saham, biasanya karena masalah kepatuhan atau likuiditas.",
    "Ibarat toko yang pernah disegel sementara oleh pengelola pasar.",
    n === null ? "Sumber suspensi tidak tersedia untuk dicek (hemat kredit), jadi tidak disimpulkan apa-apa."
    : n > 0 ? `Ada ${n} catatan suspensi ${sym} di sumber — artinya saham ini pernah masuk pengawasan bursa.`
    : `Tidak ada catatan suspensi ${sym} di sumber data.`,
    n === null ? "netral" : n > 0 ? "hati" : "baik",
  );
}

export function dividenPart(sym: string, d: DividendInfo, price?: number): AwamBagian {
  const nada: Nada = d.latestYieldPct >= 10 && d.consistency < 60 ? "hati" : d.consistency >= 80 ? "baik" : "netral";
  return p(
    "Dividen & yield",
    "Yield = dividen setahun dibagi harga saham (%). Konsistensi = seberapa rutin dividen dibayar dalam maksimal 5 tahun terakhir.",
    "Ibarat bagi hasil toko: sebagian laba dibagikan ke pemilik modal. Yield = porsi bagi hasil dibanding harga beli saham.",
    `Yield terakhir ${d.latestYieldPct}% (${d.latestYear}) · rata-rata 5 tahun ${d.avgYieldPct}% · konsistensi ${d.consistency}%.${price ? ` Harga ${sym} sekarang ${price} — yield bisa terlihat naik karena harga turun, bukan karena dividennya bertambah.` : ""}`,
    nada,
  );
}

export function likuiditasPart(sym: string, l: Liquidity): AwamBagian {
  const arti: Record<string, string> = {
    "sangat likuid": "sangat mudah diperjualbelikan tanpa banyak menggerakkan harga",
    likuid: "mudah diperjualbelikan dengan volume harian yang sehat",
    cukup: "bisa diperjualbelikan, tapi volume hariannya tidak besar",
    tipis: "nilai transaksinya kecil — harga mudah bergerak tajam walau order-nya kecil",
  };
  const nada: Nada = l.label === "tipis" ? "hati" : l.label === "sangat likuid" || l.label === "likuid" ? "baik" : "netral";
  return p(
    "Likuiditas (kemudahan jual-beli)",
    "Likuiditas = seberapa mudah saham dibeli/dijual tanpa mengubah harganya. Diukur dari nilai transaksi nyata, bukan popularitas.",
    "Ibarat gampang-tidaknya barang dijual di pasar: kalau banyak pembeli, bisa cepat laku tanpa banting harga.",
    `Rata-rata nilai transaksi 20 hari ${l.avgValueB} miliar/hari → ${l.label}; kapitalisasi ${l.marketCapB} miliar. Artinya saham ${sym} ${arti[l.label] ?? l.label}.`,
    nada,
  );
}

export function ihsgPart(last: number, ret7: number, ret30: number): AwamBagian {
  return p(
    "IHSG (arah pasar keseluruhan)",
    "IHSG = indeks gabungan harga seluruh saham di bursa. Ini latar belakang arah pasar, bukan penentu satu saham.",
    "Ibarat nilai rata-rata seluruh toko di pasar induk — menggambarkan suasana pasar, bukan toko tertentu.",
    `IHSG di ${last}: 7 hari ${pct(ret7)}, 30 hari ${pct(ret30)}. Artinya pasar secara umum sedang ${ret30 >= 0 ? "naik" : "turun"} dalam sebulan terakhir.`,
  );
}

export function komoditasPart(commodity: "coal" | "nickel", pct12: number): AwamBagian {
  return p(
    "Harga komoditas",
    "Emiten tambang bergantung pada harga komoditasnya (coal/nikel). Angka ini perubahan harga komoditas dari rangkaian data bulanan terakhir.",
    "Ibarat harga bahan baku di pasar induk: kalau batu bara naik, penjual batu bara ikut kebagian angin.",
    `Harga ${commodity === "coal" ? "coal" : "nikel"} ${pct(pct12)} pada rangkaian terakhir. Artinya bahan yang dijual emiten ${pct12 >= 0 ? "sedang naik" : "sedang turun"} — ini latar belakang, bukan penentu tunggal harga sahamnya.`,
  );
}

export function volumeEmitenPart(sym: string, volPct: number): AwamBagian {
  return p(
    "Volume emiten vs periode sebelumnya",
    "Volume = jumlah saham yang ditransaksikan. Dibandingkan 20 hari terakhir vs 40 hari sebelumnya untuk melihat perubahan minat.",
    "Ibarat keramaian toko dibanding minggu-minggu sebelumnya.",
    `Volume ${sym} ${pct(volPct)} dibanding periode sebelumnya. Artinya minat transaksi ${volPct >= 0 ? "meningkat" : "menurun"} — cocokkan dengan arah harga untuk melihat apakah geraknya didukung keramaian.`,
    volPct >= 50 ? "baik" : volPct <= -30 ? "hati" : "netral",
  );
}

export function buyerPart(country: string, share: number): AwamBagian {
  return p(
    "Negara tujuan penjualan (buyer)",
    "Sales destination = ke negara mana penjualan emiten pergi. Buyer terbesar menunjukkan seberapa terpusat pasarnya.",
    "Ibarat daftar pelanggan tetap toko: kalau cuma satu negara yang beli, toko bergantung pada satu pelanggan besar.",
    `Buyer terbesar ${country} dengan ${Math.round(share * 100)}% dari volume penjualan — artinya penjualan ${share >= 0.6 ? "cukup terpusat ke satu negara" : "tersebar ke beberapa negara"}.`,
    share >= 0.6 ? "hati" : "baik",
  );
}

export function produksiPart(prodNote: string, stripDelta?: number): AwamBagian {
  return p(
    "Produksi & strip ratio",
    "Strip ratio = tonase tanah yang digali untuk tiap ton batubara. Makin tinggi, makin mahal biaya produksinya.",
    "Ibarat biaya menggali: makin banyak tanah yang dibuang untuk tiap bongkah batu bara, makin mahal ongkos produksinya.",
    `${prodNote}${typeof stripDelta === "number" ? ` Perubahan strip ratio ${sign(stripDelta)} dari tahun sebelumnya.` : ""}`,
  );
}

export function dnaPart(code: string, label: string, repeat: number): AwamBagian {
  return p(
    "DNA broker",
    "DNA broker = pola historis broker (akumulasi/distribusi/conduit asing) dari kebiasaan transaksinya — bukan identitas pemilik dana.",
    "Ibarat catatan kebiasaan pembeli besar: ada yang biasanya mengumpulkan barang, ada yang suka menjual saat ramai.",
    `Broker ${code} terbaca "${label}" dengan ${repeat}x pola serupa dalam 90 hari.${repeat >= 3 ? " Pola yang berulang membuat net-buy sesaatnya tidak otomatis berarti aman." : ""}`,
    /distribusi/i.test(label) || repeat >= 3 ? "hati" : "netral",
  );
}

export function clusterPart(flag: boolean, kind: string, n: number): AwamBagian {
  return p(
    "Cluster insider",
    "Cluster insider = banyak direksi/komisaris menjual saham di periode berdekatan. Kalau terjadi di satu sektor, artinya bukan satu orang saja.",
    "Ibarat banyak pemilik toko di satu kompleks yang ramai-ramai melepas sahamnya — patut jadi catatan.",
    flag ? `${kind === "insider-cluster" ? "Ada" : "Terdeteksi"} cluster insider-sell (${n} emiten terpantau) — pasar orang dalam sedang kompak melepas.` : `Tidak ada cluster insider mencurigakan — ${n} insider-sell terpantau di periode ini.`,
    flag ? "hati" : "baik",
  );
}

export function grupPart(groupScore: number, groups: { name: string; pct: number; tickers: string[] }[]): AwamBagian {
  const top = groups.find((g) => g.name !== "Independen" && (g.pct ?? 0) > 0);
  return p(
    "Group Score (diversifikasi)",
    "Group Score = % nilai portofolio yang ternyata dikendalikan pemilik yang sama. Makin tinggi, makin semu diversifikasinya.",
    "Ibarat punya lima cabang toko, tapi ternyata semua dimiliki satu pemilik yang sama — ramai atau sepi, semuanya bergerak bareng.",
    top
      ? `Group Score ${groupScore}% — porsi terbesar ada di grup ${top.name} (${top.tickers.join(", ")}). Artinya sebagian besar portofoliomu bergerak mengikuti satu pengendali yang sama.`
      : `Group Score ${groupScore}% — tidak ada grup dominan di universe yang dicek, portofolio relatif terpisah.`,
    groupScore >= 50 ? "hati" : groupScore === 0 ? "baik" : "netral",
  );
}

export function anomaliPart(top: { symbol: string; score: number }, n: number): AwamBagian {
  return p(
    "Anomali harga (GNN-lite)",
    "Skor 0–1: seberapa 'jalan sendiri' gerak sebuah saham dibanding saham lain yang dipindai, dilihat dari korelasi 90 hari.",
    "Ibarat satu toko yang geraknya beda sendiri dibanding kompleks pertokoan sekitarnya.",
    `Dari ${n} simbol yang dipindai, ${top.symbol} paling menyimpang (skor ${top.score}) — artinya geraknya paling berbeda dari kohortnya, bukan berarti pasti menguntungkan.`,
  );
}

export function bandingPart(a: { ticker: string; ret30: number; volMult: number }, b: { ticker: string; ret30: number; volMult: number }, selisih?: number): AwamBagian {
  return p(
    "Banding dua saham",
    "Perbandingan menyandingkan return, volume, FOMO, dan likuiditas dua saham untuk dibaca sendiri-sendiri — tidak ada pemenang yang dipilih.",
    "Ibarat membandingkan dua toko: mana yang lebih ramai dan stoknya bergerak bagaimana — tanpa menyuruh pilih salah satu.",
    `Selisih return 30 hari: ${a.ticker} ${pct(a.ret30)} vs ${b.ticker} ${pct(b.ret30)}${typeof selisih === "number" ? ` (${selisih} poin persen)` : ""}, dengan volume ${a.volMult}x vs ${b.volMult}x rerata. Angka ini bahan banding, bukan saran memilih salah satunya.`,
  );
}

export function kalenderPart(kind: "dividen" | "rights" | "split" | "agm", label: string, items: string[], wave = false): AwamBagian {
  const arti: Record<string, string> = {
    dividen: "Ex-date = tanggal batas kepemilikan dividen: membeli setelah tanggal itu tidak lagi berhak atas pembayaran periode tersebut.",
    rights: "Rights issue = emiten menerbitkan saham baru. Jumlah saham beredar bertambah dan harga sering menyesuaikan turun.",
    split: "Stock split = pemecahan nilai nominal. Jumlah lembar bertambah, harga per lembar menyesuaikan — bukan keuntungan atau kerugian.",
    agm: "AGM/RUPS = rapat pemegang saham; agendanya bisa mencakup dividen, susunan direksi, dan aksi korporasi.",
  };
  const analogi: Record<string, string> = {
    dividen: "Ibarat jadwal bagi hasil toko: lewat tanggal batasnya, pembeli baru tidak dapat bagian periode itu.",
    rights: "Ibarat kue yang sama dipotong lebih banyak: kepemilikan lama jadi lebih kecil porsinya.",
    split: "Ibarat memotong satu kue jadi lebih banyak potongan — nilainya sama, jumlah potongannya bertambah.",
    agm: "Ibarat rapat pemilik toko: agenda bisa soal bagi hasil, pengurus, atau rencana besar.",
  };
  const isi = items.length ? items.join(" · ") : `Tidak ada ${label} terjadwal di window kalender Sectors saat ini.`;
  return p(
    kind === "dividen" ? "Kalender dividen" : kind === "rights" ? "Kalender rights issue" : kind === "split" ? "Kalender stock split" : "Kalender AGM/RUPS",
    arti[kind]!,
    analogi[kind]!,
    `${isi}${wave ? " Catatan: sedang ada gelombang rights issue di pasar (banyak emiten menerbitkan saham baru dalam 30 hari) — pasokan saham pasar bertambah." : ""}`,
    wave ? "hati" : "netral",
  );
}

// — Bagian awam untuk mode fundamental (angkanya tetap milik Sectors; ARUS hanya menerjemahkan) —
export function valuasiPart(sym: string, v: { forwardPe?: number | null; pe?: number | null; pb?: number | null; year?: number; price?: number | null }): AwamBagian {
  const peTxt = v.forwardPe != null ? `forward PE ${v.forwardPe}` : "forward PE -";
  const nada: Nada = v.forwardPe != null && v.forwardPe > 25 ? "hati" : v.forwardPe != null && v.forwardPe < 12 ? "baik" : "netral";
  return p(
    "Valuasi (PE & PB)",
    "PE = harga saham dibanding laba per saham setahun (makin tinggi = makin mahal relatif ke laba). PB = harga dibanding nilai buku ekuitas. Keduanya rasio yang dihitung penyedia data, bukan ARUS.",
    "Ibarat harga toko dibanding keuntungan tahunannya: PE 20 artinya harga setara 20 kali laba setahun. PB = harga dibanding modal bersih yang tercatat.",
    `${sym}: ${peTxt} · PB ${v.pb ?? "-"}${v.year ? ` (${v.year})` : ""}${v.pe != null ? ` · PE ${v.pe}` : ""}${v.price != null ? ` · harga terakhir ${v.price}` : ""}. Artinya pasar menilai ${v.forwardPe != null && v.forwardPe > 20 ? "cukup tinggi" : "relatif moderat"} dibanding labanya — murah/mahal hanya bermakna dibanding sektornya, bukan vonis.`,
    nada,
  );
}

export function kinerjaPart(sym: string, k: { quarter: string; revenue: number; earnings: number; revYoY?: number | null; labaYoY?: number | null }): AwamBagian {
  const yoy = (x: number | null | undefined, label: string) => x == null ? `${label}: pembanding setahun tidak tersedia` : `${label} ${x >= 0 ? "naik" : "turun"} ${Math.abs(x)}% vs kuartal sama setahun lalu`;
  const nada: Nada = (k.labaYoY ?? 0) < -20 ? "hati" : (k.labaYoY ?? 0) > 10 ? "baik" : "netral";
  return p(
    "Kinerja kuartalan (laba-rugi)",
    "Pendapatan = uang masuk dari penjualan satu kuartal. Laba (earnings) = sisa setelah biaya. YoY = dibanding kuartal yang sama tahun lalu, agar tidak bias musim.",
    "Ibarat laporan kas toko per tiga bulan: berapa pemasukan dan berapa yang benar-benar tersisa — lalu dibanding periode yang sama tahun sebelumnya.",
    `${sym} ${k.quarter}: pendapatan ${fmtRp(k.revenue)} · laba ${fmtRp(k.earnings)}. ${yoy(k.revYoY, "Pendapatan")} · ${yoy(k.labaYoY, "Laba")}. Ini laporan masa lalu (1kr/kuartal dari Sectors), bukan jaminan kuartal depan.`,
    nada,
  );
}

export function tahunanPart(sym: string, rows: { year: number; revenue: number | null; earnings: number | null }[]): AwamBagian {
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const revPct = last?.revenue && prev?.revenue ? Math.round(((last.revenue - prev.revenue) / Math.abs(prev.revenue)) * 1000) / 10 : null;
  const labaPct = last?.earnings && prev?.earnings ? Math.round(((last.earnings - prev.earnings) / Math.abs(prev.earnings)) * 1000) / 10 : null;
  return p(
    "Kinerja tahunan",
    "Laporan tahunan = ringkasan laba-rugi setahun penuh (bukan kuartalan). Berguna melihat arah jangka panjang, tapi datanya lebih lama.",
    "Ibarat rapor tahunan toko dibanding catatan tiga-bulanan: gambaran besarnya lebih jelas, tapi lebih ketinggalan zaman.",
    last ? `${sym} ${last.year}: pendapatan ${fmtRp(last.revenue)} · laba ${fmtRp(last.earnings)}. ${revPct == null ? "" : `Pendapatan ${revPct >= 0 ? "naik" : "turun"} ${Math.abs(revPct)}% `}${labaPct == null ? "" : `· laba ${labaPct >= 0 ? "naik" : "turun"} ${Math.abs(labaPct)}% `}dibanding ${prev?.year ?? "-"}.` : `Data tahunan ${sym} tidak tersedia di Sectors.`,
    (labaPct ?? 0) < -20 ? "hati" : "netral",
  );
}

export function segmenPart(sym: string, year: number, segs: { name: string; share: number; value: number }[]): AwamBagian {
  const top = segs[0];
  return p(
    "Segmen pendapatan",
    "Segmen = dari mana saja pendapatan perusahaan berasal. Terpusat di satu sumber membuat kinerja ikut bergantung pada sumber itu.",
    "Ibarat toko dengan beberapa lini dagangan: kalau sebagian besar pemasukan dari satu barang, nasib toko ikut harga barang itu.",
    top
      ? `${sym} ${year}: sumber terbesar ${top.name} (${top.share}% dari ${segs.length} segmen terdata, total ${fmtRp(segs.reduce((s, x) => s + x.value, 0))}). Artinya pendapatan ${top.share >= 60 ? "sangat terpusat" : top.share >= 40 ? "cukup terpusat" : "cukup tersebar"} ke satu sumber.`
      : `Segmen pendapatan ${sym} tidak tersedia di Sectors — tidak disimpulkan apa-apa.`,
    top && top.share >= 60 ? "hati" : "netral",
  );
}

export function prospekPart(sym: string, f: { year: number; epsGrowth: number | null; revenueGrowth: number | null; nAnalyst: number | null; buy: number | null; hold: number | null; sell: number | null }): AwamBagian {
  return p(
    "Prospek & estimasi analis",
    "Estimasi analis = proyeksi pihak ketiga (bukan ARUS, bukan Sectors) tentang laba/pendapatan tahun depan. Rekomendasi analis bisa keliru dan sering berubah.",
    "Ibarat ramalan musim dari beberapa petani tua: berguna sebagai bahan, tapi cuaca tetap bisa lain.",
    `${sym} ${f.year}: estimasi pertumbuhan laba ${f.epsGrowth == null ? "-" : `${f.epsGrowth}%`} · pendapatan ${f.revenueGrowth == null ? "-" : `${f.revenueGrowth}%`} · rating ${f.buy ?? "-"} beli / ${f.hold ?? "-"} tahan / ${f.sell ?? "-"} jual dari ${f.nAnalyst ?? "-"} analis. Ini proyeksi pihak ketiga — bukan target harga ARUS dan bukan ajakan.`,
    "netral",
  );
}

export function manajemenPart(sym: string, execs: { name: string; position: string }[], holders: { name: string; pct: number | null }[]): AwamBagian {
  return p(
    "Manajemen (direksi)",
    "Key executives = jajaran yang menjalankan perusahaan. Kepemilikan saham direksi menunjukkan seberapa terikat mereka pada hasil perusahaan.",
    "Ibarat daftar pengurus toko dan berapa saham toko yang mereka pegang sendiri.",
    `${sym}: ${execs.slice(0, 3).map((x) => `${x.name} (${x.position})`).join(", ") || "daftar direksi tidak tersedia"}${holders.length ? `. Kepemilikan eksekutif terdata: ${holders.slice(0, 2).map((x) => `${x.name}${x.pct != null ? ` ${x.pct}%` : ""}`).join(", ")}.` : ""} Ini profil pengurus dari sumber, bukan penilaian kualitas manajemen.`,
  );
}

export function peerPart(sym: string, peers: { symbol: string; pe: number | null; pb: number | null }[], self: { pe: number | null; pb: number | null }): AwamBagian {
  const pes = peers.map((x) => x.pe).filter((x): x is number => x != null).sort((a, b) => a - b);
  const range = pes.length ? `${pes[0]}–${pes[pes.length - 1]}` : "-";
  return p(
    "Peer sebanding",
    "Peer = emiten lain di subsektor yang sama. Membandingkan PE/PB dengan peer menunjukkan posisi relatif, bukan kualitas mutlak.",
    "Ibarat membandingkan harga toko dengan toko sejenis di kompleks yang sama — yang satu lebih murah bisa jadi karena masalahnya juga beda.",
    `${sym}: PE ${self.pe ?? "-"} · PB ${self.pb ?? "-"}. Rentang PE ${peers.length} peer: ${range}. Artinya posisi ${self.pe != null && pes.length && self.pe <= pes[0]! ? "di ujung bawah" : self.pe != null && pes.length && self.pe >= pes[pes.length - 1]! ? "di ujung atas" : "di tengah"} kelompoknya — bahan banding, bukan vonis.`,
    "netral",
  );
}

export function tentangPart(sym: string, o: { sector?: string; subSector?: string; marketCap: number | null; listingDate?: string; employeeNum: number | null }): AwamBagian {
  return p(
    "Profil perusahaan",
    "Profil = sektor tempat perusahaan diklasifikasikan, ukuran (market cap), sejak kapan tercatat di bursa, dan jumlah karyawan.",
    "Ibarat kartu identitas toko: jenis dagangan, ukuran, dan sudah berapa lama buka.",
    `${sym}: ${o.sector ?? "-"}${o.subSector ? ` / ${o.subSector}` : ""} · market cap ${fmtRp(o.marketCap)}${o.listingDate ? ` · listing ${o.listingDate}` : ""}${o.employeeNum != null ? ` · ${o.employeeNum} karyawan` : ""}. Klasifikasi sektor mengikuti sumber data.`,
  );
}

export function entitasPart(nama: string, hits: { symbol: string; companyName: string; sector?: string }[], misses: string[]): AwamBagian {
  const list = hits.map((h) => `${h.symbol} (${h.companyName}${h.sector ? `, ${h.sector}` : ""})`).join(" · ");
  return p(
    "Mencari saham dari nama/brand",
    "Nama brand atau perusahaan belum tentu sama dengan kode sahamnya. Kode ditebak dari pengenalan nama, lalu diverifikasi ke data resmi Sectors sebelum ditampilkan.",
    "Ibarat mencari nomor telepon dari nama toko: namanya diingat dulu, nomor yang dipakai tetap nomor yang terdaftar resmi.",
    hits.length
      ? `Terverifikasi di Sectors untuk "${nama}": ${list}.${misses.length ? ` Kandidat ${misses.join(", ")} tidak lolos verifikasi sehingga dibuang.` : ""} Keterkaitan brand dengan emiten tetap kemungkinan relasi, bukan klaim.`
      : `Tidak ada kandidat yang lolos verifikasi Sectors untuk "${nama}". ARUS tidak mengarang kode saham${misses.length ? ` (kandidat ${misses.join(", ")} tidak ditemukan)` : ""}.`,
    hits.length ? "netral" : "hati",
  );
}

export function pemilikPart(sym: string, group: string | undefined, holders: { name: string; pct: number }[]): AwamBagian {
  return p(
    "Pemilik & induk usaha",
    "Struktur pemilik = siapa saja yang punya porsi saham besar di sebuah perusahaan. Dari sini terlihat kemungkinan induk atau afiliasinya.",
    "Ibarat daftar nama pemegang kunci toko: makin besar porsinya, makin besar pengaruhnya.",
    `${sym} dipegang: ${holders.slice(0, 3).map((h) => `${h.name} ${h.pct}%`).join(" · ") || "-"}${group ? ` · kemungkinan grup: ${group}` : ""}. Ini laporan terakhir — bisa berubah, dan pemilik di bawah ambang laporan tidak terlihat.`,
  );
}

/** Fallback deterministik untuk pertanyaan lanjutan bila LLM tidak tersedia/gagal validasi. */
export function lanjutanFor(sym: string | undefined, intents: string[]): string[] {
  if (!sym) return ["pasar lagi gimana?", "scan pagi", "ada cluster insider?"];
  const has = (x: string) => intents.includes(x);
  const out = [`ex-date ${sym} kapan?`];
  if (has("dividen") || has("likuiditas")) out.push(`kenapa ${sym} bergerak?`, `broker siapa dominan di ${sym}?`);
  else if (has("banding")) out.push(`risiko ${sym} apa?`, `yield ${sym} aman?`);
  else if (has("fundamental")) out.push(`laba ${sym} gimana?`, `valuasi ${sym} gimana?`);
  else if (has("barang")) out.push(`likuiditas ${sym} gimana?`, `risiko ${sym} apa?`);
  else out.push(`broker siapa dominan di ${sym}?`, `risiko ${sym} apa?`);
  return [...new Set(out)].slice(0, 3);
}