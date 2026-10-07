"""Lima sisi, 30 cek: kerangka cek fundamental yang diadaptasi dari model terbuka Simply Wall St
(github.com/SimplyWallSt/Company-Analysis-Model), dihitung 100% dari matriks Screener Sectors.

Setiap cek adalah pertanyaan ya/tidak atas angka Sectors untuk SATU emiten:
- True / False  → lolos / tidak lolos
- None          → data Sectors tidak cukup untuk menilai (bukan dianggap gagal)

Pembandingan "median bursa" dan "median industri" dihitung lokal dari matriks 962 emiten, jadi
tetap 0 kredit. Setiap cek membawa ekspresi `where` setara yang bisa dijalankan ulang di
Screener Sectors. Penyimpangan dari model aslinya ditulis terbuka di `note` (mis. data Sectors
mulai ±2020, jadi cek 10 tahun menjadi 5 tahun; tidak ada suku bunga bebas risiko di Sectors).

Ini bukan rating dan bukan saran beli/jual: bentuknya menunjukkan cek mana yang lolos.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .universe import FORECAST_YEAR, HIST_YEAR, LATEST, YEARS

Y, F, H = LATEST, FORECAST_YEAR, HIST_YEAR
Y0 = YEARS[0]
Rec = dict[str, Any]
Result = bool | None


def _n(rec: Rec, field: str) -> float | None:
    v = rec.get(field)
    if v is None or isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _all(*vals: float | None) -> bool:
    return all(v is not None for v in vals)


def _median(vals: list[float]) -> float | None:
    return _quantile(vals, 0.5)


def _quantile(vals: list[float], q: float) -> float | None:
    s = sorted(vals)
    if not s:
        return None
    pos = (len(s) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def _r(v: float | None) -> float | None:
    # Konstanta dibulatkan sama persis di `where` dan di evaluasi lokal agar keduanya sepakat.
    return None if v is None else round(v, 4)


def is_bank(rec: Rec) -> bool:
    return rec.get("sub_sector") == "Banks" or _n(rec, f"gross_loan[{Y}]") is not None


def pays_dividend(rec: Rec) -> bool:
    if (_n(rec, "yield_ttm") or 0) > 0:
        return True
    return any((_n(rec, f"total_dividend[{y}]") or 0) > 0 for y in range(H, Y + 1))


# ---------------------------------------------------------------- statistik pembanding (0 kredit)

@dataclass
class Stats:
    market_pe: float | None
    market_eps_growth_fc: float | None
    market_rev_growth_fc: float | None
    yield_p25: float | None
    yield_p75: float | None
    industry_eps_growth: dict[str, float | None]
    industry_roa: dict[str, float | None]
    peer_key: dict[str, str]  # simbol → label kelompok pembanding (industri, atau subsektor bila sepi)


def _peer_groups(records: dict[str, Rec]) -> dict[str, str]:
    by_ind: dict[str, int] = {}
    for r in records.values():
        if r.get("industry"):
            by_ind[r["industry"]] = by_ind.get(r["industry"], 0) + 1
    out = {}
    for sym, r in records.items():
        ind = r.get("industry")
        # Sama seperti tabel "teman sejenis": industri bila ≥4 anggota, selain itu subsektor.
        out[sym] = f"industri {ind}" if ind and by_ind.get(ind, 0) >= 4 else f"subsektor {r.get('sub_sector') or '—'}"
    return out


def compute_stats(records: dict[str, Rec]) -> Stats:
    def col(field: str, keep: Callable[[float], bool] = lambda v: True) -> list[float]:
        return [v for r in records.values() if (v := _n(r, field)) is not None and keep(v)]

    peer_key = _peer_groups(records)
    groups: dict[str, list[Rec]] = {}
    for sym, r in records.items():
        groups.setdefault(peer_key[sym], []).append(r)

    def per_group(field: str) -> dict[str, float | None]:
        return {g: _r(_median([v for r in rs if (v := _n(r, field)) is not None])) for g, rs in groups.items()}

    payers = col("yield_ttm", lambda v: v > 0)
    return Stats(
        market_pe=_r(_median(col("pe_ttm", lambda v: v > 0))),
        market_eps_growth_fc=_r(_median(col(f"forecast_eps_growth[{F}]"))),
        market_rev_growth_fc=_r(_median(col(f"forecast_revenue_growth[{F}]"))),
        yield_p25=_r(_quantile(payers, 0.25)),
        yield_p75=_r(_quantile(payers, 0.75)),
        industry_eps_growth=per_group(f"eps_growth[{Y}]"),
        industry_roa=per_group(f"roa[{Y}]"),
        peer_key=peer_key,
    )


# ---------------------------------------------------------------- definisi cek

@dataclass(frozen=True)
class Check:
    id: str
    axis: str
    title: str
    fields: tuple[str, ...]
    test: Callable[[Rec, Stats, str], Result]
    where: Callable[[Stats, str], str]  # ekspresi Screener setara untuk emiten ini
    note: str = ""  # penyimpangan dari model asli, ditampilkan apa adanya


def _const(text: str) -> Callable[[Stats, str], str]:
    return lambda st, sym: text


# --- 1. Harga (Value)

def _v_intrinsic(margin: float) -> Callable[[Rec, Stats, str], Result]:
    def t(r, st, sym):
        iv, p = _n(r, "intrinsic_value"), _n(r, "last_close_price")
        if not _all(iv, p):
            return None
        return iv > 0 and p < iv * (1 - margin)
    return t


def _v_pe_market(r, st, sym):
    pe = _n(r, "pe_ttm")
    if pe is None or st.market_pe is None:
        return None
    return 0 < pe < st.market_pe


def _v_vs_peer(field: str, peer: str) -> Callable[[Rec, Stats, str], Result]:
    def t(r, st, sym):
        a, b = _n(r, field), _n(r, peer)
        if not _all(a, b):
            return None
        return 0 < a < b
    return t


def _v_peg(r, st, sym):
    v, pe = _n(r, f"peg[{Y}]"), _n(r, f"pe[{Y}]")
    if not _all(v, pe):
        return None
    # PE negatif ÷ pertumbuhan negatif juga menghasilkan PEG positif: perusahaan rugi tidak lolos.
    return pe > 0 and 0 < v < 1


# --- 2. Prospek (Future) — konsensus analis; hanya ±10% emiten yang diliput

def _f_profitable(r, st, sym):
    e = _n(r, f"forecast_eps_estimate[{F}]")
    return None if e is None else e > 0


def _f_vs_market(field: str, attr: str) -> Callable[[Rec, Stats, str], Result]:
    def t(r, st, sym):
        v, m = _n(r, field), getattr(st, attr)
        if v is None or m is None:
            return None
        return v > m
    return t


def _f_above(field: str, thr: float) -> Callable[[Rec, Stats, str], Result]:
    def t(r, st, sym):
        v = _n(r, field)
        return None if v is None else v > thr
    return t


def _f_roe(r, st, sym):
    eps, sh, eq = _n(r, f"forecast_eps_estimate[{F}]"), _n(r, f"outstanding_shares[{Y}]"), _n(r, f"total_equity[{Y}]")
    if not _all(eps, sh, eq) or eq <= 0:
        return None
    return eps * sh > eq * 0.2


# --- 3. Rekam jejak (Past)

def _p_vs_group(field: str, attr: str) -> Callable[[Rec, Stats, str], Result]:
    def t(r, st, sym):
        v, m = _n(r, field), getattr(st, attr).get(st.peer_key.get(sym, ""))
        if v is None or m is None:
            return None
        return v > m
    return t


def _p_eps_5y(r, st, sym):
    a, b = _n(r, f"eps[{Y}]"), _n(r, f"eps[{H}]")
    return None if not _all(a, b) else a > b


def _p_accel(r, st, sym):
    g = [_n(r, f"eps_growth[{y}]") for y in range(H + 1, Y + 1)]
    if not _all(*g):
        return None
    return g[-1] > sum(g) / len(g)


def _p_roe(r, st, sym):
    v = _n(r, f"roe[{Y}]")
    return None if v is None else v > 0.2


def _roce(r: Rec, y: int) -> float | None:
    e, a, cl = _n(r, f"ebit[{y}]"), _n(r, f"total_assets[{y}]"), _n(r, f"current_liabilities[{y}]")
    if not _all(e, a, cl) or a - cl <= 0:
        return None
    return e / (a - cl)


def _p_roce(r, st, sym):
    now, then = _roce(r, Y), _roce(r, Y0)
    return None if not _all(now, then) else now > then


# --- 4. Kesehatan (Health) — non-bank

def _h_current(r, st, sym):
    v = _n(r, f"current_ratio[{Y}]")
    return None if v is None else v > 1


def _h_ca_vs_ncl(r, st, sym):
    a, b = _n(r, f"current_assets[{Y}]"), _n(r, f"non_current_liabilities[{Y}]")
    return None if not _all(a, b) else a > b


def _h_der_trend(r, st, sym):
    now, then = _n(r, f"debt_to_equity_ratio[{Y}]"), _n(r, f"debt_to_equity_ratio[{H}]")
    if not _all(now, then):
        return None
    return 0 <= now <= then


def _h_der_low(r, st, sym):
    v = _n(r, f"debt_to_equity_ratio[{Y}]")
    return None if v is None else 0 <= v < 0.4


def _h_ocf_debt(r, st, sym):
    if _n(r, f"total_debt[{Y}]") == 0:
        return True  # tanpa utang berbunga: tidak ada yang perlu ditutup
    v = _n(r, f"cash_flow_to_debt_ratio[{Y}]")
    return None if v is None else v > 0.2


def _h_interest(r, st, sym):
    v = _n(r, f"interest_coverage_ratio[{Y}]")
    return None if v is None else v > 5


# --- 4b. Kesehatan bank (model asli juga memakai cek berbeda untuk lembaga keuangan)

def _b_npl(r, st, sym):
    npl, loan = _n(r, f"non_performing_loan[{Y}]"), _n(r, f"gross_loan[{Y}]")
    if not _all(npl, loan) or loan <= 0:
        return None
    return npl < loan * 0.02


def _b_ldr(r, st, sym):
    v = _n(r, f"loan_to_deposit_ratio[{Y}]")
    return None if v is None else v < 1.1


def _b_leverage(r, st, sym):
    a, e = _n(r, f"total_assets[{Y}]"), _n(r, f"total_equity[{Y}]")
    if not _all(a, e) or e <= 0:
        return None
    return a < e * 20


def _b_car(r, st, sym):
    v = _n(r, f"capital_adequacy_ratio[{Y}]")
    return None if v is None else v > 0.08


# --- 5. Dividen

def _d_yield(attr: str) -> Callable[[Rec, Stats, str], Result]:
    def t(r, st, sym):
        thr = getattr(st, attr)
        if thr is None:
            return None
        if not pays_dividend(r):
            return False
        v = _n(r, "yield_ttm")
        return None if v is None else v > thr
    return t


def _d_stable(r, st, sym):
    if not pays_dividend(r):
        return False
    d = [_n(r, f"total_dividend[{y}]") or 0 for y in range(H, Y + 1)]
    return all(v > 0 for v in d) and all(d[i] >= d[i - 1] * 0.9 for i in range(1, len(d)))


def _d_growth(r, st, sym):
    if not pays_dividend(r):
        return False
    a, b = _n(r, f"total_dividend[{Y}]"), _n(r, f"total_dividend[{H}]")
    return (a or 0) > 0 and (b or 0) > 0 and a > b


def _d_payout(r, st, sym):
    if not pays_dividend(r):
        return False
    v = _n(r, "payout_ratio")
    return None if v is None else 0 < v <= 0.9


def _d_payout_fc(r, st, sym):
    eps = _n(r, f"forecast_eps_estimate[{F}]")
    if eps is None:
        return None
    if not pays_dividend(r):
        return False
    d = _n(r, f"total_dividend[{Y}]") or 0
    return eps > 0 and 0 < d <= eps * 0.9


def _stat(fmt: str, attr: str) -> Callable[[Stats, str], str]:
    return lambda st, sym: fmt.format(getattr(st, attr))


def _group_where(field: str, attr: str) -> Callable[[Stats, str], str]:
    return lambda st, sym: f"{field} > {getattr(st, attr).get(st.peer_key.get(sym, ''))}"


AXES = [
    ("value", "Harga", "Apakah harga sahamnya murah dibanding nilai, laba, dan aset perusahaan?"),
    ("future", "Prospek", "Apa perkiraan analis untuk tahun depan? Hanya ±10% emiten yang diliput analis."),
    ("past", "Rekam jejak", "Bagaimana laba dan efisiensinya bergerak beberapa tahun terakhir?"),
    ("health", "Kesehatan", "Apakah utangnya terkendali dan kasnya cukup?"),
    ("dividend", "Dividen", "Apakah perusahaan membagi laba ke pemegang saham secara konsisten?"),
]

CHECKS: list[Check] = [
    # Harga
    Check("v_iv20", "value", "Harga saham ≥20% di bawah perkiraan nilai wajar Sectors",
          ("last_close_price", "intrinsic_value"), _v_intrinsic(0.2),
          _const("intrinsic_value > 0 and last_close_price < intrinsic_value * 0.8"),
          "Nilai wajar memakai intrinsic_value dari Sectors; model asli memakai DCF buatannya sendiri."),
    Check("v_iv40", "value", "Harga saham ≥40% di bawah perkiraan nilai wajar Sectors",
          ("last_close_price", "intrinsic_value"), _v_intrinsic(0.4),
          _const("intrinsic_value > 0 and last_close_price < intrinsic_value * 0.6")),
    Check("v_pe_mkt", "value", "PE lebih rendah dari median bursa",
          ("pe_ttm",), _v_pe_market, _stat("pe_ttm > 0 and pe_ttm < {}", "market_pe"),
          "Median PE positif dari seluruh emiten di matriks Sectors."),
    Check("v_pe_peer", "value", "PE lebih rendah dari rata-rata industrinya",
          (f"pe[{Y}]", f"pe_peer_avg[{Y}]"), _v_vs_peer(f"pe[{Y}]", f"pe_peer_avg[{Y}]"),
          _const(f"pe[{Y}] > 0 and pe[{Y}] < pe_peer_avg[{Y}]")),
    Check("v_peg", "value", "PEG antara 0 dan 1: harga sebanding dengan pertumbuhan labanya",
          (f"peg[{Y}]", f"pe[{Y}]"), _v_peg, _const(f"pe[{Y}] > 0 and peg[{Y}] > 0 and peg[{Y}] < 1"),
          "PEG Sectors memakai pertumbuhan laba yang sudah terjadi; model asli memakai perkiraan."),
    Check("v_pb_peer", "value", "PB (harga dibanding nilai buku) lebih rendah dari rata-rata industrinya",
          (f"pb[{Y}]", f"pb_peer_avg[{Y}]"), _v_vs_peer(f"pb[{Y}]", f"pb_peer_avg[{Y}]"),
          _const(f"pb[{Y}] > 0 and pb[{Y}] < pb_peer_avg[{Y}]")),
    # Prospek
    Check("f_profit", "future", f"Diperkirakan untung di tahun {F}",
          (f"forecast_eps_estimate[{F}]",), _f_profitable, _const(f"forecast_eps_estimate[{F}] > 0"),
          "Model asli membandingkan dengan suku bunga bebas risiko + inflasi; Sectors tidak menyediakan "
          "data itu, jadi kami pakai syarat alternatif di model asli: diperkirakan untung."),
    Check("f_eps_mkt", "future", "Perkiraan pertumbuhan laba di atas median bursa",
          (f"forecast_eps_growth[{F}]",), _f_vs_market(f"forecast_eps_growth[{F}]", "market_eps_growth_fc"),
          _stat(f"forecast_eps_growth[{F}] > {{}}", "market_eps_growth_fc"),
          "Median dari emiten yang diliput analis."),
    Check("f_rev_mkt", "future", "Perkiraan pertumbuhan pendapatan di atas median bursa",
          (f"forecast_revenue_growth[{F}]",), _f_vs_market(f"forecast_revenue_growth[{F}]", "market_rev_growth_fc"),
          _stat(f"forecast_revenue_growth[{F}] > {{}}", "market_rev_growth_fc")),
    Check("f_eps20", "future", "Perkiraan pertumbuhan laba lebih dari 20%",
          (f"forecast_eps_growth[{F}]",), _f_above(f"forecast_eps_growth[{F}]", 0.2),
          _const(f"forecast_eps_growth[{F}] > 0.2"), "Perkiraan 1 tahun; model asli rata-rata 1–3 tahun."),
    Check("f_rev20", "future", "Perkiraan pertumbuhan pendapatan lebih dari 20%",
          (f"forecast_revenue_growth[{F}]",), _f_above(f"forecast_revenue_growth[{F}]", 0.2),
          _const(f"forecast_revenue_growth[{F}] > 0.2")),
    Check("f_roe20", "future", f"Perkiraan ROE {F} lebih dari 20% (hitungan kasar)",
          (f"forecast_eps_estimate[{F}]", f"outstanding_shares[{Y}]", f"total_equity[{Y}]"), _f_roe,
          _const(f"forecast_eps_estimate[{F}] * outstanding_shares[{Y}] > total_equity[{Y}] * 0.2"),
          f"Sectors tidak punya perkiraan ROE 3 tahun; didekati dengan perkiraan laba {F} dibagi modal {Y}."),
    # Rekam jejak
    Check("p_eps_ind", "past", f"Pertumbuhan laba per saham {Y} di atas median kelompoknya",
          (f"eps_growth[{Y}]",), _p_vs_group(f"eps_growth[{Y}]", "industry_eps_growth"),
          _group_where(f"eps_growth[{Y}]", "industry_eps_growth")),
    Check("p_eps_5y", "past", f"Laba per saham {Y} lebih besar dari {H}",
          (f"eps[{H}]", f"eps[{Y}]"), _p_eps_5y, _const(f"eps[{Y}] > eps[{H}]")),
    Check("p_accel", "past", f"Pertumbuhan laba per saham {Y} lebih cepat dari rata-rata {Y - H} tahun",
          tuple(f"eps_growth[{y}]" for y in range(H + 1, Y + 1)), _p_accel,
          _const(f"eps_growth[{Y}] > (" + " + ".join(f"eps_growth[{y}]" for y in range(H + 1, Y + 1))
                 + f") / {Y - H}")),
    Check("p_roe20", "past", f"ROE {Y} lebih dari 20%: modal pemilik dipakai produktif",
          (f"roe[{Y}]",), _p_roe, _const(f"roe[{Y}] > 0.2")),
    Check("p_roce", "past", f"Imbal hasil modal yang dipakai (ROCE) membaik dibanding {Y0}",
          (f"ebit[{Y0}]", f"ebit[{Y}]", f"total_assets[{Y}]", f"current_liabilities[{Y}]"), _p_roce,
          _const(f"ebit[{Y}] / (total_assets[{Y}] - current_liabilities[{Y}]) > "
                 f"ebit[{Y0}] / (total_assets[{Y0}] - current_liabilities[{Y0}])")),
    Check("p_roa_ind", "past", f"ROA {Y} di atas median kelompoknya",
          (f"roa[{Y}]",), _p_vs_group(f"roa[{Y}]", "industry_roa"), _group_where(f"roa[{Y}]", "industry_roa")),
    # Kesehatan (non-bank)
    Check("h_current", "health", "Aset lancar cukup menutup utang jangka pendek",
          (f"current_ratio[{Y}]",), _h_current, _const(f"current_ratio[{Y}] > 1")),
    Check("h_ca_ncl", "health", "Aset lancar lebih besar dari utang jangka panjang",
          (f"current_assets[{Y}]", f"non_current_liabilities[{Y}]"), _h_ca_vs_ncl,
          _const(f"current_assets[{Y}] > non_current_liabilities[{Y}]")),
    Check("h_der_trend", "health", f"Rasio utang terhadap modal tidak naik sejak {H}",
          (f"debt_to_equity_ratio[{H}]", f"debt_to_equity_ratio[{Y}]"), _h_der_trend,
          _const(f"debt_to_equity_ratio[{Y}] >= 0 and debt_to_equity_ratio[{Y}] <= debt_to_equity_ratio[{H}]"),
          f"Data Sectors mulai ±{H}, jadi pembandingnya {Y - H} tahun."),
    Check("h_der40", "health", "Utang berbunga kurang dari 40% modal sendiri",
          (f"debt_to_equity_ratio[{Y}]",), _h_der_low,
          _const(f"debt_to_equity_ratio[{Y}] >= 0 and debt_to_equity_ratio[{Y}] < 0.4")),
    Check("h_ocf", "health", "Kas dari operasi lebih dari 20% utang berbunga",
          (f"cash_flow_to_debt_ratio[{Y}]", f"total_debt[{Y}]"), _h_ocf_debt,
          _const(f"total_debt[{Y}] = 0 or cash_flow_to_debt_ratio[{Y}] > 0.2")),
    Check("h_interest", "health", "Laba operasi (EBIT) lebih dari 5× beban bunga",
          (f"interest_coverage_ratio[{Y}]",), _h_interest, _const(f"interest_coverage_ratio[{Y}] > 5")),
    # Kesehatan (bank)
    Check("b_npl", "health", "Kredit macet (NPL) di bawah 2% dari total kredit",
          (f"non_performing_loan[{Y}]", f"gross_loan[{Y}]"), _b_npl,
          _const(f"non_performing_loan[{Y}] < gross_loan[{Y}] * 0.02")),
    Check("b_ldr", "health", "Kredit yang disalurkan tidak melebihi 110% dana nasabah (LDR)",
          (f"loan_to_deposit_ratio[{Y}]",), _b_ldr, _const(f"loan_to_deposit_ratio[{Y}] < 1.1")),
    Check("b_lev", "health", "Total aset tidak lebih dari 20× modal sendiri",
          (f"total_assets[{Y}]", f"total_equity[{Y}]"), _b_leverage,
          _const(f"total_assets[{Y}] < total_equity[{Y}] * 20")),
    Check("b_car", "health", "Rasio kecukupan modal (CAR) di atas 8%",
          (f"capital_adequacy_ratio[{Y}]",), _b_car, _const(f"capital_adequacy_ratio[{Y}] > 0.08"),
          "8% adalah batas minimum CAR menurut standar Basel; model asli tidak memakai cek ini."),
    # Dividen
    Check("d_y25", "dividend", "Imbal hasil dividen di atas 25% pembayar dividen terbawah",
          ("yield_ttm",), _d_yield("yield_p25"), _stat("yield_ttm > {}", "yield_p25"),
          "Persentil dihitung dari emiten yang membagi dividen."),
    Check("d_y75", "dividend", "Imbal hasil dividen masuk 25% teratas pembayar dividen",
          ("yield_ttm",), _d_yield("yield_p75"), _stat("yield_ttm > {}", "yield_p75")),
    Check("d_stable", "dividend", f"Dividen per saham tidak pernah turun lebih dari 10% ({H}–{Y})",
          tuple(f"total_dividend[{y}]" for y in range(H, Y + 1)), _d_stable,
          _const(" and ".join([f"total_dividend[{H}] > 0"] + [f"total_dividend[{y}] >= total_dividend[{y - 1}] * 0.9"
                                                            for y in range(H + 1, Y + 1)])),
          f"Model asli melihat 10 tahun; data dividen Sectors mulai ±{H}."),
    Check("d_growth", "dividend", f"Dividen per saham {Y} lebih besar dari {H}",
          (f"total_dividend[{H}]", f"total_dividend[{Y}]"), _d_growth,
          _const(f"total_dividend[{H}] > 0 and total_dividend[{Y}] > total_dividend[{H}]"),
          f"Model asli membandingkan dengan 10 tahun lalu; data Sectors mulai ±{H}."),
    Check("d_payout", "dividend", "Dividen yang dibagi 90% dari laba atau kurang",
          ("payout_ratio",), _d_payout, _const("payout_ratio > 0 and payout_ratio <= 0.9")),
    Check("d_payout_fc", "dividend", f"Dividen terakhir tertutup oleh perkiraan laba {F}",
          (f"total_dividend[{Y}]", f"forecast_eps_estimate[{F}]"), _d_payout_fc,
          _const(f"total_dividend[{Y}] > 0 and total_dividend[{Y}] <= forecast_eps_estimate[{F}] * 0.9"),
          "Sectors tidak punya perkiraan dividen 3 tahun; didekati dengan perkiraan laba tahun depan."),
]
CHECKS_BY_ID = {c.id: c for c in CHECKS}
BANK_ONLY = {"b_npl", "b_ldr", "b_lev", "b_car"}
NON_BANK_HEALTH = {"h_current", "h_ca_ncl", "h_der_trend", "h_der40", "h_ocf", "h_interest"}


def checks_for(rec: Rec) -> list[Check]:
    skip = NON_BANK_HEALTH if is_bank(rec) else BANK_ONLY
    return [c for c in CHECKS if c.id not in skip]


def fields() -> set[str]:
    return {f for c in CHECKS for f in c.fields} | {"sub_sector", "industry", "yield_ttm"}


# ---------------------------------------------------------------- hasil untuk kartu

_CACHE: dict[int, tuple[Stats, dict[str, int]]] = {}


def _universe_stats(records: dict[str, Rec]) -> tuple[Stats, dict[str, int]]:
    key = id(records)
    if key not in _CACHE:
        st = compute_stats(records)
        passes = {c.id: 0 for c in CHECKS}
        for sym, r in records.items():
            for c in checks_for(r):
                if c.test(r, st, sym) is True:
                    passes[c.id] += 1
        _CACHE.clear()
        _CACHE[key] = (st, passes)
    return _CACHE[key]


def evaluate(records: dict[str, Rec], sym: str) -> dict[str, Any]:
    st, passes = _universe_stats(records)
    rec = records[sym]
    bank = is_bank(rec)
    axes = []
    for axis_id, label, blurb in AXES:
        items = []
        for c in (c for c in checks_for(rec) if c.axis == axis_id):
            res = c.test(rec, st, sym)
            items.append({
                "id": c.id, "title": c.title, "result": res, "note": c.note or None,
                "values": [{"field": f, "value": _n(rec, f)} for f in c.fields],
                "where": c.where(st, sym), "market_pass": passes[c.id],
            })
        axes.append({
            "id": axis_id, "label": label, "blurb": blurb, "checks": items,
            "passed": sum(1 for i in items if i["result"] is True),
            "assessed": sum(1 for i in items if i["result"] is not None),
            "total": len(items),
        })
    return {
        "axes": axes,
        "passed": sum(a["passed"] for a in axes),
        "assessed": sum(a["assessed"] for a in axes),
        "total": sum(a["total"] for a in axes),
        "is_bank": bank,
        "pays_dividend": pays_dividend(rec),
        "peer_group": st.peer_key.get(sym),
        "stats": {"market_pe": st.market_pe, "yield_p25": st.yield_p25, "yield_p75": st.yield_p75,
                  "market_eps_growth_fc": st.market_eps_growth_fc, "market_rev_growth_fc": st.market_rev_growth_fc},
        "universe_total": len(records),
    }
