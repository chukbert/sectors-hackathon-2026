"""Store Service API — cache read-through wajib (docs/STORE.md).

POST /v1/store/fetch       jalur utama (hit → 0 kredit; miss → tembak + simpan, hanya mode live)
POST /v1/store/lookup      cek kering gratis: sudah ada di Store atau belum
POST /v1/store/invalidate  bust cache
GET  /v1/store/stats       hit rate + kredit terpakai/hemat
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import SETTINGS
from .db import StoreDB
from .keys import canonical_key, canonical_public, credit_cost, normalize_params, normalize_path
from .live_routes import translate
from .sectors_client import SectorsClient, SectorsError
from .ttl import ttl_seconds

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("paham.store")

app = FastAPI(title="Paham Emiten Store", version="1.0.0")
db = StoreDB(SETTINGS.db_path)
sectors = SectorsClient(SETTINGS)
_inflight: dict[str, asyncio.Future] = {}
_inflight_lock = asyncio.Lock()


class FetchRequest(BaseModel):
    endpoint: str
    params: dict[str, Any] = Field(default_factory=dict)


class LookupRequest(BaseModel):
    endpoint: str
    params: dict[str, Any] = Field(default_factory=dict)


class InvalidateRequest(BaseModel):
    endpoint: str | None = None
    params: dict[str, Any] | None = None
    cache_key: str | None = None
    older_than: int | None = None


def _mode() -> str:
    return SETTINGS.mode


def _provenance(source: str, fetched_at: float, credits: int, key: str, http_status: int, warnings: list[str], origin: str | None = None) -> dict:
    return {
        "source": source,
        "origin": origin,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(fetched_at)),
        "fetched_at_epoch": fetched_at,
        "credits_spent": credits,
        "cache_key": key,
        "http_status": http_status,
        "warnings": warnings,
        "mode": _mode(),
    }


async def _fetch_live(endpoint: str, params: dict, key: str, ttl: int) -> tuple[int, Any, int, float]:
    route = translate(endpoint, params)
    now = time.time()
    if route is None:
        log.warning("live route belum dipetakan: %s %s", normalize_path(endpoint), params)
        return 501, {
            "error": "live_route_unavailable",
            "endpoint": normalize_path(endpoint),
            "params": params,
            "detail": "Hanya path resmi /sectors/v2/... yang diteruskan ke Sectors; permintaan tidak dikirim agar tidak membuang kredit (fail-closed).",
        }, 0, now
    live_endpoint, live_params = route
    status, body = await sectors.get(live_endpoint, live_params)
    credits = credit_cost(endpoint, params, status, body)
    if status == 404:
        db.put(key, "GET", endpoint, params, body, status, credits, SETTINGS.negative_ttl_s, now, origin="live")
    elif 200 <= status < 300:
        db.put(key, "GET", endpoint, params, body, status, credits, ttl, now, origin="live")
    return status, body, credits, now


def _lookup_state(endpoint: str, params: dict) -> dict:
    params = normalize_params(params)
    key = canonical_key(endpoint, params)
    row = db.get(key)
    offline = _mode() == "offline"
    route = translate(endpoint, params)
    out = {
        **canonical_public(endpoint, params),
        "cache_key": key,
        "est_credits_live": 0 if offline else credit_cost(endpoint, params),
        "live_path": route[0] if route else None,
        "live_ready": route is not None,
        "ttl_s": ttl_seconds(endpoint, SETTINGS.default_ttl_s),
        "mode": _mode(),
    }
    if row and db.is_fresh(row):
        out.update({"hit": True, "fresh": True, "fetched_at": row["fetched_at"], "expires_at": row["expires_at"],
                    "http_status": row["http_status"], "credits_spent": 0, "est_credits_live": 0,
                    "origin": row.get("origin")})
    elif row:
        out.update({"hit": True, "fresh": False, "fetched_at": row["fetched_at"], "expires_at": row["expires_at"],
                    "http_status": row["http_status"], "est_credits_live": 0 if offline else credit_cost(endpoint, params)})
    else:
        out.update({"hit": False, "fresh": False, "fetched_at": None, "expires_at": None})
    return out


@app.post("/v1/store/fetch")
async def fetch(req: FetchRequest):
    params = normalize_params(req.params)
    key = canonical_key(req.endpoint, params)
    path = normalize_path(req.endpoint)
    ttl = ttl_seconds(req.endpoint, SETTINGS.default_ttl_s)

    row = db.get(key)
    if row and db.is_fresh(row):
        db.touch(key)
        spent_original = int(row.get("credits_spent") or 0)
        if spent_original > 0:
            db.record_saving(key, spent_original)
        return {"data": json.loads(row["response"]), **_provenance("store-hit", row["fetched_at"], 0, key, row["http_status"], [])}

    if _mode() == "offline":
        if row:
            return {"data": json.loads(row["response"]), **_provenance("store-hit-stale", row["fetched_at"], 0, key, row["http_status"], ["mode offline: memakai entri kedaluwarsa"])}
        raise HTTPException(status_code=503, detail={"error": "offline_no_cache", "endpoint": path, "params": params,
                                                    "detail": "Mode offline: belum ada di Store, data tidak dikarang."})
    if not sectors.configured:
        raise HTTPException(status_code=503, detail={"error": "no_api_key", "detail": "Mode live butuh SECTORS_API_KEY."})

    async with _inflight_lock:
        fut = _inflight.get(key)
        if fut is None:
            fut = asyncio.get_event_loop().create_future()
            _inflight[key] = fut
            leader = True
        else:
            leader = False

    if not leader:
        status, body, credits, now = await fut
        return {"data": body, **_provenance("sectors-live" if credits else "store-hit", now, credits, key, status, ["single-flight: menunggu penerbangan yang sama"])}

    try:
        try:
            status, body, credits, now = await _fetch_live(req.endpoint, params, key, ttl)
        except SectorsError as exc:
            raise HTTPException(status_code=502, detail={"error": "sectors_unreachable", "detail": exc.message}) from exc
        fut.set_result((status, body, credits, now))
        return {"data": body, **_provenance("sectors-live", now, credits, key, status, [], "live")}
    except HTTPException as exc:
        fut.set_exception(exc)
        raise
    except Exception as exc:  # noqa: BLE001
        fut.set_exception(exc)
        raise HTTPException(status_code=500, detail={"error": "store_error", "detail": str(exc)}) from exc
    finally:
        if fut.done():
            async with _inflight_lock:
                _inflight.pop(key, None)


@app.post("/v1/store/lookup")
async def lookup(req: LookupRequest):
    return _lookup_state(req.endpoint, req.params)


@app.get("/v1/store/lookup")
async def lookup_get(endpoint: str, params: str | None = None):
    parsed: dict[str, Any] = {}
    if params:
        try:
            parsed = json.loads(params)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail={"error": "invalid_params_json"}) from exc
    return _lookup_state(endpoint, parsed)


@app.post("/v1/store/invalidate")
async def invalidate(req: InvalidateRequest):
    deleted = 0
    if req.cache_key:
        deleted += 1 if db.delete(req.cache_key) else 0
    if req.older_than:
        deleted += db.delete_older_than(req.older_than)
    if req.endpoint:
        deleted += 1 if db.delete(canonical_key(req.endpoint, req.params or {})) else 0
    return {"deleted": deleted}


@app.get("/v1/store/stats")
async def stats():
    s = db.stats()
    spent = int(s.get("credits_spent") or 0)
    s.update({"mode": _mode(), "sectors_key_configured": sectors.configured, "base_url": SETTINGS.sectors_base_url,
              "inflight": len(_inflight), "credit_start": SETTINGS.credit_start,
              "credit_remaining": SETTINGS.credit_start - spent})
    return s


@app.get("/v1/store/keys")
async def keys():
    return {"keys": db.all_keys()}


@app.get("/v1/health")
async def health():
    return {"ok": True, "service": "paham-emiten-store", "mode": _mode(), "sectors_key_configured": sectors.configured}


def seed_snapshot(directory: str) -> int:
    """Seed cache dari fixtures/snapshot/*.json (respons Sectors asli hasil tools/harvest.py)."""
    n = 0
    for f in sorted(Path(directory).glob("**/*.json")) if Path(directory).is_dir() else []:
        try:
            snap = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            log.warning("snapshot rusak dilewati: %s", f)
            continue
        if not isinstance(snap, dict) or "endpoint" not in snap or "data" not in snap:
            continue
        params = normalize_params(snap.get("params") or {})
        key = canonical_key(snap["endpoint"], params)
        n += db.seed(key, snap["endpoint"], params, snap["data"], int(snap.get("http_status", 200)),
                     int(snap.get("credits_spent", 0)), float(snap.get("fetched_at_epoch") or time.time()),
                     ttl_seconds(snap["endpoint"], SETTINGS.default_ttl_s))
    return n


@app.on_event("startup")
async def _startup():
    seeded = seed_snapshot(SETTINGS.snapshot_dir)
    if seeded:
        log.info("snapshot: %d entri di-seed ke cache dari %s", seeded, SETTINGS.snapshot_dir)


@app.on_event("shutdown")
async def _shutdown():
    await sectors.aclose()
