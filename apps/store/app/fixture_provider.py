"""Fixture provider — menjawab endpoint Sectors dari fixtures/sectors/*.json (mode dev/demo, nol kredit).

Bentuk respons dijaga identik dengan yang diharapkan compute core.
"""
from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

from .config import SETTINGS
from .keys import normalize_path, normalize_params

FIXTURES = Path(SETTINGS.fixtures_dir)


@lru_cache(maxsize=32)
def _load(name: str) -> Any:
    path = FIXTURES / name
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _reports() -> dict:
    return _load("company_reports.json")


def _quarterly() -> dict:
    return _load("quarterly.json")


def _daily() -> dict:
    return _load("daily.json")


def _market() -> dict:
    return _load("market.json")


def _screener() -> dict:
    return _load("screener.json")


def _flow() -> dict:
    return _load("flow.json")


def _events() -> dict:
    return _load("events.json")


def _mining() -> dict:
    return _load("mining.json")


def _regional() -> dict:
    return _load("regional.json")


def _helpers() -> dict:
    return _load("helpers.json")


def _meta() -> dict:
    return _load("meta.json")


def _as_list(v: Any) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v]
    return [x.strip() for x in str(v).split(",") if x.strip()]


def _slice_series(rows: list[dict], params: dict, date_key: str = "date") -> list[dict]:
    start, end = params.get("start"), params.get("end")
    out = rows
    if start:
        out = [r for r in out if r.get(date_key, "") >= str(start)]
    if end:
        out = [r for r in out if r.get(date_key, "") <= str(end)]
    limit = params.get("limit")
    if limit:
        out = out[-int(limit):]
    return out


def _company_row(sym: str) -> dict | None:
    for row in _screener().get("companies", []):
        if row["symbol"] == sym:
            return row
    return None


def _apply_where(rows: list[dict], where: Any) -> list[dict]:
    if not where:
        return rows
    if isinstance(where, str):
        try:
            where = json.loads(where)
        except json.JSONDecodeError:
            return rows
    conditions = where.get("and", [where]) if isinstance(where, dict) else where
    out = rows
    for cond in conditions:
        if not isinstance(cond, dict):
            continue
        for field, spec in cond.items():
            if field in ("and", "or"):
                continue
            if isinstance(spec, dict):
                op, value = next(iter(spec.items())) if spec else ("eq", None)
            else:
                op, value = "eq", spec
            op = op.lower()

            def match(r: dict) -> bool:
                v = r.get(field)
                if v is None:
                    return False
                try:
                    if op in ("gt", ">"):
                        return float(v) > float(value)
                    if op in ("gte", ">="):
                        return float(v) >= float(value)
                    if op in ("lt", "<"):
                        return float(v) < float(value)
                    if op in ("lte", "<="):
                        return float(v) <= float(value)
                    if op in ("eq", "="):
                        return str(v).lower() == str(value).lower() if isinstance(v, str) else float(v) == float(value)
                    if op in ("neq", "!="):
                        return str(v).lower() != str(value).lower()
                    if op == "between" and isinstance(value, list) and len(value) == 2:
                        return float(value[0]) <= float(v) <= float(value[1])
                    if op == "in" and isinstance(value, list):
                        return str(v).lower() in [str(x).lower() for x in value]
                    if op == "contains":
                        return str(value).lower() in str(v).lower()
                except (TypeError, ValueError):
                    return False
                return False

            out = [r for r in out if match(r)]
    return out


def _sort_rows(rows: list[dict], sort: Any, order: Any = None) -> list[dict]:
    field, desc = None, False
    if isinstance(sort, str) and sort:
        field = sort[1:] if sort.startswith("-") else sort
        desc = sort.startswith("-")
        if order:
            desc = str(order).lower() == "desc" and not sort.startswith("-")
    elif isinstance(sort, dict):
        field = sort.get("field")
        desc = str(sort.get("order", "desc")).lower() == "desc"
    if not field:
        return rows
    return sorted(rows, key=lambda r: (r.get(field) is None, r.get(field)), reverse=desc)


