"""Peta endpoint internal IDXMACA → path live Sectors v2 (docs/CREDITS.md).

Internal path adalah bahasa kanonis aplikasi + fixture. Saat mode live, Store
menerjemahkan ke path resmi Sectors (termasuk param yang berbeda nama). Bila
path tidak punya padanan live, terjemahan mengembalikan None dan Store
menolak jalan (fail-closed) — 0 kredit, bukan 404 yang tetap berbiaya 1.
"""
from __future__ import annotations

from typing import Any

from .keys import strip_host

MOVER_TYPE = {"gainers": "top_gainers", "losers": "top_losers", "top_gainers": "top_gainers", "top_losers": "top_losers"}

HELPER_PATHS = {
    "subsectors": "/v2/subsectors/",
    "industries": "/v2/industries/",
    "subindustries": "/v2/subindustries/",
    "tags": "/v2/tags/",
    "companies-list": "/v2/companies/list_companies_with_segments/",
}


def _segments(endpoint: str) -> list[str]:
    raw = strip_host(endpoint).split("?", 1)[0]
    return [s for s in raw.split("/") if s]


def _clean(params: dict[str, Any], drop: tuple[str, ...] = (), keep: tuple[str, ...] | None = None) -> dict[str, Any]:
    out = {k: v for k, v in (params or {}).items() if k not in drop and v not in (None, "", [])}
    if keep is not None:
        out = {k: v for k, v in out.items() if k in keep}
    return out


def _screener_params(p: dict[str, Any]) -> dict[str, Any]:
    out = _clean(p, keep=("q", "where", "order_by", "limit", "offset"))
    sort = p.get("sort")
    field = out.get("order_by") or (str(sort)[1:] if sort else None)
    if sort and not out.get("order_by"):
        out["order_by"] = str(sort)
    if field and not str(out.get("order_by", "")).startswith("-") and p.get("desc") in (True, "true"):
        out["order_by"] = f"-{field}"
    out.pop("desc", None)
    return out


