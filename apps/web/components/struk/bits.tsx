"use client";

import type { Src } from "@/lib/struk";

// Setiap angka bisa ditelusuri: endpoint Sectors, field, query, kapan diambil, berapa kredit.
export function SrcNote({ src, label = "dari mana angka ini?" }: { src: Src | null | undefined; label?: string }) {
  if (!src) return null;
  return (
    <details className="sj-src">
      <summary>{label}</summary>
      <div className="body">
        <div>sumber: Sectors · {src.api}</div>
        {src.field && <div>field: {src.field}</div>}
        {src.query && <div>query: {src.query}</div>}
        {src.fetched_at && <div>diambil: {src.fetched_at}</div>}
        <div>
          kredit untuk tampilan ini: {src.credits}
          {src.source === "store-hit" || src.source === "snapshot" ? " (dari cache — tidak memanggil ulang API)" : ""}
        </div>
      </div>
    </details>
  );
}

const GLOSSARY: Record<string, string> = {
  pendapatan: "Total uang yang masuk dari penjualan sebelum dikurangi biaya apa pun.",
  laba: "Uang yang tersisa setelah semua biaya, bunga, dan pajak dibayar.",
  margin: "Berapa bagian dari setiap penjualan yang tersisa sebagai laba.",
  kapitalisasi: "Harga seluruh saham perusahaan di bursa hari ini — anggap saja 'harga pasar' perusahaan.",
  utang: "Uang pinjaman yang harus dikembalikan, termasuk ke bank dan pemegang obligasi.",
  modal: "Uang milik pemegang saham di dalam perusahaan (aset dikurangi utang).",
  dividen: "Bagian laba yang dibagikan tunai ke pemegang saham.",
  roe: "Laba dibanding modal pemegang saham — seberapa produktif uang pemilik dipakai.",
  publik: "Saham yang dimiliki banyak orang lewat bursa, bukan oleh pengendali.",
  pengendali: "Pihak yang memegang saham cukup besar untuk menentukan arah perusahaan.",
};

export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children: React.ReactNode }) {
  return (
    <span className="sj-term" title={GLOSSARY[k] ?? ""}>
      {children}
    </span>
  );
}