# ---------------------------------------------------------------- handlers
def _h_company_report(seg: list[str], params: dict) -> tuple[int, Any] | None:
    sym = seg[3]
    rep = _reports().get(sym)
    if rep is None:
        return 404, {"error": "symbol_not_found", "symbol": sym, "detail": f"symbol {sym} tidak ada di fixtures"}
    sections = _as_list(params.get("sections")) or ["overview", "valuation", "financials", "dividend", "future", "management", "ownership", "segments", "peers"]
    out = {}
    for sec in sections:
        if sec in rep:
            out[sec] = rep[sec]
        elif sec == "peers":
            out["peers"] = rep.get("peers", [])
    return 200, {"symbol": sym, "name": rep["overview"].get("description", ""), "sections": out, "source_fixture": True}


def _h_quarterly(seg: list[str], params: dict) -> tuple[int, Any] | None:
    sym = seg[3]
    rows = _quarterly().get(sym)
    if rows is None:
        return 404, {"error": "symbol_not_found", "symbol": sym}
    n = params.get("n_quarters")
    if n and not params.get("limit"):
        params = {**params, "limit": int(n)}
    out = _slice_series(rows, params, date_key="period")
    return 200, {"symbol": sym, "quarterly": out, "count": len(out)}


def _h_quarterly_dates(seg: list[str], params: dict) -> tuple[int, Any] | None:
    if len(seg) > 3:
        sym = seg[3]
        rows = [r for r in _screener().get("latest_quarterly_dates", []) if r["symbol"] == sym]
        if not rows:
            return 404, {"error": "symbol_not_found", "symbol": sym}
        return 200, {"symbol": sym, "dates": [{"period": r["period"], "report_date": r["report_date"]} for r in rows]}
    rows = _screener().get("latest_quarterly_dates", [])
    return 200, {"companies": rows, "latest_period": rows[0]["period"] if rows else None}


def _h_companies(seg: list[str], params: dict) -> tuple[int, Any] | None:
    base = seg[2] if len(seg) > 2 else ""
    rows = list(_screener().get("companies", []))
    if base in ("top-ranked", "ranked"):
        metric = params.get("metric", "market_cap")
        rows = _filter_scope(rows, params)
        rows = _sort_rows(rows, metric, params.get("order", "desc"))
        out = [{"symbol": r["symbol"], "name": r["name"], "sector": r["sector"], "value": r.get(metric), "metric": metric} for r in rows]
        return 200, {"metric": metric, "companies": out[: int(params.get("limit") or 20)]}
    if base == "top-growth":
        metric = params.get("metric", "earnings_growth_yoy")
        rows = _filter_scope(rows, params)
        rows = _sort_rows(rows, metric, params.get("order", "desc"))
        out = [{"symbol": r["symbol"], "name": r["name"], "value": r.get(metric), "metric": metric} for r in rows]
        return 200, {"metric": metric, "companies": out[: int(params.get("limit") or 20)]}
    if base == "free-float":
        rows = _sort_rows(rows, "free_float_pct", "asc")
        return 200, {"companies": [{"symbol": r["symbol"], "name": r["name"], "free_float_pct": r["free_float_pct"]} for r in rows]}
    sym = seg[3] if len(seg) > 3 else None
    if base == "shareholders" and sym:
        rep = _reports().get(sym)
        return (200, {"symbol": sym, "ownership": rep["ownership"]}) if rep else (404, {"error": "symbol_not_found", "symbol": sym})
    if base == "segments" and sym:
        rep = _reports().get(sym)
        return (200, {"symbol": sym, "segments": rep["segments"]}) if rep else (404, {"error": "symbol_not_found", "symbol": sym})
    if base == "affiliates" and sym:
        rep = _reports().get(sym)
        return (200, {"symbol": sym, "affiliates": rep["ownership"]["affiliates"]}) if rep else (404, {"error": "symbol_not_found", "symbol": sym})
    if base == "daily" and sym:
        rows_d = _daily().get(sym)
        if rows_d is None:
            return 404, {"error": "symbol_not_found", "symbol": sym}
        return 200, {"symbol": sym, "daily": _slice_series(rows_d, params)}
    rows = _apply_where(rows, params.get("where"))
    if params.get("q"):
        q = str(params["q"]).lower()
        rows = [r for r in rows if q in r["name"].lower() or q in r["symbol"].lower() or q in r["sector"].lower() or q in r["sub_sector"].lower()]
    if params.get("sector"):
        rows = [r for r in rows if r["sector"].lower() == str(params["sector"]).lower()]
    if params.get("sub_sector"):
        rows = [r for r in rows if r["sub_sector"].lower() == str(params["sub_sector"]).lower()]
    rows = _sort_rows(rows, params.get("sort") or params.get("order_by"),
                      params.get("order") or ("desc" if params.get("desc") in (True, "true") else None))
    limit = int(params.get("limit") or 50)
    return 200, {"companies": rows[:limit], "total": len(rows), "where": params.get("where"), "q": params.get("q")}


