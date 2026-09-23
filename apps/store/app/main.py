"""Store Service API — read-through cache wajib (docs/STORE.md).

POST /v1/store/fetch       jalur utama (hit → 0 kredit; miss → tembak + simpan)
POST /v1/store/lookup      cek kering gratis untuk estimasi planner
POST /v1/store/invalidate  bust cache
GET  /v1/store/stats       hit rate + kredit hemat (bahan demo)
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import SETTINGS
from .db import StoreDB
from .fixture_provider import respond as fixture_respond
from .keys import canonical_public, canonical_key, clamp_params, credit_cost, normalize_path
from .live_routes import translate
from .live_shapes import normalize as normalize_live_shape
from .sectors_client import SectorsClient, SectorsError
from .ttl import data_kind, ttl_seconds

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("idxmaca.store")

app = FastAPI(title="IDXMACA Store Service", version="0.1.0")
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
            "detail": "Endpoint internal ini belum dipetakan ke path resmi Sectors; permintaan tidak dikirim agar tidak membuang kredit (fail-closed).",
        }, 0, now
    live_endpoint, live_params = route
    status, body = await sectors.get(live_endpoint, live_params)
    credits = credit_cost(endpoint, params, status, body)
    if 200 <= status < 300:
        body = normalize_live_shape(endpoint, params, body)
    if status == 404:
        db.put(key, "GET", endpoint, params, body, status, credits, SETTINGS.negative_ttl_s, now, origin="live")
    elif 200 <= status < 300:
        db.put(key, "GET", endpoint, params, body, status, credits, ttl, now, origin="live")
    return status, body, credits, now


async def _fetch_via_fixture(endpoint: str, params: dict, key: str, ttl: int) -> tuple[int, Any, int, float]:
    result = fixture_respond(endpoint, params)
    now = time.time()
    if result is None:
        log.info("fixture miss: %s %s", normalize_path(endpoint), params)
        raise HTTPException(status_code=501, detail={
            "error": "fixture_unavailable",
            "endpoint": normalize_path(endpoint),
            "params": params,
            "detail": "Endpoint belum punya fixture pada mode demo. Jalankan mode live dengan SECTORS_API_KEY untuk data nyata.",
        })
    status, body = result
    if status == 200:
        db.put(key, "GET", endpoint, params, body, status, 0, ttl, now, origin="fixture")
    return status, body, 0, now


def _lookup_state(endpoint: str, params: dict) -> dict:
    clamped, warnings, error = clamp_params(endpoint, params)
    key = canonical_key(endpoint, clamped)
    row = db.get(key)
    est = credit_cost(endpoint, clamped)
    demo = _mode() in ("fixture", "offline")
    route = None if demo else translate(endpoint, clamped)
    if not demo and route is None:
        warnings = warnings + ["endpoint belum dipetakan ke path live Sectors — akan dilewati saat approve (fail-closed, 0 kredit)"]
    out = {
        **canonical_public(endpoint, clamped),
        "cache_key": key,
        "warnings": warnings,
        "invalid": bool(error),
        "error": error,
        "est_credits_live": 0 if demo else est,
        "live_path": route[0] if route else None,
        "live_ready": True if demo else route is not None,
        "data_kind": data_kind(endpoint),
        "ttl_s": ttl_seconds(endpoint, SETTINGS.default_ttl_s),
        "demo_mode": demo,
        "mode": _mode(),
    }
    usable = row and db.is_fresh(row) and not (row.get("origin") != "live" and _mode() == "live")
    if usable:
        out.update({"hit": True, "fresh": True, "fetched_at": row["fetched_at"], "expires_at": row["expires_at"],
                    "http_status": row["http_status"], "credits_spent": 0, "est_credits_live": 0,
                    "origin": row.get("origin")})
    elif row:
        out.update({"hit": True, "fresh": False, "fetched_at": row["fetched_at"], "expires_at": row["expires_at"],
                    "http_status": row["http_status"], "est_credits_live": est})
    else:
        out.update({"hit": False, "fresh": False, "fetched_at": None, "expires_at": None})
    return out


@app.post("/v1/store/fetch")
async def fetch(req: FetchRequest):
    clamped, warnings, error = clamp_params(req.endpoint, req.params)
    if error:
        raise HTTPException(status_code=400, detail={"error": "invalid_params", "detail": error, "warnings": warnings})
    key = canonical_key(req.endpoint, clamped)
    path = normalize_path(req.endpoint)
    ttl = ttl_seconds(req.endpoint, SETTINGS.default_ttl_s)

    row = db.get(key)
    if row and db.is_fresh(row) and not (row.get("origin") != "live" and _mode() == "live"):
        db.touch(key)
        spent_original = int(row.get("credits_spent") or 0)
        if spent_original > 0:
            db.record_saving(key, spent_original)
        return {"data": json.loads(row["response"]), **_provenance("store-hit", row["fetched_at"], 0, key, row["http_status"], warnings)}

    if _mode() == "offline":
        if row:
            return {"data": json.loads(row["response"]), **_provenance("store-hit-stale", row["fetched_at"], 0, key, row["http_status"], warnings + ["mode offline: memakai entri kedaluwarsa"])}
        raise HTTPException(status_code=503, detail={"error": "offline_no_cache", "endpoint": path, "params": clamped,
                                                    "detail": "Mode offline: belum ada di Store, data tidak dikarang."})

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
        return {"data": body, **_provenance("sectors-live" if credits and _mode() != "fixture" else "store-hit", now, credits, key, status, warnings + ["single-flight: menunggu penerbangan yang sama"])}

    try:
        if _mode() == "fixture" or (_mode() == "auto" and not sectors.configured):
            status, body, credits, now = await _fetch_via_fixture(req.endpoint, clamped, key, ttl)
            source, origin = ("fixture", "fixture")
        else:
            try:
                status, body, credits, now = await _fetch_live(req.endpoint, clamped, key, ttl)
                source, origin = "sectors-live", "live"
            except SectorsError as exc:
                if SETTINGS.allow_fixture_fallback and _mode() == "auto":
                    log.warning("live gagal (%s), fallback ke fixture", exc.message)
                    status, body, credits, now = await _fetch_via_fixture(req.endpoint, clamped, key, ttl)
                    source, origin = "fixture", "fixture-fallback"
                else:
                    raise HTTPException(status_code=502, detail={"error": "sectors_unreachable", "detail": exc.message}) from exc
        fut.set_result((status, body, credits, now))
        return {"data": body, **_provenance(source, now, credits, key, status, warnings, origin)}
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
        clamped, warnings, error = clamp_params(req.endpoint, req.params or {})
        if error:
            raise HTTPException(status_code=400, detail={"error": "invalid_params", "detail": error})
        key = canonical_key(req.endpoint, clamped)
        deleted += 1 if db.delete(key) else 0
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
    return {"ok": True, "service": "idxmaca-store", "mode": _mode(), "sectors_key_configured": sectors.configured}


@app.on_event("shutdown")
async def _shutdown():
    await sectors.aclose()