def translate(endpoint: str, params: dict[str, Any] | None) -> tuple[str, dict[str, Any]] | None:
    seg = _segments(endpoint)
    if len(seg) < 2 or seg[0].lower() != "v2":
        return None
    p = dict(params or {})
    head = seg[1].lower()

    if head == "company" and len(seg) >= 3:
        kind = seg[2].lower()
        if kind == "report" and len(seg) >= 4:
            sym = seg[3]
            if len(seg) >= 5 and seg[4].lower() == "quarterly":
                return f"/v2/financials/quarterly/{sym}/", _clean(p, drop=("limit",))
            if len(seg) >= 5 and seg[4].lower() == "quarterly-dates":
                return f"/v2/company/get_quarterly_financial_dates/{sym}/", _clean(p, drop=("limit", "offset"))
            return f"/v2/company/report/{sym}/", _clean(p)
        if kind == "quarterly-dates":
            return "/v2/companies/quarterly-financial-dates/", _clean(p, keep=("since", "year", "limit", "offset"))
        if kind == "daily" and len(seg) >= 4:
            return f"/v2/daily/{seg[3]}/", _clean(p, keep=("start", "end"))
        if kind == "corporate-actions" and len(seg) >= 4:
            return f"/v2/company/corporate-actions/{seg[3]}/", _clean(p)
        if kind == "shareholders-composition" and len(seg) >= 4:
            return f"/v2/company/shareholders-composition/{seg[3]}/", _clean(p)
        if kind == "get-segments" and len(seg) >= 4:
            return f"/v2/company/get-segments/{seg[3]}/", _clean(p)
        return None

    if head == "companies":
        if len(seg) == 2:
            return "/v2/companies/", _screener_params(p)
        if len(seg) == 3 and seg[2].lower() == "free-float":
            return "/v2/free-float/", _clean(p, keep=("sector", "sub_sector", "industry", "sub_industry"))
        if len(seg) == 3 and seg[2].lower() == "top-ranked":
            order_by = p.get("metric") or "market_cap"
            return "/v2/companies/", {"order_by": order_by, "desc": True, "limit": int(p.get("limit") or 25)}
        if len(seg) == 3 and seg[2].lower() == "top-growth":
            order_by = p.get("metric") or "earnings_growth_yoy"
            return "/v2/companies/", {"order_by": order_by, "desc": True, "limit": int(p.get("limit") or 25)}
        if len(seg) >= 4 and seg[2].lower() == "shareholders":
            return f"/v2/company/shareholders-composition/{seg[3]}/", _clean(p)
        if len(seg) >= 4 and seg[2].lower() == "segments":
            return f"/v2/company/get-segments/{seg[3]}/", _clean(p)
        if len(seg) >= 4 and seg[2].lower() == "daily":
            return f"/v2/daily/{seg[3]}/", _clean(p, keep=("start", "end"))
        return None

    if head == "universe" and len(seg) >= 3 and seg[2].lower() == "close":
        return "/v2/close/", _clean(p, keep=("date", "limit", "offset"))

    if head == "index" and len(seg) >= 3 and seg[2].lower() == "daily":
        code = str(p.get("symbol") or (seg[3] if len(seg) >= 4 else "IHSG")).lower()
        return f"/v2/index-daily/{code}/", _clean(p, drop=("symbol",), keep=("start", "end"))

    if head == "idx" and len(seg) >= 3 and seg[2].lower() in ("market-cap", "total"):
        return "/v2/idx-total/", _clean(p, keep=("start", "end"))

    if head == "movers" and len(seg) >= 3:
        if seg[2].lower() == "most-traded":
            live = _clean(p, keep=("start", "end", "sub_sector"))
            live["n_stock"] = int(p.get("limit") or 10)
            return "/v2/most-traded/", live
        if seg[2].lower() == "top":
            live = _clean(p, drop=("type", "period", "limit"))
            live["classifications"] = MOVER_TYPE.get(str(p.get("type", "gainers")).lower(), "top_gainers")
            live["periods"] = str(p.get("period", "1d"))
            live["n_stock"] = int(p.get("limit") or 10)
            return "/v2/companies/top-changes/", live
        return None

    if head == "broker" and len(seg) >= 3:
        kind = seg[2].lower()
        if kind == "summary" and len(seg) >= 4:
            if len(seg) >= 5 and seg[4].lower() == "top":
                return f"/v2/broker-summary/{seg[3]}/top/", _clean(p, keep=("start", "end", "n_brokers", "origin", "cohort", "foreign"))
            return f"/v2/broker-summary/{seg[3]}/", _clean(p, keep=("start", "end"))
        if kind in ("top-buyers", "top-sellers") and len(seg) >= 4:
            return f"/v2/broker-summary/{seg[3]}/top/", _clean(p, keep=("start", "end", "n_brokers"))
        if kind == "registry":
            return "/v2/brokers/", _clean(p)
        if kind == "top":
            return "/v2/brokers/top/", _clean(p, keep=("date", "limit"))
        if kind == "activity" and len(seg) >= 4:
            return f"/v2/broker-activity/{seg[3]}/", _clean(p, keep=("start", "end"))
        return None

    if head == "foreign-flow":
        if len(seg) >= 3:
            return f"/v2/foreign-flow/{seg[2]}/", _clean(p, keep=("start", "end"))
        return "/v2/foreign-flow/", _clean(p, keep=("start", "end", "limit", "offset"))

    if head == "corporate-actions":
        if len(seg) >= 3 and seg[2].lower() == "calendar":
            types = p.get("types") or p.get("type")
            live = _clean(p, keep=("start", "end"))
            if types:
                live["type"] = types if isinstance(types, list) else [types]
            return "/v2/corporate-actions/", live
        if len(seg) >= 3:
            return f"/v2/company/corporate-actions/{seg[2]}/", _clean(p, keep=("start", "end"))
        return None

    if head == "filings" and len(seg) >= 3:
        live = _clean(p, keep=("start", "end", "limit", "offset", "transaction_type", "holder_type", "tags"))
        live["symbol"] = seg[2]
        return "/v2/filings/", live

    if head == "suspensions" and len(seg) >= 3:
        live = _clean(p, keep=("start", "end", "limit", "offset"))
        live["symbol"] = seg[2]
        return "/v2/suspensions/", live

    if head == "news" and len(seg) >= 3:
        live = _clean(p, keep=("start", "end", "limit", "offset"))
        live["symbols"] = seg[2]
        return "/v2/news/", live

    if head == "subsector" and len(seg) >= 4 and seg[2].lower() == "report":
        return f"/v2/subsector/report/{seg[3]}/", _clean(p, keep=("sections", "start", "end"))

    if head == "helpers" and len(seg) >= 3:
        target = HELPER_PATHS.get(seg[2].lower())
        return (target, _clean(p, keep=("sector", "sub_sector"))) if target else None

    if head == "commodities":
        return "/v2/mining/commodities/", _clean(p)

    if head == "mining" and len(seg) >= 3 and seg[2].lower() == "auctions":
        return "/v2/mining/license-auctions/", _clean(p, keep=("province", "commodity_type", "status", "area_type", "limit", "offset"))

    if head in ("sgx", "klse"):
        if len(seg) >= 4 and seg[2].lower() == "company" and seg[3].lower() == "report" and len(seg) >= 5:
            return f"/v2/{head}/company/report/{seg[4]}/", _clean(p)
        if len(seg) >= 3 and seg[2].lower() in ("short-sell", "buybacks", "filings", "news", "sectors", "subsectors", "tags", "close"):
            return f"/v2/{head}/{seg[2].lower()}/", _clean(p, keep=("start", "end", "limit", "offset", "date"))
        if len(seg) >= 3 and seg[2].lower() == "companies" and len(seg) == 3:
            return f"/v2/{head}/companies/", _clean(p, keep=("q", "where", "order_by", "desc", "limit", "offset"))
        if len(seg) >= 4 and seg[2].lower() == "companies" and seg[3].lower() == "top":
            return f"/v2/{head}/companies/top/", _clean(p, keep=("classifications", "n_stock"))
        return None

    return None