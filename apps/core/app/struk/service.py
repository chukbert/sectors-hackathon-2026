"""Paham Emiten — rakit Kartu Kenalan dari data Sectors (lewat Store, cache-first).

Aturan keras:
- Semua angka/pemilik/segmen berasal dari respons Sectors; setiap fakta membawa `src`.
- Tanpa LLM: semua teks di kartu adalah templat tetap atau label asli Sectors (segmen tampil dalam bahasa Inggris).
- STRUK_SECTORS_OFF=1 mematikan akses Sectors: aplikasi harus kosong, bukan mengarang.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

from ..store_client import STORE, StoreError
from . import brands, snowflake, universe
from .universe import LATEST, YEARS

SEG_ENDPOINT = "/sectors/v2/company/get-segments/{sym}/"
SEG_LIST = "/sectors/v2/companies/list_companies_with_segments/"
MAX_PAGES = 6


class SectorsOff(RuntimeError):
    """Sectors dicabut (STRUK_SECTORS_OFF=1) atau tidak terjangkau."""


def sectors_off() -> bool:
    return os.getenv("STRUK_SECTORS_OFF", "").strip().lower() in ("1", "true", "yes", "on")


async def _fetch(endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    if sectors_off():
        raise SectorsOff("Sectors API dimatikan (STRUK_SECTORS_OFF=1)")
    try:
        return await STORE.fetch(endpoint, params)
    except StoreError as exc:
        if exc.status in (501, 502, 503):
            raise SectorsOff(f"Data Sectors tidak tersedia: {exc.detail}") from exc
        raise


def _src(api: str, field: str | None, resp: dict[str, Any], query: str | None = None) -> dict[str, Any]:
    return {"api": api, "field": field, "query": query, "fetched_at": resp.get("fetched_at"),
            "source": resp.get("source"), "credits": resp.get("credits_spent", 0), "cache_key": resp.get("cache_key")}


# ---------------------------------------------------------------- universe (matriks seluruh bursa)

_UNIVERSE: dict[str, Any] | None = None
_LOCK = asyncio.Lock()


async def load_universe() -> dict[str, Any]:
    """{records: {SYM: {...}}, prov: {...}} — 25 halaman screener (5 grup × 5), semuanya hit cache setelah panen."""
    global _UNIVERSE
    if sectors_off():
        raise SectorsOff("Sectors API dimatikan (STRUK_SECTORS_OFF=1)")
    async with _LOCK:
        if _UNIVERSE is not None:
            return _UNIVERSE
        bodies, last = [], None
        for group in universe.GROUPS:
            for page in range(MAX_PAGES):
                resp = await _fetch(universe.SCREENER, universe.matrix_params(group, page * universe.PAGE))
                bodies.append(resp["data"])
                last = resp
                if not (resp["data"].get("pagination") or {}).get("has_next"):
                    break
        records = universe.merge_pages(bodies)
        _UNIVERSE = {"records": records, "count": len(records), "prov": last or {}}
        return _UNIVERSE


def reset_cache() -> None:
    global _UNIVERSE
    _UNIVERSE = None


def _num(v: Any) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _matrix_src(u: dict[str, Any], field: str) -> dict[str, Any]:
    return _src("GET /v2/companies/ (Screener, include_query_values)", field, u["prov"],
                query="where symbol like '%' or … (matriks seluruh bursa)")


# ---------------------------------------------------------------- pemilik

def _holders(rec: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for h in rec.get("major_shareholders_share_percentage") or []:
        pct = _num(h.get("share_percentage"))
        if pct is None:
            continue
        out.append({"name": (h.get("name") or "").strip(), "pct": pct,
                    "symbol": universe.bare(h["symbol"]) if h.get("symbol") else None})
    return sorted(out, key=lambda x: -x["pct"])


def _is_public(name: str) -> bool:
    n = name.lower()
    return n in ("public", "masyarakat") or "treasury" in n


def controller_chain(records: dict[str, Any], sym: str, depth: int = 4) -> list[dict[str, Any]]:
    """Ikuti pemegang saham terbesar (bukan publik) — melompat ke emiten induk bila Sectors menautkan simbolnya."""
    chain, seen = [], {sym}
    cur = records.get(sym)
    while cur and depth > 0:
        top = next((h for h in _holders(cur) if not _is_public(h["name"])), None)
        if not top:
            break
        chain.append({**top, "of": cur["symbol"]})
        nxt = top.get("symbol")
        if not nxt or nxt in seen or nxt not in records:
            break
        seen.add(nxt)
        cur = records[nxt]
        depth -= 1
    return chain


def owner_group(records: dict[str, Any], sym: str) -> dict[str, Any]:
    rec = records.get(sym) or {}
    chain = controller_chain(records, sym)
    groups = list(rec.get("affiliates") or [])
    for link in chain:
        parent = records.get(link.get("symbol") or "")
        if parent:
            groups += [g for g in parent.get("affiliates") or [] if g not in groups]
    if groups:
        label, kind = f"Grup {groups[0]}", "affiliates"
    elif chain:
        label, kind = chain[-1]["name"], "controller"
    else:
        label, kind = "Dimiliki tersebar (tanpa pengendali tunggal)", "dispersed"
    return {"label": label, "kind": kind, "chain": chain, "affiliates": groups}


def owners_view(u: dict[str, Any], sym: str) -> dict[str, Any]:
    rec = u["records"][sym]
    return {
        "holders": _holders(rec),
        "free_float": _num(rec.get("free_float")),
        "group": owner_group(u["records"], sym),
        "src": _matrix_src(u, "major_shareholders_share_percentage, affiliates, free_float"),
    }


# ---------------------------------------------------------------- uang (segmen)

_SEG_LIST: set[str] | None = None


async def segment_symbols() -> set[str]:
    global _SEG_LIST
    if _SEG_LIST is None:
        resp = await _fetch(SEG_LIST, {})
        _SEG_LIST = {universe.bare(s) for s in (resp["data"] or {})}
    return _SEG_LIST


async def money_map(sym: str) -> dict[str, Any] | None:
    if sym not in await segment_symbols():
        return None
    try:
        resp = await _fetch(SEG_ENDPOINT.format(sym=sym), {})
    except SectorsOff:
        if sectors_off():
            raise
        return None  # belum dipanen & Store offline: panel kosong jujur, kartu lain tetap jalan
    except StoreError:
        return None
    data = resp["data"] or {}
    links = [{"source": (r.get("source") or "").strip(), "target": (r.get("target") or "").strip(),
              "value": _num(r.get("value"))} for r in data.get("revenue_breakdown") or []]
    links = [lk for lk in links if lk["source"] and lk["target"] and lk["value"] and lk["value"] > 0]
    if not links:
        return None
    return {"year": data.get("financial_year"), "links": links,
            "src": _src(f"GET /v2/company/get-segments/{sym}/", "revenue_breakdown", resp)}


# ---------------------------------------------------------------- pencarian (kode saham saja)

def search_tickers(records: dict[str, Any], q: str, limit: int = 8) -> dict[str, Any]:
    """Input hanya kode saham: cocok persis dulu, lalu kode yang diawali ketikan pengguna (BB → BBCA, BBRI, …)."""
    code = "".join(ch for ch in universe.bare(q.strip()) if ch.isalnum())
    if not code:
        return {"query": code, "exact": False, "results": []}
    syms = ([code] if code in records else []) + sorted(s for s in records if s.startswith(code) and s != code)
    return {"query": code, "exact": code in records,
            "results": [{"symbol": s, "name": records[s].get("company_name")} for s in syms[:limit]]}


# ---------------------------------------------------------------- kartu kenalan

def _series(rec: dict[str, Any], field: str) -> list[dict[str, Any]]:
    return [{"year": y, "value": _num(rec.get(f"{field}[{y}]"))} for y in YEARS]


def peers(u: dict[str, Any], sym: str, n: int = 5) -> list[dict[str, Any]]:
    rec = u["records"][sym]
    # Industri lebih sempit dari subsektor (Food & Beverage mencampur mi instan dan sawit); mundur ke subsektor bila sepi.
    same: list[dict[str, Any]] = []
    for key in ("industry", "sub_sector"):
        val = rec.get(key)
        if val:
            same = [r for r in u["records"].values() if r.get(key) == val and _num(r.get("market_cap"))]
            if len(same) >= 4:
                break
    if not same:
        return []
    same.sort(key=lambda r: -(_num(r.get("market_cap")) or 0))
    top = same[:n]
    if rec not in top:
        top.append(rec)
    return [{"symbol": r["symbol"], "name": r.get("company_name"), "is_self": r["symbol"] == sym,
             "revenue": _num(r.get(f"revenue[{LATEST}]")), "earnings": _num(r.get(f"earnings[{LATEST}]")),
             "net_margin": _num(r.get(f"net_profit_margin[{LATEST}]")), "market_cap": _num(r.get("market_cap"))}
            for r in top]


async def company_card(sym: str) -> dict[str, Any]:
    sym = universe.bare(sym)
    u = await load_universe()
    rec = u["records"].get(sym)
    if not rec:
        raise KeyError(sym)
    money = await money_map(sym)
    margin = _num(rec.get(f"net_profit_margin[{LATEST}]"))
    return {
        "symbol": sym,
        "name": rec.get("company_name"),
        "sector": rec.get("sector"), "sub_sector": rec.get("sub_sector"), "industry": rec.get("industry"),
        "brands": brands.brands_of(sym),
        "listing_date": rec.get("listing_date"), "listing_board": rec.get("listing_board"),
        "employees": _num(rec.get("employee_num")),
        "year": LATEST,
        "facts": {
            "revenue": _num(rec.get(f"revenue[{LATEST}]")),
            "earnings": _num(rec.get(f"earnings[{LATEST}]")),
            "net_margin": margin,
            "per_100": round(margin * 100, 1) if margin is not None else None,
            "market_cap": _num(rec.get("market_cap")),
            "market_cap_rank": _num(rec.get("market_cap_rank")),
            "universe_total": u["count"],
            "total_debt": _num(rec.get(f"total_debt[{LATEST}]")),
            "total_equity": _num(rec.get(f"total_equity[{LATEST}]")),
            "dividend_per_share": _num(rec.get(f"total_dividend[{LATEST}]")),
            "payout_ratio": _num(rec.get("payout_ratio")),
            "roe": _num(rec.get(f"roe[{LATEST}]")),
        },
        "facts_src": _matrix_src(u, f"revenue[{LATEST}], earnings[{LATEST}], net_profit_margin[{LATEST}], market_cap, …"),
        "trend": {"revenue": _series(rec, "revenue"), "earnings": _series(rec, "earnings"),
                  "src": _matrix_src(u, f"revenue[{YEARS[0]}..{LATEST}], earnings[{YEARS[0]}..{LATEST}]")},
        "money": money,
        "owners": owners_view(u, sym),
        "peers": peers(u, sym),
        "peers_src": _matrix_src(u, "sub_sector, market_cap, revenue, net_profit_margin"),
        "snowflake": {**snowflake.evaluate(u["records"], sym),
                      "src": _matrix_src(u, f"intrinsic_value, pe/pb/peg[{LATEST}], eps[{universe.HIST_YEAR}..{LATEST}], total_dividend, rasio utang, forecast_*[{universe.FORECAST_YEAR}] …")},
    }
