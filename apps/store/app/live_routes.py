"""Peta endpoint → path live Sectors v2 (docs/STORE.md).

Hanya path resmi `/sectors/v2/...` yang diteruskan, apa adanya, ke `/v2/.../` dengan parameter tak berubah.
Selain itu tidak punya padanan: terjemahan mengembalikan None dan Store menolak jalan (fail-closed) —
0 kredit, bukan 404 yang tetap berbiaya 1.
"""
from __future__ import annotations

from typing import Any

from .keys import strip_host


def translate(endpoint: str, params: dict[str, Any] | None) -> tuple[str, dict[str, Any]] | None:
    seg = [s for s in strip_host(endpoint).split("?", 1)[0].split("/") if s]
    if len(seg) >= 3 and seg[0].lower() == "sectors" and seg[1].lower() == "v2":
        return "/" + "/".join(seg[1:]) + "/", dict(params or {})
    return None
