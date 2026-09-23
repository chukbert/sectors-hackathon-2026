"""Klien Store Service — agen TIDAK PERNAH menembak Sectors langsung (docs/STORE.md)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import SETTINGS

log = logging.getLogger("idxmaca.core.store")


class StoreError(RuntimeError):
    def __init__(self, status: int, detail: Any):
        super().__init__(f"store error {status}: {detail}")
        self.status = status
        self.detail = detail


class StoreClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or SETTINGS.store_url).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=60.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def lookup(self, endpoint: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        r = await self._client.post("/v1/store/lookup", json={"endpoint": endpoint, "params": params or {}})
        if r.status_code >= 400:
            raise StoreError(r.status_code, r.text[:300])
        return r.json()

    async def lookup_many(self, nodes: list[tuple[str, dict[str, Any]]]) -> list[dict[str, Any]]:
        out = []
        for endpoint, params in nodes:
            out.append(await self.lookup(endpoint, params))
        return out

    async def fetch(self, endpoint: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        r = await self._client.post("/v1/store/fetch", json={"endpoint": endpoint, "params": params or {}})
        if r.status_code >= 400:
            detail = r.text[:500]
            try:
                detail = r.json().get("detail", detail)
            except Exception:  # noqa: BLE001
                pass
            raise StoreError(r.status_code, detail)
        return r.json()

    async def stats(self) -> dict[str, Any]:
        r = await self._client.get("/v1/store/stats")
        r.raise_for_status()
        return r.json()

    async def health(self) -> dict[str, Any]:
        r = await self._client.get("/v1/health")
        r.raise_for_status()
        return r.json()


STORE = StoreClient()