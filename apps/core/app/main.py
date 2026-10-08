"""Paham Emiten Core API — kode saham → kartu emiten, 100% dari data Sectors (lewat Store)."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import SETTINGS
from .store_client import STORE
from .struk import DISCLAIMER, service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("paham.core")

app = FastAPI(title="Paham Emiten Core", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _sectors_off_response(exc: Exception) -> dict[str, Any]:
    return {"sectors_off": True, "detail": str(exc),
            "message": "Tanpa data Sectors, aplikasi ini tidak bisa menampilkan apa pun — kami tidak mengarang angka."}


@app.get("/v1/health")
async def health():
    store_ok = True
    try:
        await STORE.health()
    except Exception:  # noqa: BLE001
        store_ok = False
    return {"ok": True, "service": "paham-emiten-core", "store_reachable": store_ok, "store_url": SETTINGS.store_url}


@app.get("/v1/struk/status")
async def struk_status():
    out: dict[str, Any] = {"sectors_off": service.sectors_off(), "disclaimer": DISCLAIMER}
    try:
        out["store"] = await STORE.stats()
    except Exception as exc:  # noqa: BLE001
        out["store_error"] = str(exc)
    return out


@app.get("/v1/struk/company/{symbol}")
async def struk_company(symbol: str):
    try:
        card = await service.company_card(symbol)
    except service.SectorsOff as exc:
        return _sectors_off_response(exc)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"{symbol.upper()} tidak ada di data Sectors") from exc
    card["disclaimer"] = DISCLAIMER
    return card


@app.get("/v1/struk/search")
async def struk_search(q: str = Query(min_length=1, max_length=12)):
    """Cari emiten lewat kode saham (ticker) saja — persis atau awalan. 0 kredit: semuanya dari matriks."""
    try:
        u = await service.load_universe()
    except service.SectorsOff as exc:
        return _sectors_off_response(exc)
    return {**service.search_tickers(u["records"], q), "universe_total": u["count"]}


@app.on_event("shutdown")
async def _shutdown():
    await STORE.aclose()