def _filter_scope(rows: list[dict], params: dict) -> list[dict]:
    if params.get("sub_sector"):
        rows = [r for r in rows if r["sub_sector"].lower() == str(params["sub_sector"]).lower()]
    if params.get("sector"):
        rows = [r for r in rows if r["sector"].lower() == str(params["sector"]).lower()]
    return rows


def _h_index(seg: list[str], params: dict) -> tuple[int, Any] | None:
    idx = _market().get("index_daily", {})
    if len(seg) > 3:
        code = seg[3]
        rows = idx.get(code)
        if rows is None:
            return 404, {"error": "index_not_found", "symbol": code}
        return 200, {"symbol": code, "daily": _slice_series(rows, params)}
    code = str(params.get("symbol", "IHSG")).upper()
    rows = idx.get(code)
    return (200, {"symbol": code, "daily": _slice_series(rows, params)}) if rows else (404, {"error": "index_not_found", "symbol": code})


def _h_universe_close(seg: list[str], params: dict) -> tuple[int, Any] | None:
    data = _market().get("universe_close", {})
    rows = data.get("rows", [])
    if params.get("sector"):
        rows = [r for r in rows if r["sector"].lower() == str(params["sector"]).lower()]
    if params.get("sub_sector"):
        rows = [r for r in rows if r["sub_sector"].lower() == str(params["sub_sector"]).lower()]
    limit = int(params.get("limit") or len(rows))
    return 200, {"date": data.get("date"), "rows": rows[:limit]}


def _h_movers(seg: list[str], params: dict) -> tuple[int, Any] | None:
    m = _market().get("movers", {})
    if "most-traded" in seg:
        return 200, {"most_traded": _market().get("most_traded", [])[: int(params.get("limit") or 10)]}
    period = str(params.get("period", "1d")).lower()
    kind = str(params.get("type", "gainers")).lower()
    rows = m.get(f"{kind}_{period}") or m.get(f"gainers_{period}") or []
    return 200, {"period": period, "type": kind, "movers": rows[: int(params.get("limit") or 10)]}


