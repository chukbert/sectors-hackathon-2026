"""Normalisasi respons live Sectors v2 -> bentuk kanonis internal IDXMACA.

Fixture memakai bahasa data internal (mis. `sections`, `daily`, `companies`, net asing
yang sudah dinormalisasi). Respons live punya bentuk sendiri (section di top-level,
array telanjang, keyed-by-date, dst). Semua respons 2xx live dinormalisasi di sini
SEBELUM di-cache, sehingga core/panel tidak perlu tahu perbedaan bentuk.
"""
from __future__ import annotations

import copy
from typing import Any

from .keys import strip_host

SECTION_KEYS = {
    "overview", "valuation", "financials", "dividend", "future", "peers",
    "management", "ownership", "segments", "affiliates", "performance",
}
BARS_KEYS = ("data", "daily", "rows", "results", "prices")


def _sym(value: Any) -> str | None:
    if value is None:
        return None
    return str(value).split(".")[0].strip().upper() or None


def _num(value: Any) -> float | None:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _pct_from_decimal(value: Any) -> float | None:
    v = _num(value)
    if v is None:
        return None
    return round(v * 100, 4) if abs(v) <= 1.5 else v


def _first(row: dict, keys: tuple[str, ...]) -> Any:
    for k in keys:
        if row.get(k) is not None:
            return row[k]
    return None


def _bars(body: Any) -> list[dict]:
    rows: Any = []
    if isinstance(body, list):
        rows = body
    elif isinstance(body, dict):
        for k in BARS_KEYS:
            if isinstance(body.get(k), list):
                rows = body[k]
                break
        else:
            date_like = [k for k in body if isinstance(k, str) and len(k) == 10 and k[4] == "-"]
            if date_like:
                rows = [item for k in sorted(date_like) for item in (body[k] if isinstance(body[k], list) else [])]
    out = []
    for r in rows:
        if isinstance(r, list):
            r = {"symbol": r[0] if r else None, "close": r[1] if len(r) > 1 else None, "volume": r[2] if len(r) > 2 else None}
        if not isinstance(r, dict):
            continue
        close = _num(_first(r, ("close", "last_close_price", "level", "index_close", "value", "index_value")))
        out.append({
            "date": _first(r, ("date", "latest_close_date", "period")),
            "close": close,
            "volume": _num(r.get("volume")),
            "market_cap": _num(r.get("market_cap")),
        })
    return [x for x in out if x["date"]]


def _unwrap(value: Any) -> Any:
    """Live kadang membungkus skalar sebagai {tanggal: nilai} atau [nilai]."""
    if isinstance(value, dict):
        for v in value.values():
            v2 = _unwrap(v)
            if v2 is not None:
                return v2
        return None
    if isinstance(value, list):
        for v in value:
            v2 = _unwrap(v)
            if v2 is not None:
                return v2
        return None
    return value


def _pick(obj: Any, *keys: str) -> Any:
    if not isinstance(obj, dict):
        return None
    for k in keys:
        v = _unwrap(obj.get(k))
        if v is not None:
            return v
    return None


def _normalize_report(path: str, body: Any) -> Any:
    if not isinstance(body, dict):
        return body
    data = copy.deepcopy(body)
    sections = data.get("sections")
    if not isinstance(sections, dict):
        sections = {k: data[k] for k in list(data.keys()) if k in SECTION_KEYS}
    for k in list(data.keys()):
        if k in SECTION_KEYS and k not in ("sections",):
            data.pop(k, None)
    ov = sections.get("overview")
    if isinstance(ov, dict):
        ov = dict(ov)
        if ov.get("close") is None:
            ov["close"] = _num(ov.get("last_close_price"))
        if ov.get("change_pct") is None:
            ov["change_pct"] = _pct_from_decimal(ov.get("daily_close_change"))
        atp = ov.get("all_time_price")
        if ov.get("52w_low") is None:
            ov["52w_low"] = _num(_pick(atp, "52_w_low", "52w_low", "low_52w")) or _num(_first(ov, ("52_w_low", "week52_low", "low_52w")))
        if ov.get("52w_high") is None:
            ov["52w_high"] = _num(_pick(atp, "52_w_high", "52w_high", "high_52w")) or _num(_first(ov, ("52_w_high", "week52_high", "high_52w")))
        sections["overview"] = ov
    data["sections"] = sections
    data["symbol"] = _sym(data.get("symbol")) or data.get("symbol")
    return data


def _normalize_movers(params: dict, body: Any) -> Any:
    if not isinstance(body, dict):
        return body
    want = "top_losers" if str(params.get("type", "gainers")).lower() in ("losers", "top_losers") else "top_gainers"
    period = str(params.get("period", "1d"))
    block = body.get(want) or body.get("movers") or {}
    rows = []
    if isinstance(block, dict):
        rows = block.get(period) or next((v for v in block.values() if isinstance(v, list)), [])
    elif isinstance(block, list):
        rows = block
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        out.append({
            "symbol": _sym(r.get("symbol")),
            "name": r.get("name") or r.get("company_name"),
            "change_pct": _pct_from_decimal(_first(r, ("price_change", "change", "change_pct"))),
            "price": _num(_first(r, ("last_close_price", "price", "close"))),
            "date": _first(r, ("latest_close_date", "date")),
        })
    return {"period": period, "type": "losers" if "losers" in want else "gainers", "movers": out}


