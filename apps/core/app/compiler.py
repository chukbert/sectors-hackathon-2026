"""NL → `where` Compiler (IO-11) — whitelist field + validasi lokal sebelum menyentuh Sectors.

Screener terstruktur = 1 kredit; NL `q` = 3 kredit → compiler dulu, `q` hanya fallback.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from .llm import GATEWAY, LLMFatal, LLMUnavailable, extract_json

log = logging.getLogger("idxmaca.compiler")

FIELDS = {
    "pe": {"type": "number", "desc": "P/E TTM"},
    "pb": {"type": "number", "desc": "Price to book"},
    "roe": {"type": "number", "desc": "Return on equity (%)"},
    "der": {"type": "number", "desc": "Debt to equity (x)"},
    "dividend_yield": {"type": "number", "desc": "Dividend yield (%)"},
    "market_cap": {"type": "number", "desc": "Market cap (IDR)"},
    "price": {"type": "number", "desc": "Harga saham (IDR)"},
    "revenue_growth_yoy": {"type": "number", "desc": "Revenue growth YoY (%)"},
    "earnings_growth_yoy": {"type": "number", "desc": "Earnings growth YoY (%)"},
    "free_float_pct": {"type": "number", "desc": "Free float (%)"},
    "avg_daily_value_30d": {"type": "number", "desc": "Rata-rata nilai transaksi 30 hari (IDR)"},
    "change_pct_1d": {"type": "number", "desc": "Perubahan harga 1 hari (%)"},
    "change_pct_30d": {"type": "number", "desc": "Perubahan harga 30 hari (%)"},
    "sector": {"type": "string", "desc": "Sektor"},
    "sub_sector": {"type": "string", "desc": "Subsektor"},
}
OPS = ["gt", "gte", "lt", "lte", "eq", "neq", "between", "in", "contains"]
SORTABLE = set(FIELDS)

ALIAS_FIELD = {
    "p/e": "pe", "pe": "pe", "price earning": "pe",
    "p/b": "pb", "pb": "pb", "price to book": "pb",
    "roe": "roe", "return on equity": "roe",
    "der": "der", "debt to equity": "der", "leverage": "der",
    "dividen": "dividend_yield", "dividend": "dividend_yield", "yield": "dividend_yield", "dividend yield": "dividend_yield",
    "market cap": "market_cap", "kapitalisasi": "market_cap", "kapitalisasi pasar": "market_cap", "mcap": "market_cap",
    "harga": "price", "price": "price",
    "growth": "earnings_growth_yoy", "pertumbuhan laba": "earnings_growth_yoy", "earnings growth": "earnings_growth_yoy",
    "pertumbuhan pendapatan": "revenue_growth_yoy", "revenue growth": "revenue_growth_yoy",
    "float": "free_float_pct", "free float": "free_float_pct",
    "likuiditas": "avg_daily_value_30d", "volume": "avg_daily_value_30d", "nilai transaksi": "avg_daily_value_30d",
}
SECTOR_HINTS = {
    "bank": "Banks", "perbankan": "Banks", "tambang": "Energy", "coal": "Energy", "batu bara": "Energy",
    "energi": "Energy", "nikel": "Basic Materials", "emas": "Basic Materials", "semen": "Basic Materials",
    "telko": "Telecommunications", "telkom": "Telecommunications", "konsumer": "Consumer Non-Cyclicals",
    "teknologi": "Technology", "kesehatan": "Healthcare", "farmasi": "Healthcare", "otomotif": "Consumer Cyclicals",
}
UNIT = {"t": 1e12, "triliun": 1e12, "tn": 1e12, "m": 1e9, "miliar": 1e9, "b": 1e9, "juta": 1e6, "rb": 1e3, "ribu": 1e3}


def _num(raw: str, unit: str | None) -> float:
    val = float(raw.replace(".", "").replace(",", ".")) if raw.count(".") and raw.count(",") == 0 else float(raw.replace(",", "."))
    if unit:
        return val * UNIT.get(unit.lower(), 1)
    return val


def _parse_template(text: str) -> dict[str, Any]:
    low = text.lower()
    conditions: dict[str, Any] = {}
    for alias, field in sorted(ALIAS_FIELD.items(), key=lambda kv: -len(kv[0])):
        pattern = (
            re.escape(alias)
            + r"[^a-z0-9%]{0,14}?"
            + r"(?:(?:di|dari)\s+)?"
            + r"(atas|bawah|lebih dari|kurang dari|min|maks|>=|<=|>|<)?\s*"
            + r"(\d[\d.,]*)\s*"
            + r"(%|persen|kuadriliun|triliun|trn|tn|miliar|juta|jt|ribu|rb|m|b|t)?"
        )
        for m in re.finditer(pattern, low):
            op_raw = (m.group(1) or "").strip()
            value = _num(m.group(2), m.group(3))
            op = "gt"
            if op_raw in ("bawah", "kurang dari", "maks", "<"):
                op = "lt"
            elif op_raw == "<=":
                op = "lte"
            elif op_raw in ("min", ">="):
                op = "gte"
            existing = conditions.get(field)
            if existing is None:
                conditions[field] = {op: value}
            elif isinstance(existing, dict):
                existing.update({op: value})
    for hint, sub in SECTOR_HINTS.items():
        if re.search(rf"(?<![a-z]){re.escape(hint)}(?![a-z])", low) and "sub_sector" not in conditions:
            conditions["sub_sector"] = sub
            break
    where = conditions if conditions else None
    sort = "-dividend_yield" if re.search(r"dividen|yield", low) else "-market_cap"
    return {"where": where, "sort": sort, "order": "desc", "limit": 25, "fallback_q": None, "compiler": "template"}


COMPILER_SCHEMA = {
    "type": "object",
    "properties": {
        "where": {"type": ["object", "null"]},
        "sort": {"type": "string"},
        "order": {"type": "string", "enum": ["asc", "desc"]},
        "limit": {"type": "integer"},
        "explanation": {"type": "string"},
    },
    "required": ["where", "sort", "order", "limit", "explanation"],
    "additionalProperties": False,
}


def _validate(compiled: dict[str, Any]) -> dict[str, Any]:
    where = compiled.get("where") or {}
    clean: dict[str, Any] = {}
    if isinstance(where, dict):
        for field, spec in where.items():
            if field not in FIELDS:
                continue
            if isinstance(spec, dict):
                spec = {k: v for k, v in spec.items() if k in OPS}
                if spec:
                    clean[field] = spec
            else:
                clean[field] = {"eq": spec}
    sort = str(compiled.get("sort") or "-market_cap")
    sort_field = sort.lstrip("-")
    if sort_field not in SORTABLE:
        sort = "-market_cap"
    limit = compiled.get("limit")
    try:
        limit = max(1, min(int(limit or 25), 100))
    except (TypeError, ValueError):
        limit = 25
    return {"where": clean or None, "sort": sort, "order": "desc" if sort.startswith("-") else "asc",
            "limit": limit, "fallback_q": None, "compiler": compiled.get("compiler", "llm")}


async def compile_screener(text: str, session_context: list[dict] | None = None) -> dict[str, Any]:
    if GATEWAY.available:
        from .prompts import load as load_prompt

        system = {
            "role": "system",
            "content": load_prompt("compiler", fields=json.dumps(FIELDS), ops=json.dumps(OPS)),
        }
        messages = [system] + (session_context or [])[-6:] + [{"role": "user", "content": text}]
        try:
            result = await GATEWAY.chat("compiler", messages, json_schema=COMPILER_SCHEMA)
            compiled = extract_json(result["text"])
            compiled["compiler"] = "llm"
            return _validate(compiled)
        except (LLMUnavailable, LLMFatal, ValueError, KeyError) as exc:
            log.warning("compiler LLM gagal, fallback template: %s", exc)
    return _validate(_parse_template(text))