def _h_broker(seg: list[str], params: dict) -> tuple[int, Any] | None:
    flow = _flow().get("broker", {})
    if "registry" in seg:
        return 200, {"registry": flow.get("registry", {})}
    if seg[-1] == "summary" or "summary" in seg:
        sym = seg[-1] if seg[-1] != "summary" else seg[-2]
        rows = flow.get("summary", {}).get(sym)
        if rows is None:
            return 404, {"error": "symbol_not_found", "symbol": sym}
        rows = [r for r in rows]
        return 200, {"symbol": sym, "brokers": rows}
    if "top-buyers" in seg:
        sym = seg[-1]
        return (200, {"symbol": sym, "brokers": flow.get("top_buyers", {}).get(sym, [])}) if sym in flow.get("top_buyers", {}) else (404, {"error": "symbol_not_found"})
    if "top-sellers" in seg:
        sym = seg[-1]
        return (200, {"symbol": sym, "brokers": flow.get("top_sellers", {}).get(sym, [])}) if sym in flow.get("top_sellers", {}) else (404, {"error": "symbol_not_found"})
    if "activity" in seg:
        code = seg[-1]
        return (200, {"broker": code, "activity": flow.get("activity", {}).get(code, [])}) if code in flow.get("activity", {}) else (404, {"error": "broker_not_found"})
    if seg[-1] == "top" or "top" in seg:
        rows = flow.get("daily_top", [])
        if params.get("date"):
            rows = [r for r in rows if r["date"] == str(params["date"])]
        return 200, {"brokers": rows[: int(params.get("limit") or 50)]}
    return None


def _h_foreign_flow(seg: list[str], params: dict) -> tuple[int, Any] | None:
    ff = _flow().get("foreign", {})
    path_sym = seg[2] if len(seg) > 2 else None
    symbols = _as_list(params.get("symbols") or params.get("symbol") or path_sym)
    if symbols:
        out = {}
        for s in symbols:
            rows = ff.get("per_symbol", {}).get(s)
            if rows is None:
                continue
            out[s] = _slice_series(rows, params)
        if not out:
            return 404, {"error": "symbol_not_found", "symbols": symbols}
        return 200, {"per_symbol": out, "symbols": list(out)}
    return 200, {"universe": ff.get("universe", []), "start": params.get("start"), "end": params.get("end")}


def _h_corporate_actions(seg: list[str], params: dict) -> tuple[int, Any] | None:
    ev = _events()
    if "calendar" in seg:
        return 200, {"calendar": ev.get("calendar", [])}
    sym = seg[2] if len(seg) > 2 else None
    if not sym:
        return 200, {"actions": ev.get("corporate_actions", {})}
    rows = ev.get("corporate_actions", {}).get(sym)
    return (200, {"symbol": sym, "actions": rows}) if rows is not None else (404, {"error": "symbol_not_found", "symbol": sym})


def _h_filings(seg: list[str], params: dict) -> tuple[int, Any] | None:
    sym = seg[2] if len(seg) > 2 else None
    if not sym:
        return 200, {"filings": _events().get("filings", {})}
    rows = _events().get("filings", {}).get(sym)
    if rows is None:
        return 404, {"error": "symbol_not_found", "symbol": sym}
    if params.get("since"):
        rows = [r for r in rows if r["date"] >= str(params["since"])]
    return 200, {"symbol": sym, "filings": rows}


def _h_suspensions(seg: list[str], params: dict) -> tuple[int, Any] | None:
    susp = _events().get("suspensions", {})
    sym = seg[2] if len(seg) > 2 else None
    if sym:
        rows = susp.get(sym)
        return (200, {"symbol": sym, "suspensions": rows}) if rows is not None else (404, {"error": "symbol_not_found", "symbol": sym})
    flat = [{"symbol": s, **r} for s, rows in susp.items() for r in rows]
    return 200, {"suspensions": flat}


def _h_news(seg: list[str], params: dict) -> tuple[int, Any] | None:
    news = _events().get("news", {})
    sym = seg[2] if len(seg) > 2 else None
    if not sym:
        flat = [{"symbol": s, **r} for s, rows in news.items() for r in rows]
        return 200, {"news": flat[: int(params.get("limit") or 50)]}
    rows = news.get(sym)
    if rows is None:
        return 404, {"error": "symbol_not_found", "symbol": sym}
    if params.get("since"):
        rows = [r for r in rows if r["date"] >= str(params["since"])]
    if params.get("tags"):
        tags = [t.lower() for t in _as_list(params["tags"])]
        rows = [r for r in rows if any(t in [x.lower() for x in r.get("tags", [])] for t in tags)]
    return 200, {"symbol": sym, "news": rows}


