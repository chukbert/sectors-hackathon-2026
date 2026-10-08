"""Kunci kanonis (docs/STORE.md, bagian "Kunci kanonis") + biaya kredit per panggilan.

cache_key = SHA256(METHOD + "|" + path_norm + "|" + params_norm)
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

# Segmen jalur yang dibiarkan huruf kecil; segmen alfanumerik lain (simbol, slug, `sectors`) dijadikan
# huruf besar supaya `bbca` dan `BBCA` memberi kunci yang sama.
PATH_KEYWORDS = {"v1", "v2", "company", "companies"}

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


def canonical_key(endpoint: str, params: dict[str, Any] | None, method: str = "GET") -> str:
    path = normalize_path(endpoint)
    norm = normalize_params(params)
    payload = f"{method.upper()}|{path}|{json.dumps(norm, sort_keys=True, separators=(',', ':'))}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def canonical_public(endpoint: str, params: dict[str, Any] | None, method: str = "GET") -> dict[str, Any]:
    return {"method": method.upper(), "path": normalize_path(endpoint), "params": normalize_params(params)}


def credit_cost(endpoint: str, params: dict[str, Any] | None = None, http_status: int = 200, body: Any = None) -> int:
    """Biaya kredit Sectors per panggilan (tabel penagihan docs v2, lihat docs/CREDITS.md).

    2xx dan 404 ditagih; 400/401/403/429/5xx gratis, kecuali 400 pada screener `?q=` yang sudah terlanjur
    diproses (sunk cost) = 1. Screener bahasa alami (`q=`) 3 kredit, selebihnya 1 kredit per panggilan.
    """
    seg = [s for s in normalize_path(endpoint).split("/") if s]
    tail = seg[-1] if seg else ""
    natural_language = tail == "companies" and bool(normalize_params(params).get("q"))
    if http_status == 404:
        return 1
    if 400 <= http_status < 500:
        return 1 if http_status == 400 and natural_language else 0
    if http_status >= 500:
        return 0
    return 3 if natural_language else 1