def _normalize_most_traded(body: Any) -> Any:
    rows: Any = []
    if isinstance(body, list):
        rows = body
    elif isinstance(body, dict):
        if isinstance(body.get("most_traded"), list):
            rows = body["most_traded"]
        elif isinstance(body.get("most_traded"), dict):
            keyed = body["most_traded"]
            latest = max(keyed) if keyed else None
            rows = keyed.get(latest, []) if latest else []
        else:
            date_like = [k for k in body if isinstance(k, str) and len(k) == 10 and k[4] == "-"]
            if date_like:
                latest = max(date_like)
                rows = body[latest]
    out = []
    for r in rows if isinstance(rows, list) else []:
        if isinstance(r, list):
            r = {"symbol": r[0] if r else None, "name": r[1] if len(r) > 1 else None,
                 "volume": r[2] if len(r) > 2 else None, "value": r[3] if len(r) > 3 else None,
                 "market_cap": r[4] if len(r) > 4 else None}
        if not isinstance(r, dict):
            continue
        out.append({
            "symbol": _sym(r.get("symbol")),
            "name": r.get("name") or r.get("company_name"),
            "volume": _num(r.get("volume")),
            "value": _num(r.get("value")),
            "market_cap": _num(r.get("market_cap")),
        })
    return {"most_traded": out}


def _normalize_foreign(params: dict, path: str, body: Any) -> Any:
    if not isinstance(body, dict):
        return body
    seg = [s for s in strip_host(path).split("?")[0].split("/") if s]
    sym = _sym(body.get("symbol")) or (_sym(seg[2]) if len(seg) >= 3 else None)
    rows = []
    for r in body.get("data") or body.get("rows") or []:
        if not isinstance(r, dict):
            continue
        rows.append({
            "date": r.get("date"),
            "net": _num(_first(r, ("net_foreign_inflow", "net", "net_buy"))),
            "buy": _num(_first(r, ("foreign_buy_idr", "buy"))),
            "sell": _num(_first(r, ("foreign_sell_idr", "sell"))),
            "foreign_pct": _num(r.get("foreign_share")),
        })
    out: dict[str, Any] = {"per_symbol": {sym: rows} if sym else {}, "symbols": [sym] if sym else [],
                           "start": body.get("start"), "end": body.get("end")}
    return out


def _normalize_screener(body: Any) -> Any:
    if isinstance(body, list):
        rows = body
    elif isinstance(body, dict):
        rows = body.get("data") or body.get("companies") or body.get("results") or []
    else:
        rows = []
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        row = dict(r)
        row["symbol"] = _sym(row.get("symbol"))
        if not row.get("name"):
            row["name"] = row.get("company_name")
        if row.get("price") is None:
            row["price"] = _num(row.get("last_close_price"))
        if row.get("change_pct_1d") is None:
            row["change_pct_1d"] = _pct_from_decimal(row.get("daily_close_change"))
        if row.get("pe") is None:
            row["pe"] = _num(_first(row, ("pe_ttm", "forward_pe")))
        if row.get("pb") is None:
            row["pb"] = _num(row.get("pb_mrq"))
        if row.get("der") is None:
            row["der"] = _num(row.get("der_mrq"))
        if row.get("roe") is None:
            row["roe"] = _num(row.get("roe_ttm"))
        if row.get("dividend_yield") is None:
            row["dividend_yield"] = _num(_first(row, ("yield_ttm", "dividend_yield_ttm")))
        if row.get("earnings_growth_yoy") is None:
            row["earnings_growth_yoy"] = _num(_first(row, ("yoy_quarter_earnings_growth", "earnings_growth_yoy")))
        if row.get("revenue_growth_yoy") is None:
            row["revenue_growth_yoy"] = _num(row.get("yoy_quarter_revenue_growth"))
        out.append(row)
    total = body.get("total") if isinstance(body, dict) else None
    return {"companies": out, "total": total if total is not None else len(out)}


def normalize(endpoint: str, params: dict[str, Any] | None, body: Any) -> Any:
    """Kembalikan body kanonis bila endpoint dikenali; selain itu body apa adanya."""
    seg = [s.lower() for s in strip_host(endpoint).split("?")[0].split("/") if s]
    p = params or {}
    if len(seg) < 2 or seg[0] != "v2":
        return body
    head = seg[1]
    if head == "company" and len(seg) >= 3:
        kind = seg[2]
        if kind == "report" and len(seg) >= 4:
            if len(seg) >= 5:
                return body
            return _normalize_report(endpoint, body)
        if kind == "daily" and len(seg) >= 4:
            sym = _sym(seg[3])
            return {"symbol": sym, "daily": _bars(body)}
        if kind == "report" and "quarterly-dates" in seg:
            return body
        if kind == "quarterly-dates":
            return body
    if head == "companies":
        if len(seg) == 2 or (len(seg) == 3 and seg[2] not in ("top-ranked", "top-growth", "free-float", "top-changes")):
            return _normalize_screener(body)
        if len(seg) >= 4 and seg[2] == "daily":
            return {"symbol": _sym(seg[3]), "daily": _bars(body)}
    if head == "universe" and "close" in seg:
        return _bars(body)
    if head == "index" and "daily" in seg:
        code = _sym(p.get("symbol")) or (_sym(seg[3]) if len(seg) >= 4 else "IHSG")
        return {"symbol": code, "daily": _bars(body)}
    if head == "movers":
        if "most-traded" in seg:
            return _normalize_most_traded(body)
        return _normalize_movers(p, body)
    if head == "foreign-flow":
        return _normalize_foreign(p, endpoint, body)
    return body