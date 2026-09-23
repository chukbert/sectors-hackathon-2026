"""Klien Sectors API — hanya dipakai Store Service. Key tidak pernah keluar dari sini."""
from __future__ import annotations

import asyncio
import logging

import httpx

from .config import SETTINGS

log = logging.getLogger("idxmaca.store.sectors")


class SectorsError(Exception):
    def __init__(self, status: int, body, message: str):
        super().__init__(message)
        self.status = status
        self.body = body
        self.message = message


def auth_header(scheme: str | None, api_key: str | None) -> str | None:
    """Sectors memakai apiKey mentah di header Authorization; skema opsional (mis. Bearer)."""
    if not api_key:
        return None
    s = (scheme or "").strip()
    return f"{s} {api_key}".strip() if s else api_key


class SectorsClient:
    def __init__(self, settings=SETTINGS):
        self.settings = settings
        headers = {"Accept": "application/json", "User-Agent": "IDXMACA-Store/0.1"}
        auth = auth_header(settings.auth_scheme, settings.sectors_api_key)
        if auth:
            headers["Authorization"] = auth
        self._client = httpx.AsyncClient(base_url=settings.sectors_base_url, headers=headers, timeout=settings.timeout_s)

    @property
    def configured(self) -> bool:
        return bool(self.settings.sectors_api_key)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get(self, endpoint: str, params: dict | None = None) -> tuple[int, object]:
        """GET dengan retry backoff untuk 429/5xx (STORE.md §5). 4xx lain langsung dikembalikan."""
        attempt = 0
        delay = 0.8
        last_exc: Exception | None = None
        while attempt <= self.settings.max_retries:
            try:
                r = await self._client.get(endpoint, params=params or {})
                if r.status_code == 429 or r.status_code >= 500:
                    if attempt == self.settings.max_retries:
                        try:
                            return r.status_code, r.json()
                        except ValueError:
                            return r.status_code, {"error": "upstream_error", "text": r.text[:500]}
                    await asyncio.sleep(delay)
                    delay *= 2
                    attempt += 1
                    continue
                try:
                    return r.status_code, r.json()
                except ValueError:
                    return r.status_code, {"error": "invalid_json", "text": r.text[:500]}
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                if attempt == self.settings.max_retries:
                    break
                await asyncio.sleep(delay)
                delay *= 2
                attempt += 1
        raise SectorsError(502, {"error": "upstream_unreachable"}, f"gagal menghubungi Sectors: {last_exc}")