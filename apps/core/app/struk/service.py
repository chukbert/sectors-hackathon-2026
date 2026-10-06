"""Struk Jadi Saham — rakit Kartu Kenalan dari data Sectors (lewat Store, cache-first).

Aturan keras:
- Semua angka/pemilik/segmen berasal dari respons Sectors; setiap fakta membawa `src`.
- LLM hanya: membaca struk → nama merek, menerjemahkan label segmen, dan menanggapi jawaban
  pengguna di Mode Kritis — tanpa angka baru (lihat narrate.py).
- STRUK_SECTORS_OFF=1 mematikan akses Sectors: aplikasi harus kosong, bukan mengarang.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

from ..store_client import STORE, StoreError
from . import brands, rules, universe
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
    """{records: {SYM: {...}}, prov: {...}} — 10 halaman screener, semuanya hit cache setelah panen."""
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


# ---------------------------------------------------------------- kritis

_COHORTS: dict[str, dict[str, Any]] = {}


async def cohort(rule: rules.Rule) -> dict[str, Any]:
    if rule.id not in _COHORTS:
        resp = await _fetch(universe.SCREENER, rules.cohort_params(rule))
        body = resp["data"] or {}
        _COHORTS[rule.id] = {
            "total": (body.get("pagination") or {}).get("total_count"),
            "examples": [{"symbol": universe.bare(r["symbol"]), "name": r.get("company_name")}
                         for r in body.get("results") or []],
            "src": _src("GET /v2/companies/ (Screener)", None, resp, query=rule.where),
        }
    return _COHORTS[rule.id]


async def kritis(u: dict[str, Any], sym: str) -> list[dict[str, Any]]:
    rec = u["records"][sym]
    out = []
    for rule in rules.matches(rec):
        c = await cohort(rule)
        out.append({
            "id": rule.id, "title": rule.title, "tone": rule.tone, "question": rule.question, "hints": list(rule.hints),
            "values": [{"field": f, "value": _num(rec.get(f))} for f in rule.fields],
            "where": rule.where, "cohort_total": c["total"], "universe_total": u["count"],
            "cohort_examples": [e for e in c["examples"] if e["symbol"] != sym][:5],
            "src": c["src"], "values_src": _matrix_src(u, ", ".join(rule.fields)),
        })
    # Kejanggalan dulu, pola positif belakangan.
    return sorted(out, key=lambda k: (k["tone"] != "tanya", k["cohort_total"] or 0))


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
    money, crit = await asyncio.gather(money_map(sym), kritis(u, sym))
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
        "kritis": crit,
    }


# ---------------------------------------------------------------- keranjang (hasil struk)

async def basket(items: list[dict[str, Any]]) -> dict[str, Any]:
    """items: [{raw, brand, symbol?}] dari pembaca struk → emiten terverifikasi + peta pemilik."""
    u = await load_universe()
    recs = u["records"]
    resolved, unknown = [], []
    for it in items:
        # Hanya merek yang diidentifikasi pembaca struk. Teks mentah tidak dicocokkan lagi:
        # "Clear plastik bag" atau "Surya beras" bukan Clear (UNVR) / Surya (GGRM).
        hit = brands.lookup(it.get("brand") or "")
        if hit and hit.symbol in recs:
            resolved.append({**it, "brand": hit.brand, "symbol": hit.symbol, "relation": hit.relation,
                             "note": hit.note, "verified": True})
            continue
        guess = universe.bare(it.get("symbol") or "")
        if guess and guess in recs:
            # Tebakan LLM di luar katalog: simbolnya ada di Sectors, tapi pemetaan merek belum dikurasi.
            resolved.append({**it, "symbol": guess, "relation": "dugaan", "note": None, "verified": False})
        else:
            unknown.append(it)

    by_symbol: dict[str, dict[str, Any]] = {}
    for r in resolved:
        e = by_symbol.setdefault(r["symbol"], {"symbol": r["symbol"], "name": recs[r["symbol"]].get("company_name"),
                                               "items": [], "lines": [], "verified": r["verified"], "relation": r["relation"],
                                               "note": r.get("note"), "sub_sector": recs[r["symbol"]].get("sub_sector"),
                                               "market_cap": _num(recs[r["symbol"]].get("market_cap"))})
        raw = r.get("raw") or r.get("brand")
        e["items"].append(raw)
        # Status per baris: tebakan AI tidak boleh ikut "terverifikasi" hanya karena baris lain di emiten yang sama terverifikasi.
        e["lines"].append({"raw": raw, "relation": r["relation"], "verified": r["verified"], "note": r.get("note")})
        if r["verified"] and not e["verified"]:
            e.update(verified=True, relation=r["relation"], note=r.get("note"))

    groups: dict[str, dict[str, Any]] = {}
    for sym, e in by_symbol.items():
        g = owner_group(recs, sym)
        e["group"] = g["label"]
        grp = groups.setdefault(g["label"], {"label": g["label"], "kind": g["kind"], "symbols": [], "chain_example": g["chain"]})
        grp["symbols"].append(sym)

    return {
        "companies": sorted(by_symbol.values(), key=lambda e: -(e["market_cap"] or 0)),
        "groups": sorted(groups.values(), key=lambda g: -len(g["symbols"])),
        "unknown": unknown,
        "spend": spend_flow(u, resolved, unknown, by_symbol, groups),
        "universe_total": u["count"],
        "src": _matrix_src(u, "company_name, sub_sector, market_cap, major_shareholders_share_percentage, affiliates"),
    }


def _price(it: dict[str, Any]) -> int:
    p = it.get("price")
    return p if isinstance(p, int) and not isinstance(p, bool) and p > 0 else 0


def spend_flow(u: dict[str, Any], resolved: list[dict[str, Any]], unknown: list[dict[str, Any]],
               by_symbol: dict[str, dict[str, Any]], groups: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Uang belanjamu mengalir ke siapa: harga dari STRUK PENGGUNA (bukan fakta perusahaan) dijumlah per emiten
    dan per grup pemilik. Satu-satunya angka perusahaan di sini — margin laba bersih — datang dari Sectors."""
    recs = u["records"]
    per_sym: dict[str, int] = {}
    for r in resolved:
        per_sym[r["symbol"]] = per_sym.get(r["symbol"], 0) + _price(r)
    other = sum(_price(it) for it in unknown)
    total = sum(per_sym.values()) + other
    lines = len(resolved) + len(unknown)
    priced = sum(1 for it in [*resolved, *unknown] if _price(it))
    share = (lambda v: round(v / total, 4)) if total else (lambda v: None)

    companies = []
    for sym, amount in per_sym.items():
        if not amount:
            continue
        margin = _num(recs[sym].get(f"net_profit_margin[{LATEST}]"))
        companies.append({"symbol": sym, "name": by_symbol[sym]["name"], "group": by_symbol[sym]["group"],
                          "verified": by_symbol[sym]["verified"], "amount": amount, "share": share(amount),
                          "net_margin": margin, "per_100": round(margin * 100, 1) if margin is not None else None})
    companies.sort(key=lambda c: -c["amount"])
    grp = []
    for g in groups.values():
        syms = [c["symbol"] for c in companies if c["group"] == g["label"]]
        if syms:
            amount = sum(per_sym[s] for s in syms)
            grp.append({"label": g["label"], "kind": g["kind"], "symbols": syms, "amount": amount, "share": share(amount)})
    grp.sort(key=lambda g: -g["amount"])
    to_issuers = sum(c["amount"] for c in companies)
    return {
        "total": total, "to_issuers": to_issuers, "to_issuers_share": share(to_issuers),
        "other": other, "other_share": share(other),
        "lines": lines, "priced_lines": priced,
        "companies": companies, "groups": grp,
        "year": LATEST,
        "price_source": "struk pengguna",
        "margin_src": _matrix_src(u, f"net_profit_margin[{LATEST}]"),
    }