def _h_subsector_report(seg: list[str], params: dict) -> tuple[int, Any] | None:
    slug = seg[-1]
    rows = [r for r in _screener().get("companies", []) if r["sub_sector"].lower().replace(" ", "-") == slug.lower()]
    if not rows:
        return 404, {"error": "subsector_not_found", "slug": slug}
    pes = sorted(r["pe"] for r in rows if r.get("pe"))
    return 200, {
        "slug": slug, "name": rows[0]["sub_sector"], "count": len(rows),
        "median_pe": pes[len(pes) // 2] if pes else None, "avg_pe": round(sum(pes) / len(pes), 2) if pes else None,
        "total_market_cap": sum(r["market_cap"] for r in rows),
        "top5": sorted(rows, key=lambda r: -r["market_cap"])[:5],
        "companies": rows,
    }


def _h_helpers(seg: list[str], params: dict) -> tuple[int, Any] | None:
    h = _helpers()
    if "subsectors" in seg:
        return 200, {"subsectors": h.get("subsectors", {})}
    if "industries" in seg:
        return 200, {"industries": h.get("industries", {})}
    if "subindustries" in seg:
        return 200, {"subindustries": h.get("subindustries", {})}
    if "tags" in seg:
        return 200, {"tags": h.get("tags", [])}
    return None


def _h_mining(seg: list[str], params: dict) -> tuple[int, Any] | None:
    m = _mining()
    if "companies" in seg:
        return 200, {"companies": m.get("companies", [])}
    if "auctions" in seg:
        return 200, {"auctions": m.get("auctions", [])}
    if "commodities" in seg:
        name = params.get("name")
        commodities = m.get("commodities", {})
        if name:
            key = next((k for k in commodities if name.lower() in k.lower()), None)
            return (200, {"commodity": key, **commodities[key]}) if key else (404, {"error": "commodity_not_found", "name": name})
        return 200, {"commodities": {k: {"latest": v["latest"], "yoy_pct": v["yoy_pct"], "unit": v["unit"]} for k, v in commodities.items()},
                     "detail": commodities}
    if len(seg) < 3:
        return 200, {"companies": m.get("companies", [])}
    sym, sub = seg[2], (seg[3] if len(seg) > 3 else None)
    if sym not in m.get("detail", {}):
        return 404, {"error": "symbol_not_found", "symbol": sym}
    if sub is None:
        return 200, {"symbol": sym, **m["detail"][sym], "sites": m["sites"].get(sym, []), "production": m["production"].get(sym, [])}
    key_map = {
        "ownership": "ownership", "sites": "sites", "production": "production", "licenses": "licenses",
        "financials": "financials", "performance": "performance", "contracts": "contracts",
        "exports": "exports", "sales-destination": "sales_destination", "resources": "production",
    }
    key = key_map.get(sub)
    if key is None:
        return None
    return 200, {"symbol": sym, sub: m.get(key, {}).get(sym)}


def _h_regional(seg: list[str], params: dict) -> tuple[int, Any] | None:
    r = _regional()
    exchange = seg[1]
    base = seg[2] if len(seg) > 2 else ""
    companies = r.get("sgx_companies" if exchange == "sgx" else "klse_companies", {})
    if base == "companies":
        return 200, {"companies": [{"symbol": k, **v} for k, v in companies.items()]}
    if base == "short-sell":
        return 200, {"short_sell": r["sgx_short_sell"]}
    if base == "buybacks":
        return 200, {"buybacks": r["sgx_buybacks"]}
    if base == "filings":
        return 200, {"filings": r["sgx_filings"]}
    if base == "news":
        return 200, {"news": r["sgx_news"]}
    if base == "company" and len(seg) > 3 and seg[3] == "report":
        sym = seg[4] if len(seg) > 4 else None
        if sym and sym in companies:
            return 200, {"symbol": sym, "exchange": exchange.upper(), "report": companies[sym],
                         "peers": [k for k in companies if k != sym],
                         "sections": {"overview": companies[sym], "valuation": companies[sym]}}
        if exchange == "klse" and sym in r.get("klse_reports", {}):
            return 200, {"symbol": sym, "exchange": "KLSE", **r["klse_reports"][sym]}
        return 404, {"error": "symbol_not_found", "symbol": sym}
    return None


def respond(endpoint: str, params: dict[str, Any] | None) -> tuple[int, Any] | None:
    """Kembalikan (http_status, body) dari fixture, atau None bila endpoint belum didukung fixture."""
    path = normalize_path(endpoint)
    seg = [s for s in path.split("/") if s]
    p = normalize_params(params)
    if len(seg) < 2:
        return None
    dispatch = seg[1]
    try:
        if dispatch == "company" and len(seg) >= 3:
            if seg[2] == "report" and len(seg) >= 4:
                sym = seg[3]
                if len(seg) >= 5 and seg[4] == "quarterly":
                    return _h_quarterly(["v2", "company", "report", sym, "quarterly"] + seg[5:], p)
                if len(seg) >= 5 and seg[4] == "quarterly-dates":
                    return _h_quarterly_dates(["v2", "company", "report", sym, "quarterly-dates"] + seg[5:], p)
                if len(seg) > 5:
                    return None
                return _h_company_report(["v2", "company", "report", sym], p)
            if seg[2] == "quarterly-dates":
                return _h_quarterly_dates(["v2", "company", "quarterly-dates"] + seg[3:], p)
            if seg[2] in ("daily", "shareholders", "segments", "affiliates"):
                return _h_companies(["v2", "companies", seg[2]] + seg[3:], p)
        if dispatch == "companies":
            return _h_companies(seg, p)
        if dispatch == "quarterly-dates":
            return _h_quarterly_dates(seg, p)
        if dispatch == "index":
            return _h_index(seg, p)
        if dispatch == "idx":
            return 200, {"market_cap": _market().get("market_cap", {})}
        if dispatch == "universe":
            return _h_universe_close(seg, p)
        if dispatch == "movers":
            return _h_movers(seg, p)
        if dispatch == "ipo":
            return 200, {"ipo_performance": _screener().get("ipo_performance", [])}
        if dispatch == "broker":
            return _h_broker(seg, p)
        if dispatch == "foreign-flow":
            return _h_foreign_flow(seg, p)
        if dispatch == "corporate-actions":
            return _h_corporate_actions(seg, p)
        if dispatch == "filings":
            return _h_filings(seg, p)
        if dispatch == "suspensions":
            return _h_suspensions(seg, p)
        if dispatch == "news":
            return _h_news(seg, p)
        if dispatch == "subsector":
            return _h_subsector_report(seg, p)
        if dispatch in ("helpers", "subsectors", "industries", "subindustries"):
            return _h_helpers(seg, p)
        if dispatch == "tags":
            return 200, {"tags": _helpers().get("tags", [])}
        if dispatch == "mining":
            return _h_mining(seg, p)
        if dispatch == "commodities":
            return _h_mining(["v2", "mining", "commodities"] + seg[2:], p)
        if dispatch in ("sgx", "klse"):
            return _h_regional(seg, p)
        if dispatch == "health":
            return 200, {"ok": True}
        if dispatch == "info":
            return 200, {"meta": _meta()}
    except Exception as exc:  # noqa: BLE001 - fixture harus jujur, bukan crash diam
        return 500, {"error": "fixture_error", "detail": str(exc), "endpoint": path}
    return None