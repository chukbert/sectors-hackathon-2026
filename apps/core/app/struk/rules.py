"""Pertanyaan Kritis: pola laporan keuangan yang layak dipertanyakan, dalam bahasa Screener Sectors.

Setiap aturan punya DUA wujud yang harus sepakat:
- `where`  → dikirim ke Screener Sectors (1 kredit) untuk menghitung berapa emiten SE-BURSA
             yang punya pola ini (pagination.total_count). Ekspresi ini ditampilkan ke pengguna
             sebagai bukti.
- `check`  → evaluasi lokal atas matriks snapshot untuk SATU emiten (0 kredit).
Konsistensi keduanya diuji di tests/test_struk.py terhadap snapshot.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .universe import LATEST

Y, Y1, Y2 = LATEST, LATEST - 1, LATEST - 2


def _n(rec: dict[str, Any], field: str) -> float | None:
    v = rec.get(field)
    if v is None or isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _all(*vals: float | None) -> bool:
    return all(v is not None for v in vals)


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    tone: str  # "tanya" (kejanggalan) | "positif" (pola sehat, tetap dipertanyakan)
    where: str
    check: Callable[[dict[str, Any]], bool]
    fields: tuple[str, ...]
    question: str  # pertanyaan sokratik untuk pengguna
    hints: tuple[str, ...]  # kemungkinan jawaban umum (bukan klaim tentang emiten)


def _rev_up_earn_down(r):
    a, b, c, d = _n(r, f"revenue[{Y}]"), _n(r, f"revenue[{Y1}]"), _n(r, f"earnings[{Y}]"), _n(r, f"earnings[{Y1}]")
    return _all(a, b, c, d) and a > b and c < d


def _earn_down_2y(r):
    a, b, c = _n(r, f"earnings[{Y}]"), _n(r, f"earnings[{Y1}]"), _n(r, f"earnings[{Y2}]")
    return _all(a, b, c) and a < b < c


def _debt_gt_equity(r):
    d, e = _n(r, f"total_debt[{Y}]"), _n(r, f"total_equity[{Y}]")
    return _all(d, e) and d > e


def _payout_gt_1(r):
    p = _n(r, "payout_ratio")
    return p is not None and p > 1


def _loss(r):
    e = _n(r, f"earnings[{Y}]")
    return e is not None and e < 0


def _cash_vs_profit(r):
    o, e = _n(r, f"operating_cash_flow[{Y}]"), _n(r, f"earnings[{Y}]")
    return _all(o, e) and o < 0 and e > 0


def _margin_drop(r):
    a, b = _n(r, f"net_profit_margin[{Y}]"), _n(r, f"net_profit_margin[{Y1}]")
    return _all(a, b) and b > 0 and a < b * 0.7


def _earn_up_3y(r):
    a, b, c = _n(r, f"earnings[{Y}]"), _n(r, f"earnings[{Y1}]"), _n(r, f"earnings[{Y2}]")
    return _all(a, b, c) and c > 0 and a > b > c


def _rev_jump(r):
    a, b = _n(r, f"revenue[{Y}]"), _n(r, f"revenue[{Y1}]")
    return _all(a, b) and b > 0 and a > b * 1.2


RULES: list[Rule] = [
    Rule("rev_up_earn_down", "Penjualan naik, tapi laba turun", "tanya",
         f"revenue[{Y}] > revenue[{Y1}] and earnings[{Y}] < earnings[{Y1}]", _rev_up_earn_down,
         (f"revenue[{Y1}]", f"revenue[{Y}]", f"earnings[{Y1}]", f"earnings[{Y}]"),
         "Barang yang terjual makin banyak, tapi untungnya justru turun. Menurutmu uangnya habis ke mana?",
         ("Biaya bahan baku naik lebih cepat dari harga jual", "Perang harga/diskon dengan pesaing",
          "Beban bunga atau kurs", "Biaya ekspansi (toko/pabrik baru)")),
    Rule("earn_down_2y", "Laba turun dua tahun berturut-turut", "tanya",
         f"earnings[{Y}] < earnings[{Y1}] and earnings[{Y1}] < earnings[{Y2}]", _earn_down_2y,
         (f"earnings[{Y2}]", f"earnings[{Y1}]", f"earnings[{Y}]"),
         "Laba turun dua tahun beruntun. Apakah ini masalah sementara atau tanda bisnisnya melemah?",
         ("Siklus industri sedang turun", "Pesaing baru merebut pasar", "Biaya tetap naik terus")),
    Rule("debt_gt_equity", "Utang lebih besar dari modal sendiri", "tanya",
         f"total_debt[{Y}] > total_equity[{Y}]", _debt_gt_equity,
         (f"total_debt[{Y}]", f"total_equity[{Y}]"),
         "Perusahaan ini memakai lebih banyak uang pinjaman daripada uang pemiliknya. Kapan itu wajar, kapan berbahaya?",
         ("Wajar bila arus kasnya stabil (mis. infrastruktur)", "Berbahaya bila laba naik-turun",
          "Perhatikan bunga yang harus dibayar")),
    Rule("payout_gt_1", "Dividen lebih besar dari laba", "tanya",
         "payout_ratio > 1", _payout_gt_1, ("payout_ratio",),
         "Perusahaan membagi dividen melebihi labanya. Uang tambahannya dari mana, dan bisa bertahan berapa lama?",
         ("Dari kas tabungan tahun-tahun sebelumnya", "Dari pinjaman", "Laba tahun ini sedang turun sementara")),
    Rule("loss", f"Rugi di tahun {Y}", "tanya",
         f"earnings[{Y}] < 0", _loss, (f"earnings[{Y}]",),
         "Tahun lalu perusahaan ini rugi. Rugi karena sedang berinvestasi untuk tumbuh, atau karena bisnisnya tidak jalan?",
         ("Fase ekspansi/bakar uang", "Penurunan nilai aset sekali waktu", "Model bisnis belum untung")),
    Rule("cash_vs_profit", "Untung di atas kertas, tapi kas operasinya minus", "tanya",
         f"operating_cash_flow[{Y}] < 0 and earnings[{Y}] > 0", _cash_vs_profit,
         (f"earnings[{Y}]", f"operating_cash_flow[{Y}]"),
         "Laporannya untung, tapi uang tunai dari operasi justru keluar. Bagaimana itu bisa terjadi?",
         ("Banyak penjualan kredit yang belum dibayar pelanggan", "Stok barang menumpuk", "Untung dari penjualan aset")),
    Rule("margin_drop", "Margin laba bersih anjlok lebih dari 30%", "tanya",
         f"net_profit_margin[{Y1}] > 0 and net_profit_margin[{Y}] < net_profit_margin[{Y1}] * 0.7", _margin_drop,
         (f"net_profit_margin[{Y1}]", f"net_profit_margin[{Y}]"),
         "Dari setiap Rp100 penjualan, sisa untungnya menyusut tajam. Apa yang berubah?",
         ("Harga bahan baku/energi naik", "Harus banting harga", "Beban baru (pajak, bunga, gaji)")),
    Rule("earn_up_3y", "Laba naik tiga tahun berturut-turut", "positif",
         f"earnings[{Y2}] > 0 and earnings[{Y1}] > earnings[{Y2}] and earnings[{Y}] > earnings[{Y1}]", _earn_up_3y,
         (f"earnings[{Y2}]", f"earnings[{Y1}]", f"earnings[{Y}]"),
         "Labanya naik terus tiga tahun. Apa yang membuatnya konsisten, dan apa yang bisa menghentikannya?",
         ("Merek kuat sehingga bisa menaikkan harga", "Pasar yang terus tumbuh", "Efisiensi biaya")),
    Rule("rev_jump", "Penjualan melonjak lebih dari 20%", "positif",
         f"revenue[{Y1}] > 0 and revenue[{Y}] > revenue[{Y1}] * 1.2", _rev_jump,
         (f"revenue[{Y1}]", f"revenue[{Y}]"),
         "Penjualannya melonjak lebih dari 20% setahun. Pertumbuhan dari jualan lebih banyak, harga naik, atau beli perusahaan lain?",
         ("Akuisisi perusahaan lain", "Ekspansi toko/wilayah", "Kenaikan harga komoditas")),
]

RULES_BY_ID = {r.id: r for r in RULES}


def cohort_params(rule: Rule) -> dict[str, Any]:
    # Biaya tetap 1 kredit berapa pun limit-nya: total_count = ukuran kohort se-bursa,
    # 10 baris teratas (market cap) = contoh emiten lain dengan pola sama.
    return {"where": rule.where, "order_by": "-market_cap", "limit": 10, "include_query_values": "true"}


def matches(rec: dict[str, Any]) -> list[Rule]:
    return [r for r in RULES if r.check(rec)]
