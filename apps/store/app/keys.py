"""Kunci kanonis STORE.md §3 + clamp rentang (§3, §7).

cache_key = SHA256(METHOD + "|" + path_norm + "|" + params_norm)
Clamp dilakukan SEBELUM lookup agar request invalid tidak pernah jadi key sampah.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from typing import Any

PATH_KEYWORDS = {
    "v1", "v2", "company", "companies", "report", "quarterly", "quarterly-dates", "daily",
    "index", "universe", "close", "idx", "market-cap", "movers", "top", "most-traded",
    "broker", "summary", "buyers", "sellers", "top-buyers", "top-sellers", "top-ranked", "top-growth",
    "activity", "registry", "foreign-flow",
    "corporate-actions", "calendar", "filings", "suspensions", "news", "subsector",
    "subsectors", "industries", "subindustries", "tags", "mining", "sites", "production",
    "resources", "reserves", "licenses", "auctions", "commodities", "exports",
    "sales-destination", "contracts", "ownership", "financials", "performance", "sgx",
    "klse", "ipo", "helpers", "info", "stats", "health", "ranked", "growth", "segments", "short-sell", "buybacks", "companies-list",
    "shareholders", "affiliates", "free-float", "detail", "prices", "trade", "global",
}

# Batas rentang per jenis endpoint (STORE.md §3): broker ≤14 hari, IDX daily/idx ≤90 hari.
RANGE_LIMITS_DAYS = {
    "broker": 14,
    "foreign": 14,
    "corporate": 90,
    "filings": 365,
    "news": 90,
}
IDX_RANGE_LIMIT_DAYS = 90

SYMBOL_PARAM_KEYS = {"symbol", "symbols", "code", "broker", "ticker", "slug"}


def strip_host(endpoint: str) -> str:
    e = endpoint.strip()
    if "://" in e:
        e = e.split("://", 1)[1]
        e = e.split("/", 1)[1] if "/" in e else ""
    if not e.startswith("/"):
        e = "/" + e
    return e


def normalize_path(endpoint: str) -> str:
    parts = [p for p in strip_host(endpoint).lower().split("/") if p]
    out = []
    for p in parts:
        if p in PATH_KEYWORDS:
            out.append(p)
        elif p.replace("-", "").isalnum():
            out.append(p.upper())
        else:
            out.append(p)
    return "/" + "/".join(out)


def _norm_value(v: Any) -> Any:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        if s.lower() in ("true", "false"):
            return s.lower() == "true"
        if s.isdigit():
            return int(s)
        return s
    if isinstance(v, list):
        items = [_norm_value(x) for x in v]
        items = sorted([x for x in items if x is not None], key=lambda x: str(x))
        return items or None
    if isinstance(v, dict):
        return {k: _norm_value(x) for k, x in sorted(v.items()) if _norm_value(x) is not None}
    return v


def normalize_params(params: dict[str, Any] | None) -> dict[str, Any]:
    params = params or {}
    out: dict[str, Any] = {}
    for k, v in params.items():
        key = k.strip()
        value = _norm_value(v)
        if value is None:
            continue
        if key in SYMBOL_PARAM_KEYS:
            if isinstance(value, list):
                value = sorted(str(x).upper() for x in value)
            else:
                value = str(value).upper()
        if key == "sections" and isinstance(value, list):
            value = sorted(str(x).lower() for x in value)
        if key in ("q", "query"):
            value = str(value).strip()
        out[key] = value
    return {k: out[k] for k in sorted(out)}


def _as_date(v: Any) -> date | None:
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, str):
        try:
            return date.fromisoformat(v.strip()[:10])
        except ValueError:
            return None
    return None


def clamp_params(endpoint: str, params: dict[str, Any], today: date | None = None) -> tuple[dict[str, Any], list[str], str | None]:
    """Kembalikan (params_ter-clamp, warnings, error). error = request invalid (400, gratis)."""
    today = today or date.today()
    path = normalize_path(endpoint)
    p = dict(normalize_params(params))
    warnings: list[str] = []
    start, end = _as_date(p.get("start")), _as_date(p.get("end"))
    if end is None and "end" in p:
        return p, warnings, f"end tidak valid: {p['end']!r}"
    if start is None and "start" in p:
        return p, warnings, f"start tidak valid: {p['start']!r}"
    limit_days = IDX_RANGE_LIMIT_DAYS
    if any(seg in path for seg in ("/broker/", "/foreign-flow")) or "broker" in path:
        limit_days = RANGE_LIMITS_DAYS["broker"]
    elif "/corporate-actions" in path or "/suspensions" in path:
        limit_days = RANGE_LIMITS_DAYS["corporate"]
    elif "/filings" in path:
        limit_days = RANGE_LIMITS_DAYS["filings"]
    elif "/news" in path:
        limit_days = RANGE_LIMITS_DAYS["news"]
    if start and end and start > end:
        return p, warnings, "start > end"
    if start and (today - start).days > limit_days:
        new_start = today - timedelta(days=limit_days)
        p["start"] = new_start.isoformat()
        warnings.append(f"start di-clamp dari {start.isoformat()} ke {new_start.isoformat()} (batas {limit_days} hari)")
        start = new_start
    if start and start > today:
        return p, warnings, "start di masa depan"
    if end and (today - end).days > limit_days:
        new_end = today - timedelta(days=limit_days)
        p["end"] = new_end.isoformat()
        warnings.append(f"end di-clamp dari {end.isoformat()} ke {new_end.isoformat()} (batas {limit_days} hari)")
    return p, warnings, None


def canonical_key(endpoint: str, params: dict[str, Any] | None, method: str = "GET") -> str:
    path = normalize_path(endpoint)
    norm = normalize_params(params)
    payload = f"{method.upper()}|{path}|{json.dumps(norm, sort_keys=True, separators=(',', ':'))}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_public(endpoint: str, params: dict[str, Any] | None, method: str = "GET") -> dict[str, Any]:
    return {"method": method.upper(), "path": normalize_path(endpoint), "params": normalize_params(params)}


def _as_count(value: Any, fallback: int) -> int:
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)) and value > 0:
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if s.isdigit():
            return int(s)
        if "," in s:
            return len([x for x in s.split(",") if x.strip()])
    if isinstance(value, list) and value:
        return len(value)
    return fallback


def _ceil_div(a: int, b: int) -> int:
    return max(1, -(-int(a) // int(b)))


def _rows_in(body: Any, keys: tuple[str, ...]) -> int:
    """Hitung baris respons untuk biaya yang bergantung data (kuartal, halaman, per 100)."""
    if body is None:
        return 0
    if isinstance(body, (bytes, bytearray)):
        body = body.decode("utf-8", "ignore")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            return 0
    if not isinstance(body, dict):
        return 0
    for k in keys:
        v = body.get(k)
        if isinstance(v, list):
            return len(v)
        if isinstance(v, dict):
            return len(v)
    return 0


def _segments(path: str) -> list[str]:
    return [s for s in path.split("/") if s]


def credit_cost(endpoint: str, params: dict[str, Any] | None = None, http_status: int = 200, body: Any = None) -> int:
    """Biaya kredit Sectors per panggilan — tabel resmi docs v2 (lihat docs/CREDITS.md).

    status: 2xx/404 = biaya penuh; 400/401/403/429/5xx = 0, kecuali 400 screener `?q=`
    yang sudah terlanjur mengirim query ke LLM (sunk cost) = 1.
    """
    path = normalize_path(endpoint)
    seg = _segments(path)
    p = normalize_params(params)
    if http_status == 404:
        return 1
    if 400 <= http_status < 500:
        if http_status == 400 and seg and seg[-1] == "companies" and p.get("q"):
            return 1
        return 0
    if http_status >= 500:
        return 0

    tail = seg[-1] if seg else ""
    # Screener (termasuk SGX/KLSE): structured 1, natural-language q= 3.
    if tail == "companies":
        return 1 if "mining" in seg else (3 if p.get("q") else 1)
    # Company report: 1 per section (default 8 pada IDX, 4 pada SGX/KLSE).
    if "report" in seg and ("sgx" in seg or "klse" in seg):
        return _as_count(p.get("sections"), 4)
    if "company" in seg and "report" in seg and "quarterly" not in seg and "quarterly-dates" not in seg:
        return _as_count(p.get("sections"), 8)
    # Quarterly financials: 1 per kuartal yang dikembalikan.
    if "quarterly" in seg:
        return _as_count(p.get("n_quarters"), _rows_in(body, ("quarterly", "financials", "quarters")) or 8)
    # Quarterly financial dates: universe 1 per halaman, per emiten 1.
    if "quarterly-dates" in seg:
        return 1 if "report" in seg else _ceil_div(_as_count(p.get("limit"), 30), 30)
    if "quarterly-financial-dates" in path.lower():
        return _ceil_div(_as_count(p.get("limit"), 30), 30)
    # Close/universe: 1 per halaman (maks limit 30 per halaman).
    if tail == "close" or "universe" in seg:
        return _ceil_div(_as_count(p.get("limit"), 960), 30)
    # Free float: 1 per 100 emiten.
    if "free-float" in seg:
        return _ceil_div(_rows_in(body, ("companies",)) or _as_count(p.get("limit"), 100), 100)
    # Ranking berbasis kombinasi klasifikasi × periode.
    if "top-changes" in seg or (len(seg) >= 2 and seg[-2] == "movers" and tail == "top"):
        cls = p.get("classifications") or p.get("type")
        pers = p.get("periods") or p.get("period")
        n_cls = len(cls) if isinstance(cls, list) and cls else (1 if cls else 2)
        n_per = len(pers) if isinstance(pers, list) and pers else (1 if pers else 5)
        return max(1, n_cls * n_per)
    if tail == "most-traded":
        return 2
    # Broker: top endpoints 2 kredit, sisanya 1.
    if "broker" in seg or "broker-summary" in seg or "broker-activity" in seg:
        if tail == "top" or (len(seg) >= 2 and seg[-2] in ("top-buyers", "top-sellers")):
            return 2
        return 1
    # Foreign flow: per emiten 1, universe 1 per halaman.
    if "foreign-flow" in seg:
        syms = p.get("symbols") or p.get("symbol")
        if syms:
            return _as_count(syms, 1)
        if len(seg) > 2 and seg[2] != "v2":
            return 1
        return _ceil_div(_as_count(p.get("limit"), 750), 30)
    # Kalender aksi korporasi: 1 per tipe yang diminta (default 7).
    if "corporate-actions" in seg and "calendar" in seg:
        return _as_count(p.get("types") or p.get("type"), 7)
    # Laporan per sektor/regional: 1 per section (default 6 / 4).
    if "subsector" in seg and "report" in seg:
        return _as_count(p.get("sections"), 6)
    if ("sgx" in seg or "klse" in seg) and "report" in seg:
        return _as_count(p.get("sections"), 4)
    if ("sgx" in seg or "klse" in seg) and tail == "top":
        return _as_count(p.get("classifications"), 5)
    return 1