"""Matriks fundamental seluruh bursa dari Screener Sectors (1 kredit / 200 emiten).

Trik inti: Screener mengembalikan `query_values` berisi nilai SETIAP field yang dirujuk di
`where`/`order_by` (tervalidasi 2026-10-06, fixtures/validation/). Dengan `where` berisi
`symbol like '%'` ditambah OR untuk tiap field, satu panggilan = 200 baris × semua field.
"""
from __future__ import annotations

from typing import Any

SCREENER = "/sectors/v2/companies/"
PAGE = 200
# Tahun buku terbaru yang lengkap di Sectors per Oktober 2026 (laporan tahunan 2025).
YEARS = [2022, 2023, 2024, 2025]
LATEST = YEARS[-1]

# Field per grup; grup dipisah supaya `where` tidak terlalu panjang.
PROFILE_FIELDS = [
    "sector", "sub_sector", "industry", "listing_board", "listing_date", "employee_num",
    "market_cap", "market_cap_rank", "last_close_price", "free_float", "yield_ttm", "payout_ratio",
    "pe_ttm", "pb_mrq", "affiliates", "major_shareholders_share_percentage",
]
FIN_FIELDS = (
    [f"revenue[{y}]" for y in YEARS]
    + [f"earnings[{y}]" for y in YEARS]
    + [f"net_profit_margin[{y}]" for y in (LATEST - 1, LATEST)]
    + [f"{f}[{LATEST}]" for f in ("gross_profit", "operating_cash_flow", "total_debt", "total_equity",
                                   "total_assets", "total_dividend", "roe")]
)
GROUPS = {"profile": PROFILE_FIELDS, "fin": FIN_FIELDS}

_STRING_FIELDS = {"sector", "sub_sector", "industry", "listing_board", "listing_date"}


def _ref(field: str) -> str:
    """Klausa yang merujuk field tanpa menyaring baris (dipakai di dalam OR)."""
    if field == "listing_date":
        return "listing_date > '1900-01-01'"  # like '%' ditolak: INVALID_DATE_FORMAT (400, gratis)
    if field in _STRING_FIELDS:
        return f"{field} like '%'"
    if field == "affiliates":
        return "affiliates in ['Salim']"
    if field == "major_shareholders_share_percentage":
        return "major_shareholders_share_percentage > 0"
    return f"{field} > -1000000000000000000"


def matrix_where(group: str) -> str:
    # `symbol like '%'` lebih dulu → setiap emiten lolos; field lain hanya agar nilainya ikut di query_values.
    return " or ".join(["symbol like '%'"] + [_ref(f) for f in GROUPS[group]])


def matrix_params(group: str, offset: int) -> dict[str, Any]:
    return {"where": matrix_where(group), "order_by": "symbol", "limit": PAGE, "offset": offset,
            "include_query_values": "true"}


def bare(symbol: str) -> str:
    return symbol.upper().removesuffix(".JK")


def merge_pages(pages: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Gabung respons screener (beberapa grup × halaman) → {SYMBOL: {field: nilai, company_name}}."""
    out: dict[str, dict[str, Any]] = {}
    for body in pages:
        for row in (body or {}).get("results") or []:
            sym = bare(str(row.get("symbol", "")))
            if not sym:
                continue
            rec = out.setdefault(sym, {"symbol": sym})
            if row.get("company_name"):
                rec["company_name"] = row["company_name"]
            for k, v in (row.get("query_values") or {}).items():
                if k != "symbol":
                    rec[k] = v
    return out
